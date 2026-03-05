import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled } from '../openai.js';
import { searchDocumentChunks, buildRAGContext } from '../rag.js';
import { isGeminiEnabled } from '../gemini.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import type { OpenAIMessage } from '../types/index.js';
import {
  DEAL_ANALYST_PROMPT,
  DEAL_UPDATE_TOOLS,
  buildKeywordContext,
  generateFallbackResponse,
} from '../services/chatHelpers.js';

const router = Router();

// POST /api/deals/:dealId/chat - Send a message to AI about this deal
router.post('/:dealId/chat', async (req, res) => {
  log.debug('Chat request received', { dealId: req.params.dealId, aiEnabled: isAIEnabled() });

  try {
    const { dealId } = req.params;
    const { message, history = [] } = req.body;
    const user = req.user;

    log.debug('Chat message', { messagePreview: message?.substring(0, 50) });

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get deal with context including team members
    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .select(`
        id, name, stage, status, industry, dealSize, revenue, ebitda,
        irrProjected, mom, aiThesis, description, source,
        company:Company(id, name, description, industry),
        documents:Document(id, name, type, extractedText, embeddingStatus),
        teamMembers:DealTeamMember(
          id,
          role,
          user:User(id, name, email, title)
        )
      `)
      .eq('id', dealId)
      .single();

    if (dealError) {
      if (dealError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Deal not found' });
      }
      throw dealError;
    }

    // Fetch available users for assignment
    const { data: availableUsers } = await supabase
      .from('User')
      .select('id, name, email, title, role')
      .order('name');

    // Build deal context
    const contextParts = [`Deal: ${deal.name}`];
    contextParts.push(`Stage: ${deal.stage}`);
    if (deal.industry) contextParts.push(`Industry: ${deal.industry}`);
    if (deal.dealSize) contextParts.push(`Deal Size: $${deal.dealSize}M`);
    if (deal.revenue) contextParts.push(`Revenue: $${deal.revenue}M`);
    if (deal.ebitda) contextParts.push(`EBITDA: $${deal.ebitda}M`);
    if (deal.irrProjected) contextParts.push(`Projected IRR: ${deal.irrProjected}%`);
    if (deal.mom) contextParts.push(`MoM: ${deal.mom}x`);
    if (deal.source) contextParts.push(`Deal Source: ${deal.source}`);
    if (deal.aiThesis) contextParts.push(`\nInvestment Thesis: ${deal.aiThesis}`);

    // Add current team members
    const teamMembers = deal.teamMembers as any[];
    if (teamMembers && teamMembers.length > 0) {
      contextParts.push(`\n--- CURRENT TEAM ---`);
      const leadPartner = teamMembers.find((m: any) => m.role === 'LEAD');
      const analysts = teamMembers.filter((m: any) => m.role === 'MEMBER');
      if (leadPartner?.user) {
        contextParts.push(`Lead Partner: ${leadPartner.user.name} (ID: ${leadPartner.user.id})`);
      }
      if (analysts.length > 0) {
        analysts.forEach((a: any) => {
          if (a.user) contextParts.push(`Analyst: ${a.user.name} (ID: ${a.user.id})`);
        });
      }
    }

    // Add available users for assignment
    if (availableUsers && availableUsers.length > 0) {
      contextParts.push(`\n--- AVAILABLE TEAM MEMBERS ---`);
      availableUsers.forEach((u: any) => {
        contextParts.push(`- ${u.name} (ID: ${u.id}, ${u.title || u.role || 'Team Member'})`);
      });
    }

    const company = deal.company as any;
    if (company) {
      contextParts.push(`\nCompany: ${company.name}`);
      if (company.description) contextParts.push(`Description: ${company.description}`);
    }

    // Use RAG for semantic document search if Gemini is enabled
    let documentContext = '';
    if (deal.documents?.length > 0) {
      if (isGeminiEnabled()) {
        log.debug('RAG searching document chunks', { dealId });
        const searchResults = await searchDocumentChunks(message, dealId, 10, 0.4);

        if (searchResults.length > 0) {
          log.debug('RAG found relevant chunks', { count: searchResults.length });
          documentContext = buildRAGContext(searchResults, deal.documents);
        } else {
          log.debug('RAG no semantic matches, falling back to keyword search');
          documentContext = buildKeywordContext(message, deal.documents);
        }
      } else {
        documentContext = buildKeywordContext(message, deal.documents);
      }
    } else {
      documentContext = '(No documents uploaded to this deal yet)';
    }

    contextParts.push(`\n--- DOCUMENT CONTENTS ---`);
    contextParts.push(documentContext);

    const dealContext = contextParts.join('\n');

    // Check if AI is enabled
    if (!isAIEnabled() || !openai) {
      return res.json({
        response: generateFallbackResponse(message, deal),
        model: 'fallback',
      });
    }

    // Build messages for OpenAI
    const messages: OpenAIMessage[] = [
      { role: 'system', content: DEAL_ANALYST_PROMPT },
      { role: 'system', content: `Current Deal Context:\n${dealContext}` },
    ];

    // Add conversation history (last 10 messages)
    history.slice(-10).forEach((msg: OpenAIMessage) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call OpenAI with function calling
    log.debug('Calling OpenAI', { messageCount: messages.length });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: DEAL_UPDATE_TOOLS,
      tool_choice: 'auto',
      max_tokens: 1500,
      temperature: 0.7,
    });

    log.debug('OpenAI response received');
    const responseMessage = completion.choices[0]?.message;

    // Check if AI wants to call a function
    let updatedFields: any[] = [];
    let suggestedAction: any = null;

    if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
      for (const toolCall of responseMessage.tool_calls) {
        if (!('function' in toolCall) || !toolCall.function) continue;

        if (toolCall.function.name === 'suggest_action') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            log.debug('Processing suggest_action', args);

            let url = '';
            switch (args.action_type) {
              case 'create_memo':
                url = `/memo-builder.html?dealId=${dealId}&project=${encodeURIComponent(deal.name)}`;
                break;
              case 'open_data_room':
                url = `/vdr.html?dealId=${dealId}`;
                break;
              case 'upload_document':
                url = `/vdr.html?dealId=${dealId}&action=upload`;
                break;
              case 'view_financials':
                url = `/deal.html?id=${dealId}#financials`;
                break;
              case 'change_stage':
                url = `/deal.html?id=${dealId}&action=change_stage`;
                break;
            }

            suggestedAction = {
              type: args.action_type,
              label: args.label,
              description: args.description,
              url,
            };
          } catch (parseError) {
            log.error('Error processing suggest_action', parseError);
          }
          continue;
        }

        if (toolCall.function.name === 'update_deal_field') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const { field, value, userName } = args;

            log.debug('Processing deal update', { field, value, userName });

            if (field === 'leadPartner' || field === 'analyst') {
              const role = field === 'leadPartner' ? 'LEAD' : 'MEMBER';

              const { data: existingMember } = await supabase
                .from('DealTeamMember')
                .select('id')
                .eq('dealId', dealId)
                .eq('userId', value)
                .single();

              if (existingMember) {
                await supabase
                  .from('DealTeamMember')
                  .update({ role })
                  .eq('id', existingMember.id);
              } else {
                await supabase
                  .from('DealTeamMember')
                  .insert({
                    dealId,
                    userId: value,
                    role,
                  });
              }

              await supabase
                .from('Deal')
                .update({ updatedAt: new Date().toISOString() })
                .eq('id', dealId);

              await supabase.from('Activity').insert({
                dealId,
                type: 'TEAM_MEMBER_ADDED',
                title: `${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'} Updated`,
                description: `${userName || 'Team member'} assigned as ${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'}`,
              });

              updatedFields.push({ field, value, userName, success: true });
            } else {
              const updateData: any = {};
              updateData[field] = value;
              updateData.updatedAt = new Date().toISOString();

              await supabase
                .from('Deal')
                .update(updateData)
                .eq('id', dealId);

              await supabase.from('Activity').insert({
                dealId,
                type: 'STATUS_UPDATED',
                title: `${field.charAt(0).toUpperCase() + field.slice(1)} Updated`,
                description: `Changed to: ${value}`,
              });

              updatedFields.push({ field, value, success: true });
            }
          } catch (parseError) {
            log.error('Error processing tool call', parseError);
            updatedFields.push({ field: 'unknown', success: false, error: 'Failed to process update' });
          }
        }
      }

      // Get a follow-up response from AI confirming the update
      messages.push({
        role: 'assistant',
        content: responseMessage.content || '',
        tool_calls: responseMessage.tool_calls as any,
      } as any);

      // Add tool results
      for (const toolCall of responseMessage.tool_calls) {
        if (!('function' in toolCall) || !toolCall.function) continue;
        const update = updatedFields.find(u => u.field === JSON.parse(toolCall.function.arguments).field);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(update || { success: true }),
        } as any);
      }

      // Get final response
      const followUp = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const aiResponse = followUp.choices[0]?.message?.content || 'Update completed successfully.';

      // Save messages to database for history
      const userId = req.user?.id || null;
      log.debug('Saving chat messages (with updates) to database', { dealId, userId });

      const { error: userMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'user',
        content: message,
      });
      if (userMsgError) {
        log.error('Failed to save user message (with updates)', userMsgError);
      }

      const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'assistant',
        content: aiResponse,
        metadata: { model: 'gpt-4o', updates: updatedFields },
      });
      if (aiMsgError) {
        log.error('Failed to save AI message (with updates)', aiMsgError);
      }

      await AuditLog.aiChat(req, `Deal: ${deal.name} (with updates)`);

      return res.json({
        response: aiResponse,
        model: 'gpt-4o',
        updates: updatedFields,
        ...(suggestedAction && { action: suggestedAction }),
      });
    }

    // If only suggest_action was called (no field updates), return the AI's message with the action
    if (suggestedAction && updatedFields.length === 0) {
      const aiResponse = responseMessage?.content || 'Here\'s what I can help you with:';

      const userId = req.user?.id || null;
      log.debug('Saving chat messages (with action) to database', { dealId, userId });

      const { error: userMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'user',
        content: message,
      });
      if (userMsgError) {
        log.error('Failed to save user message (with action)', userMsgError);
      }

      const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
        dealId,
        userId,
        role: 'assistant',
        content: aiResponse,
        metadata: { model: 'gpt-4o', action: suggestedAction },
      });
      if (aiMsgError) {
        log.error('Failed to save AI message (with action)', aiMsgError);
      }

      await AuditLog.aiChat(req, `Deal: ${deal.name} (with action)`);

      return res.json({
        response: aiResponse,
        model: 'gpt-4o',
        action: suggestedAction,
      });
    }

    const aiResponse = responseMessage?.content || 'I apologize, I was unable to generate a response.';

    // Save messages to database for history
    const userId = req.user?.id || null;
    log.debug('Saving chat messages to database', { dealId, userId });

    const { error: userMsgError } = await supabase.from('ChatMessage').insert({
      dealId,
      role: 'user',
      content: message,
    });
    if (userMsgError) {
      log.error('Failed to save user message', userMsgError);
    }

    const { error: aiMsgError } = await supabase.from('ChatMessage').insert({
      dealId,
      role: 'assistant',
      content: aiResponse,
      metadata: { model: 'gpt-4o' },
    });
    if (aiMsgError) {
      log.error('Failed to save AI message', aiMsgError);
    }

    await AuditLog.aiChat(req, `Deal: ${deal.name}`);

    res.json({
      response: aiResponse,
      model: 'gpt-4o',
      ...(suggestedAction && { action: suggestedAction }),
    });
  } catch (error) {
    log.error('Error in deal chat', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;
