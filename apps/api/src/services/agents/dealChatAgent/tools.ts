// ─── LangChain Tools for Deal Chat Agent ───────────────────────────
// Tools are created per-request with dealId/orgId baked into closures
// so the LLM only needs to pass query-specific parameters.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../supabase.js';
import { searchDocumentChunks, buildRAGContext, isRAGEnabled } from '../../../rag.js';
import { log } from '../../../utils/logger.js';
import { generateMeetingPrep } from '../meetingPrep/index.js';
import { generateEmailDraft } from '../emailDrafter/index.js';
import { analyzeFinancials } from '../../analysis/index.js';

/** Create all deal chat tools with dealId/orgId baked in via closures */
export function getDealChatTools(dealId: string, orgId: string) {

  const searchDocumentsTool = tool(
    async ({ query }) => {
      try {
        if (!isRAGEnabled()) {
          const { data: docs } = await supabase
            .from('Document')
            .select('id, name, type, extractedText')
            .eq('dealId', dealId)
            .not('extractedText', 'is', null);

          if (!docs || docs.length === 0) return 'No documents found for this deal.';

          const queryLower = query.toLowerCase();
          const relevant = docs.filter(d =>
            d.extractedText?.toLowerCase().includes(queryLower) ||
            d.name.toLowerCase().includes(queryLower)
          );

          if (relevant.length === 0) return 'No relevant content found in documents.';

          return relevant.map(d => {
            const text = d.extractedText || '';
            const idx = text.toLowerCase().indexOf(queryLower);
            const start = Math.max(0, idx - 200);
            const end = Math.min(text.length, idx + queryLower.length + 500);
            return `### ${d.name}\n${text.slice(start, end)}`;
          }).join('\n\n');
        }

        const searchResults = await searchDocumentChunks(query, dealId, 8, 0.4);
        if (searchResults.length === 0) return 'No relevant content found in documents.';

        const { data: docs } = await supabase
          .from('Document')
          .select('id, name, type')
          .eq('dealId', dealId);

        return buildRAGContext(searchResults, docs || []);
      } catch (error) {
        log.error('searchDocuments tool error', error);
        return 'Error searching documents.';
      }
    },
    {
      name: 'search_documents',
      description: 'Search through all uploaded deal documents using semantic search. Use this when the user asks about specific information from documents, CIMs, financial reports, etc.',
      schema: z.object({
        query: z.string().describe('The search query — what information to find in the documents'),
      }),
    }
  );

  const getDealFinancialsTool = tool(
    async () => {
      try {
        // Fetch ALL statements (active + inactive/needs_review) so chat sees what the user sees
        const { data: statements } = await supabase
          .from('FinancialStatement')
          .select('statementType, period, extractedData, confidence, extractionSource, isActive')
          .eq('dealId', dealId)
          .order('period', { ascending: false });

        if (!statements || statements.length === 0) {
          return 'No financial statements extracted for this deal yet.';
        }

        const activeStatements = statements.filter(s => s.isActive);
        const inactiveStatements = statements.filter(s => !s.isActive);

        const summary: string[] = [`Found ${statements.length} financial statements (${activeStatements.length} active, ${inactiveStatements.length} pending review):`];

        // Group by type
        const byType: Record<string, typeof statements> = {};
        for (const s of statements) {
          byType[s.statementType] = byType[s.statementType] || [];
          byType[s.statementType].push(s);
        }

        for (const [type, stmts] of Object.entries(byType)) {
          summary.push(`\n**${type}** (${stmts.length} periods):`);
          for (const s of stmts.slice(0, 5)) {
            const data = s.extractedData as any;
            const items = Array.isArray(data) ? data : [];
            const revenue = items.find((i: any) => i.label?.toLowerCase().includes('revenue'));
            const ebitda = items.find((i: any) => i.label?.toLowerCase().includes('ebitda'));
            const lineCount = items.length;
            const statusNote = s.isActive ? '' : ' (pending merge review)';

            summary.push(`  - ${s.period}: ${lineCount} line items, confidence ${s.confidence}%, source: ${s.extractionSource}${statusNote}`);
            if (revenue) summary.push(`    Revenue: $${revenue.value}M`);
            if (ebitda) summary.push(`    EBITDA: $${ebitda.value}M`);
          }
        }

        // Also fetch deal-level financial metrics
        const { data: deal } = await supabase
          .from('Deal')
          .select('revenue, ebitda, dealSize, irrProjected, mom')
          .eq('id', dealId)
          .single();

        if (deal) {
          summary.push('\n**Deal-Level Metrics:**');
          if (deal.revenue) summary.push(`  Revenue: $${deal.revenue}M`);
          if (deal.ebitda) summary.push(`  EBITDA: $${deal.ebitda}M`);
          if (deal.dealSize) summary.push(`  Deal Size: $${deal.dealSize}M`);
          if (deal.irrProjected) summary.push(`  Projected IRR: ${deal.irrProjected}%`);
          if (deal.mom) summary.push(`  MoM: ${deal.mom}x`);
        }

        return summary.join('\n');
      } catch (error) {
        log.error('getDealFinancials tool error', error);
        return 'Error fetching financial data.';
      }
    },
    {
      name: 'get_deal_financials',
      description: 'Fetch extracted financial statements and deal-level metrics (revenue, EBITDA, IRR, MoM). Use when user asks about financials, numbers, revenue trends, or analysis.',
      schema: z.object({}),
    }
  );

  const compareDealsTool = tool(
    async ({ targetDealName }) => {
      try {
        // Get current deal
        const { data: currentDeal } = await supabase
          .from('Deal')
          .select('id, name, industry, revenue, ebitda, dealSize, irrProjected, mom, stage')
          .eq('id', dealId)
          .single();

        if (!currentDeal) return 'Deal not found.';

        // Get all comparable deals in the org
        const { data: allOrgDeals } = await supabase
          .from('Deal')
          .select('id, name, industry, revenue, ebitda, dealSize, irrProjected, mom, stage')
          .eq('organizationId', orgId)
          .neq('id', dealId)
          .order('updatedAt', { ascending: false })
          .limit(20);

        if (!allOrgDeals || allOrgDeals.length === 0) return 'No other deals in the portfolio to compare against.';

        // If user asked to compare with a specific deal, find it
        let targetDeal = null;
        if (targetDealName) {
          const nameSearch = targetDealName.toLowerCase();
          targetDeal = allOrgDeals.find(d => d.name.toLowerCase().includes(nameSearch));

          if (!targetDeal) {
            // Also search by exact match in DB (might be in a different org scope or inactive)
            const { data: found } = await supabase
              .from('Deal')
              .select('id, name, industry, revenue, ebitda, dealSize, irrProjected, mom, stage')
              .eq('organizationId', orgId)
              .ilike('name', `%${targetDealName}%`)
              .limit(1);
            targetDeal = found?.[0] || null;
          }
        }

        const parts: string[] = [`**Comparison: ${currentDeal.name}**\n`];

        // Current deal metrics
        parts.push('**Current Deal:**');
        parts.push(`  Industry: ${currentDeal.industry || 'N/A'}, Revenue: $${currentDeal.revenue || 0}M, EBITDA: $${currentDeal.ebitda || 0}M`);
        parts.push(`  Deal Size: $${currentDeal.dealSize || 0}M, IRR: ${currentDeal.irrProjected || 'N/A'}%, MoM: ${currentDeal.mom || 'N/A'}x\n`);

        // Specific deal comparison if requested
        if (targetDeal) {
          parts.push(`**${targetDeal.name}:**`);
          parts.push(`  Industry: ${targetDeal.industry || 'N/A'}, Revenue: $${targetDeal.revenue || 0}M, EBITDA: $${targetDeal.ebitda || 0}M`);
          parts.push(`  Deal Size: $${targetDeal.dealSize || 0}M, IRR: ${targetDeal.irrProjected || 'N/A'}%, MoM: ${targetDeal.mom || 'N/A'}x`);
          parts.push(`  Stage: ${targetDeal.stage}\n`);
        } else if (targetDealName) {
          parts.push(`Note: Could not find a deal matching "${targetDealName}" in the portfolio.\n`);
        }

        // Portfolio averages
        const withRevenue = allOrgDeals.filter(d => d.revenue);
        const withEbitda = allOrgDeals.filter(d => d.ebitda);
        const avgRevenue = withRevenue.length > 0 ? withRevenue.reduce((s, d) => s + (d.revenue || 0), 0) / withRevenue.length : 0;
        const avgEbitda = withEbitda.length > 0 ? withEbitda.reduce((s, d) => s + (d.ebitda || 0), 0) / withEbitda.length : 0;

        parts.push(`**Portfolio Averages (${allOrgDeals.length} deals):**`);
        parts.push(`  Avg Revenue: $${avgRevenue.toFixed(1)}M, Avg EBITDA: $${avgEbitda.toFixed(1)}M`);

        const sameIndustry = allOrgDeals.filter(d => d.industry === currentDeal.industry);
        if (sameIndustry.length > 0) {
          parts.push(`\n**Same Industry (${currentDeal.industry}, ${sameIndustry.length} deals):**`);
          for (const d of sameIndustry.slice(0, 5)) {
            parts.push(`  - ${d.name}: Revenue $${d.revenue || 0}M, EBITDA $${d.ebitda || 0}M, ${d.stage}`);
          }
        }

        // Percentile rankings
        if (currentDeal.revenue && withRevenue.length >= 3) {
          const rank = withRevenue.filter(d => (d.revenue || 0) < currentDeal.revenue!).length;
          const percentile = Math.round((rank / withRevenue.length) * 100);
          parts.push(`\nRevenue Percentile: ${percentile}th (${rank + 1} of ${withRevenue.length + 1})`);
        }

        return parts.join('\n');
      } catch (error) {
        log.error('compareDeals tool error', error);
        return 'Error comparing deals.';
      }
    },
    {
      name: 'compare_deals',
      description: 'Compare the current deal against other deals in the portfolio. Optionally compare with a specific deal by name. Shows metrics side-by-side, portfolio averages, and rankings.',
      schema: z.object({
        targetDealName: z.string().optional().describe('Name of a specific deal to compare against (e.g., "Neen AI", "Buffer"). Leave empty for general portfolio comparison.'),
      }),
    }
  );

  const getDealActivityTool = tool(
    async ({ limit }) => {
      try {
        const { data: activities } = await supabase
          .from('Activity')
          .select('type, title, description, createdAt')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false })
          .limit(limit || 15);

        if (!activities || activities.length === 0) return 'No activities recorded for this deal.';

        const parts: string[] = [`**Recent Activity (${activities.length} items):**\n`];

        for (const a of activities) {
          const date = new Date(a.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          });
          parts.push(`- [${date}] **${a.type}**: ${a.title}${a.description ? ` — ${a.description}` : ''}`);
        }

        return parts.join('\n');
      } catch (error) {
        log.error('getDealActivity tool error', error);
        return 'Error fetching activity.';
      }
    },
    {
      name: 'get_deal_activity',
      description: 'Fetch recent activity timeline for the deal — document uploads, status changes, team updates, chat history, etc.',
      schema: z.object({
        limit: z.number().optional().describe('Max activities to return (default 15)'),
      }),
    }
  );

  const updateDealFieldTool = tool(
    async ({ field, value, userName }) => {
      try {
        if (field === 'leadPartner' || field === 'analyst') {
          const role = field === 'leadPartner' ? 'LEAD' : 'MEMBER';

          // The LLM tends to pass a name ("Pushkar") instead of a UUID even
          // though the schema description asks for an ID. Resolve to a real
          // userId here — UUID stays as-is, email matches an exact user,
          // anything else is treated as a name (case-insensitive exact, then
          // contains-fallback). All scoped to the same org.
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          let resolvedUserId: string | null = null;
          let resolvedName: string | null = userName ?? null;
          if (UUID_RE.test(value)) {
            const { data } = await supabase
              .from('User')
              .select('id, name')
              .eq('id', value)
              .eq('organizationId', orgId)
              .maybeSingle();
            if (data) {
              resolvedUserId = data.id;
              resolvedName = resolvedName ?? data.name;
            }
          } else if (value.includes('@')) {
            const { data } = await supabase
              .from('User')
              .select('id, name')
              .ilike('email', value)
              .eq('organizationId', orgId)
              .maybeSingle();
            if (data) {
              resolvedUserId = data.id;
              resolvedName = resolvedName ?? data.name;
            }
          } else {
            // Try exact (case-insensitive) match first.
            const { data: exact } = await supabase
              .from('User')
              .select('id, name')
              .ilike('name', value)
              .eq('organizationId', orgId)
              .limit(1)
              .maybeSingle();
            if (exact) {
              resolvedUserId = exact.id;
              resolvedName = resolvedName ?? exact.name;
            } else {
              // Fall back to substring match — e.g. "Pushkar" matches "Pushkar Rathod".
              const { data: fuzzy } = await supabase
                .from('User')
                .select('id, name')
                .ilike('name', `%${value}%`)
                .eq('organizationId', orgId)
                .limit(2);
              if (fuzzy && fuzzy.length === 1) {
                resolvedUserId = fuzzy[0].id;
                resolvedName = resolvedName ?? fuzzy[0].name;
              } else if (fuzzy && fuzzy.length > 1) {
                return JSON.stringify({
                  success: false,
                  error: `"${value}" matches multiple users (${fuzzy.map(u => u.name).join(', ')}). Be more specific.`,
                });
              }
            }
          }

          if (!resolvedUserId) {
            return JSON.stringify({
              success: false,
              error: `Could not find a team member matching "${value}". Try the user's full name or email.`,
            });
          }

          const { data: existingMember } = await supabase
            .from('DealTeamMember')
            .select('id')
            .eq('dealId', dealId)
            .eq('userId', resolvedUserId)
            .maybeSingle();

          if (existingMember) {
            const { error: updErr } = await supabase
              .from('DealTeamMember')
              .update({ role })
              .eq('id', existingMember.id);
            if (updErr) {
              log.error('updateDealField team-role update failed', updErr);
              return JSON.stringify({ success: false, error: 'Failed to update team member role.' });
            }
          } else {
            const { error: insErr } = await supabase
              .from('DealTeamMember')
              .insert({ dealId, userId: resolvedUserId, role });
            if (insErr) {
              log.error('updateDealField team-member insert failed', insErr);
              return JSON.stringify({ success: false, error: 'Failed to add team member.' });
            }
          }

          // The deal page UI reads Lead Partner from Deal.assignedTo (relation
          // exposed as `assignedUser`), and Analyst from team members where
          // role=MEMBER. So:
          //   - leadPartner → also UPDATE Deal.assignedTo = userId
          //   - analyst    → no extra Deal update (DealTeamMember row is the
          //     source of truth, already updated above)
          // (There are no Deal.leadPartnerId / Deal.analystId columns —
          // confirmed via routes/deals.ts and the deal-layout.tsx renderer.)
          const dealUpdate: Record<string, string> =
            field === 'leadPartner'
              ? { assignedTo: resolvedUserId, updatedAt: new Date().toISOString() }
              : { updatedAt: new Date().toISOString() };
          const { error: dealErr } = await supabase
            .from('Deal')
            .update(dealUpdate)
            .eq('id', dealId)
            .eq('organizationId', orgId);
          if (dealErr) {
            log.error('updateDealField deal-row update failed', dealErr);
            return JSON.stringify({ success: false, error: 'Failed to persist on the deal record.' });
          }

          await supabase.from('Activity').insert({
            dealId,
            type: 'TEAM_MEMBER_ADDED',
            title: `${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'} Updated`,
            description: `${resolvedName || 'Team member'} assigned as ${field === 'leadPartner' ? 'Lead Partner' : 'Analyst'}`,
          });

          return JSON.stringify({ success: true, field, value: resolvedUserId, userName: resolvedName });
        }

        const updateData: Record<string, any> = {};
        const numericFields = ['revenue', 'ebitda', 'dealSize', 'irrProjected', 'mom', 'grossMargin'];
        updateData[field] = numericFields.includes(field) ? parseFloat(value) : value;
        updateData.updatedAt = new Date().toISOString();

        await supabase.from('Deal').update(updateData).eq('id', dealId);

        await supabase.from('Activity').insert({
          dealId,
          type: 'STATUS_UPDATED',
          title: `${field.charAt(0).toUpperCase() + field.slice(1)} Updated`,
          description: `Changed to: ${value}`,
        });

        return JSON.stringify({ success: true, field, value });
      } catch (error) {
        log.error('updateDealField tool error', error);
        return JSON.stringify({ success: false, error: 'Failed to update deal field' });
      }
    },
    {
      name: 'update_deal_field',
      description: 'Update a field on the current deal. Use when the user asks to change deal properties like name, metrics, team assignments, etc.',
      schema: z.object({
        field: z.enum([
          'leadPartner', 'analyst', 'source', 'priority', 'industry', 'description',
          'name', 'currency', 'revenue', 'ebitda', 'dealSize', 'irrProjected', 'mom',
          'targetCloseDate', 'grossMargin',
        ]),
        value: z.string().describe('New value. For leadPartner/analyst this can be a user ID, email, or full name — the tool resolves it to a real org member and returns an error if no unique match. For numeric fields (revenue, ebitda, dealSize, irrProjected, mom, grossMargin) pass the number in millions. For targetCloseDate use ISO date (YYYY-MM-DD).'),
        userName: z.string().optional().describe('Name of user being assigned (for confirmation message)'),
      }),
    }
  );

  const changeDealStageTool = tool(
    async ({ stage, reason }) => {
      try {
        const { data: deal } = await supabase
          .from('Deal')
          .select('stage')
          .eq('id', dealId)
          .single();

        if (!deal) return JSON.stringify({ success: false, error: 'Deal not found' });

        const previousStage = deal.stage;
        if (previousStage === stage) {
          return JSON.stringify({ success: false, error: `Deal is already at stage: ${stage}` });
        }

        await supabase
          .from('Deal')
          .update({ stage, updatedAt: new Date().toISOString() })
          .eq('id', dealId);

        await supabase.from('Activity').insert({
          dealId,
          type: 'STAGE_CHANGED',
          title: 'Deal Stage Changed',
          description: `${previousStage} → ${stage}${reason ? '. Reason: ' + reason : ''}`,
        });

        return JSON.stringify({ success: true, field: 'stage', value: stage, previousStage });
      } catch (error) {
        log.error('changeDealStage tool error', error);
        return JSON.stringify({ success: false, error: 'Failed to change deal stage' });
      }
    },
    {
      name: 'change_deal_stage',
      description: 'Change the deal pipeline stage. Use when the user asks to advance, move back, or close a deal. Stages flow: INITIAL_REVIEW → DUE_DILIGENCE → IOI_SUBMITTED → LOI_NEGOTIATION → CLOSING → CLOSED_WON. Terminal stages: CLOSED_WON, CLOSED_LOST, PASSED.',
      schema: z.object({
        stage: z.enum([
          'INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED',
          'LOI_NEGOTIATION', 'CLOSING', 'CLOSED_WON', 'CLOSED_LOST', 'PASSED',
        ]),
        reason: z.string().optional().describe('Optional reason for the stage change'),
      }),
    }
  );

  const suggestActionTool = tool(
    async ({ actionType, label, description }) => {
      // Routes are web-next paths (not legacy /vdr or /deal.html). Tabs on the
      // deal page are state, not URL — there's no `#financials` route, so we
      // just send users to the deal page and rely on the user to click the
      // right tab. (A future improvement: real route segments per tab.)
      const urlMap: Record<string, string> = {
        create_memo: `/memo-builder?dealId=${dealId}`,
        open_data_room: `/data-room/${dealId}`,
        upload_document: `/data-room/${dealId}`,
        view_financials: `/deals/${dealId}`,
        change_stage: `/deals/${dealId}`,
      };

      return JSON.stringify({
        type: actionType,
        label,
        description,
        url: urlMap[actionType] || `/deals/${dealId}`,
      });
    },
    {
      name: 'suggest_action',
      description: 'Suggest navigation to another page: create memo, open data room, upload document, view financials, change deal stage.',
      schema: z.object({
        actionType: z.enum(['create_memo', 'open_data_room', 'upload_document', 'view_financials', 'change_stage']),
        label: z.string().describe('Button label text'),
        description: z.string().optional().describe('Brief explanation of what happens'),
      }),
    }
  );

  // ─── Phase 3: Action Tools ─────────────────────────────────────────

  const addNoteTool = tool(
    async ({ content, type }) => {
      try {
        await supabase.from('Activity').insert({
          dealId,
          type: type || 'NOTE_ADDED',
          title: type === 'CALL_LOGGED' ? 'Call Logged' : type === 'EMAIL_SENT' ? 'Email Logged' : type === 'MEETING_SCHEDULED' ? 'Meeting Scheduled' : 'Note Added',
          description: content,
        });
        return JSON.stringify({ success: true, type: 'note_added' });
      } catch (error) {
        log.error('addNote tool error', error);
        return JSON.stringify({ success: false, error: 'Failed to add note' });
      }
    },
    {
      name: 'add_note',
      description: 'Add a note, call log, email log, or meeting note to the deal activity feed.',
      schema: z.object({
        content: z.string().describe('The note content'),
        type: z.enum(['NOTE_ADDED', 'CALL_LOGGED', 'EMAIL_SENT', 'MEETING_SCHEDULED']).default('NOTE_ADDED').describe('Type of activity'),
      }),
    }
  );

  const triggerFinancialExtractionTool = tool(
    async () => {
      try {
        const { data: docs } = await supabase
          .from('Document')
          .select('id, name, type, fileUrl')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false })
          .limit(5);

        if (!docs || docs.length === 0) {
          return 'No documents found for this deal. Please upload a CIM or financial document first.';
        }

        // Find the best document for extraction
        const financialDoc = docs.find(d => d.type === 'FINANCIALS' || d.type === 'CIM') || docs[0];

        return JSON.stringify({
          success: true,
          type: 'extraction_triggered',
          documentName: financialDoc.name,
          message: `Financial extraction queued for "${financialDoc.name}". Use the Extract Financials button on the page to run it, or navigate to the financials section.`,
        });
      } catch (error) {
        log.error('triggerFinancialExtraction tool error', error);
        return JSON.stringify({ success: false, error: 'Failed to trigger extraction' });
      }
    },
    {
      name: 'trigger_financial_extraction',
      description: 'Check which documents are available for financial extraction and guide the user to trigger it.',
      schema: z.object({}),
    }
  );

  const generateMeetingPrepTool = tool(
    async ({ attendees, topics }) => {
      try {
        const brief = await generateMeetingPrep({
          dealId,
          organizationId: orgId,
          meetingTopic: [attendees, topics].filter(Boolean).join('. '),
        });

        const parts = [
          `## ${brief.headline}\n`,
          `**Deal Summary:** ${brief.dealSummary}\n`,
        ];
        if (brief.contactProfile) parts.push(`**Contact:** ${brief.contactProfile}\n`);
        if (brief.keyTalkingPoints.length) parts.push(`**Talking Points:**\n${brief.keyTalkingPoints.map(p => `- ${p}`).join('\n')}\n`);
        if (brief.questionsToAsk.length) parts.push(`**Questions to Ask:**\n${brief.questionsToAsk.map(q => `- ${q}`).join('\n')}\n`);
        if (brief.risksToAddress.length) parts.push(`**Risks to Address:**\n${brief.risksToAddress.map(r => `- ${r}`).join('\n')}\n`);
        if (brief.suggestedAgenda.length) parts.push(`**Suggested Agenda:**\n${brief.suggestedAgenda.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);

        return parts.join('\n');
      } catch (error) {
        log.error('generateMeetingPrep tool error', error);
        return 'Failed to generate meeting prep. Please try again.';
      }
    },
    {
      name: 'generate_meeting_prep',
      description: 'Generate a meeting preparation brief for this deal. Includes talking points, questions, risks, and suggested agenda.',
      schema: z.object({
        attendees: z.string().optional().describe('Who the meeting is with (e.g., "CEO of target company")'),
        topics: z.string().optional().describe('Key topics to cover'),
      }),
    }
  );

  const draftEmailTool = tool(
    async ({ recipient, purpose, tone }) => {
      try {
        const result = await generateEmailDraft({
          organizationId: orgId,
          dealId,
          purpose,
          context: recipient,
          tone: tone || 'formal',
        });

        if (result.status === 'failed') {
          return `Email draft failed: ${result.error || 'Unknown error'}`;
        }

        const parts = [
          `**Subject:** ${result.subject}\n`,
          result.draft,
        ];
        if (result.suggestions.length) {
          parts.push(`\n**Suggestions:** ${result.suggestions.join('; ')}`);
        }
        if (!result.isCompliant && result.complianceIssues.length) {
          parts.push(`\n**Compliance Notes:** ${result.complianceIssues.join('; ')}`);
        }

        return parts.join('\n');
      } catch (error) {
        log.error('draftEmail tool error', error);
        return 'Failed to draft email. Please try again.';
      }
    },
    {
      name: 'draft_email',
      description: 'Draft a professional email related to this deal. Returns subject line, body, and compliance check.',
      schema: z.object({
        recipient: z.string().describe('Who the email is for (e.g., "management team", "broker", "legal counsel")'),
        purpose: z.string().describe('Purpose of the email (e.g., "request additional financials", "schedule site visit", "follow up on LOI")'),
        tone: z.enum(['formal', 'casual', 'direct']).default('formal').describe('Email tone'),
      }),
    }
  );

  // ─── Phase 4: Reading Tools ───────────────────────────────────────

  const getAnalysisSummaryTool = tool(
    async () => {
      try {
        const { data: statements } = await supabase
          .from('FinancialStatement')
          .select('*')
          .eq('dealId', dealId)
          .eq('isActive', true);

        if (!statements || statements.length === 0) {
          return 'No financial statements available for analysis. Extract financials first.';
        }

        const analysis = await analyzeFinancials(dealId, statements);
        const parts: string[] = [];

        // QoE Score
        if (analysis.qoe) {
          parts.push(`**Quality of Earnings Score: ${analysis.qoe.score}/100**`);
          parts.push(analysis.qoe.summary);
          if (analysis.qoe.flags?.length) {
            parts.push(`\nQoE Flags:\n${analysis.qoe.flags.map((f: any) => `- [${f.severity}] ${f.label}: ${f.description}`).join('\n')}`);
          }
        }

        // Red Flags
        if (analysis.redFlags?.length) {
          parts.push(`\n**Red Flags (${analysis.redFlags.length}):**`);
          for (const rf of analysis.redFlags.slice(0, 8)) {
            parts.push(`- [${rf.severity}] ${rf.title}: ${rf.detail}`);
          }
        }

        // Key Ratios (grouped by category)
        if (analysis.ratios?.length) {
          parts.push(`\n**Key Ratios:**`);
          for (const group of analysis.ratios.slice(0, 5)) {
            parts.push(`\n*${group.category}:*`);
            for (const r of group.ratios.slice(0, 4)) {
              const latest = r.periods?.[0];
              const val = latest?.value != null ? latest.value.toFixed(2) : '—';
              parts.push(`- ${r.name}: ${val}${r.unit || ''} (${r.trend})`);
            }
          }
        }

        return parts.join('\n') || 'Analysis ran but produced no results.';
      } catch (error) {
        log.error('getAnalysisSummary tool error', error);
        return 'Error running analysis.';
      }
    },
    {
      name: 'get_analysis_summary',
      description: 'Run and fetch the PE analysis summary: Quality of Earnings score, red flags, key financial ratios. Use when the user asks about QoE, red flags, analysis results, or financial health.',
      schema: z.object({}),
    }
  );

  const listDocumentsTool = tool(
    async () => {
      try {
        const { data: docs } = await supabase
          .from('Document')
          .select('id, name, type, fileSize, createdAt, aiAnalyzedAt, confidence')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false });

        if (!docs || docs.length === 0) return 'No documents uploaded for this deal.';

        const parts = [`**Documents (${docs.length}):**\n`];
        for (const doc of docs) {
          const size = doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : 'unknown size';
          const date = new Date(doc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const aiStatus = doc.aiAnalyzedAt ? `AI analyzed (${doc.confidence ? Math.round(doc.confidence * 100) + '%' : 'done'})` : 'Not analyzed';
          parts.push(`- **${doc.name}** — ${size}, uploaded ${date}, ${aiStatus}`);
        }
        return parts.join('\n');
      } catch (error) {
        log.error('listDocuments tool error', error);
        return 'Error fetching documents.';
      }
    },
    {
      name: 'list_documents',
      description: 'List all documents uploaded to this deal with file details and AI analysis status.',
      schema: z.object({}),
    }
  );

  const scrollToSectionTool = tool(
    async ({ section }) => {
      return JSON.stringify({ type: 'scroll_to', section });
    },
    {
      name: 'scroll_to_section',
      description: 'Scroll the deal page to a specific section. Use when the user asks to see or navigate to financials, analysis, documents, activity, or risks.',
      schema: z.object({
        section: z.enum(['financials', 'analysis', 'activity', 'documents', 'risks']).describe('Section to scroll to'),
      }),
    }
  );

  return [
    searchDocumentsTool,
    getDealFinancialsTool,
    compareDealsTool,
    getDealActivityTool,
    updateDealFieldTool,
    changeDealStageTool,
    addNoteTool,
    triggerFinancialExtractionTool,
    generateMeetingPrepTool,
    draftEmailTool,
    getAnalysisSummaryTool,
    listDocumentsTool,
    scrollToSectionTool,
    suggestActionTool,
  ];
}
