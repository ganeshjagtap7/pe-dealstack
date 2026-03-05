import { Router } from 'express';
import { supabase } from '../supabase.js';
import { openai, isAIEnabled } from '../openai.js';
import { AICache } from '../services/aiCache.js';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';

const subRouter = Router();

// POST /api/portfolio/chat - AI-powered portfolio assistant for dashboard
subRouter.post('/portfolio/chat', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const orgId = getOrgId(req);

    // Fetch portfolio summary data (org-scoped)
    const { data: deals } = await supabase
      .from('Deal')
      .select('id, name, stage, status, industry, revenue, ebitda, dealSize, irrProjected, mom, aiThesis, createdAt, updatedAt')
      .eq('organizationId', orgId)
      .order('updatedAt', { ascending: false });

    // Build portfolio context
    const activeDeals = deals?.filter(d => d.status !== 'PASSED' && d.stage !== 'CLOSED_LOST') || [];
    const totalDeals = deals?.length || 0;
    const totalRevenue = activeDeals.reduce((sum, d) => sum + (d.revenue || 0), 0);
    const totalEbitda = activeDeals.reduce((sum, d) => sum + (d.ebitda || 0), 0);
    const avgIRR = activeDeals.filter(d => d.irrProjected).reduce((sum, d, _, arr) => sum + (d.irrProjected || 0) / arr.length, 0);

    // Group by stage
    const stageCount: Record<string, number> = {};
    activeDeals.forEach(d => {
      stageCount[d.stage] = (stageCount[d.stage] || 0) + 1;
    });

    // Group by industry
    const industryCount: Record<string, number> = {};
    activeDeals.forEach(d => {
      if (d.industry) {
        industryCount[d.industry] = (industryCount[d.industry] || 0) + 1;
      }
    });

    const portfolioContext = `
PORTFOLIO SUMMARY:
- Total Deals: ${totalDeals} (${activeDeals.length} active)
- Total Revenue: $${totalRevenue.toFixed(1)}M
- Total EBITDA: $${totalEbitda.toFixed(1)}M
- Average Projected IRR: ${avgIRR.toFixed(1)}%

DEALS BY STAGE:
${Object.entries(stageCount).map(([stage, count]) => `- ${stage}: ${count}`).join('\n')}

DEALS BY INDUSTRY:
${Object.entries(industryCount).map(([industry, count]) => `- ${industry}: ${count}`).join('\n')}

RECENT DEALS (Top 10):
${activeDeals.slice(0, 10).map(d => `- ${d.name} (${d.industry || 'N/A'}): ${d.stage}, Revenue $${d.revenue || 0}M, EBITDA $${d.ebitda || 0}M${d.aiThesis ? ` | Thesis: ${d.aiThesis.substring(0, 100)}...` : ''}`).join('\n')}
`;

    const systemPrompt = `You are an AI portfolio assistant for a Private Equity firm. You have access to the firm's current deal pipeline and portfolio data. Answer questions about the portfolio, provide insights, and help with analysis.

Be concise but insightful. Use specific numbers from the data when relevant. If asked about a specific deal, reference it by name. If you don't have enough information, say so.

Today's date: ${new Date().toLocaleDateString()}`;

    log.info('Portfolio AI query', { query: message.substring(0, 50) });

    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${portfolioContext}\n\nUser Question: ${message}` },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content || 'Unable to generate response.';

    // Extract relevant deals mentioned (simple matching)
    const mentionedDeals = activeDeals.filter(d =>
      response.toLowerCase().includes(d.name.toLowerCase())
    ).slice(0, 3);

    res.json({
      response,
      context: {
        totalDeals,
        activeDeals: activeDeals.length,
        avgIRR: avgIRR.toFixed(1),
      },
      relatedDeals: mentionedDeals.map(d => ({
        id: d.id,
        name: d.name,
        stage: d.stage,
        industry: d.industry,
        revenue: d.revenue,
      })),
    });
  } catch (error) {
    log.error('Portfolio chat error', error);
    res.status(500).json({ error: 'Failed to process portfolio query' });
  }
});

// GET /api/ai/market-sentiment - AI-powered market sentiment based on user's deal sectors
subRouter.get('/ai/market-sentiment', async (req, res) => {
  try {
    if (!isAIEnabled()) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'OpenAI API key not configured',
      });
    }

    // Check cache first (cache for 5 minutes)
    const cacheKey = 'market-sentiment';
    const cached = await AICache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const orgId = getOrgId(req);

    // Fetch user's active deals to understand their focus sectors (org-scoped)
    const { data: deals } = await supabase
      .from('Deal')
      .select('id, name, industry, stage, status, dealSize')
      .eq('organizationId', orgId)
      .neq('status', 'PASSED')
      .order('updatedAt', { ascending: false })
      .limit(20);

    // Extract unique industries from deals
    const industries = [...new Set(deals?.map(d => d.industry).filter(Boolean) || [])];

    // If no deals, use default sectors
    const focusSectors = industries.length > 0
      ? industries.slice(0, 5)
      : ['Technology', 'Healthcare', 'Financial Services', 'Consumer', 'Industrial'];

    // Build context about the portfolio
    const activeDeals = deals?.filter(d => d.status !== 'PASSED') || [];
    const dealsByStage: Record<string, number> = {};
    activeDeals.forEach(d => {
      dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1;
    });

    const portfolioContext = `
Current Portfolio:
- ${activeDeals.length} active deals
- Focus sectors: ${focusSectors.join(', ')}
- Pipeline breakdown: ${Object.entries(dealsByStage).map(([k, v]) => `${k}: ${v}`).join(', ')}
`;

    // Generate market sentiment using OpenAI
    const completion = await openai!.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a private equity market analyst. Generate a brief, actionable market sentiment analysis for a PE firm focused on specific sectors. Be concise and data-driven. Current date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.

Return a JSON object with this exact structure:
{
  "headline": "One sentence market headline (max 100 chars)",
  "analysis": "2-3 sentences of market analysis mentioning specific sectors",
  "sentiment": "BULLISH" | "NEUTRAL" | "BEARISH",
  "confidenceScore": 0-100,
  "recommendation": "One specific actionable recommendation",
  "indicators": [
    { "name": "indicator name", "trend": "up" | "down" | "stable", "detail": "short detail" }
  ],
  "topSector": "The most promising sector right now",
  "riskFactor": "One key risk to watch"
}`
        },
        {
          role: 'user',
          content: `Generate market sentiment analysis for a PE firm with this portfolio focus:
${portfolioContext}

Focus your analysis on these sectors: ${focusSectors.join(', ')}

Consider current market conditions, M&A activity, valuation trends, and macro factors. Make it specific and actionable.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let sentimentData;

    try {
      sentimentData = JSON.parse(responseText);
    } catch {
      log.error('Failed to parse market sentiment JSON', { response: responseText });
      sentimentData = {
        headline: 'Market analysis temporarily unavailable',
        analysis: 'Unable to generate analysis at this time.',
        sentiment: 'NEUTRAL',
        confidenceScore: 50,
        recommendation: 'Review your pipeline and prioritize active deals.',
        indicators: [],
        topSector: focusSectors[0] || 'Technology',
        riskFactor: 'Market volatility',
      };
    }

    // Add metadata
    const result = {
      ...sentimentData,
      generatedAt: new Date().toISOString(),
      focusSectors,
      activeDealsCount: activeDeals.length,
    };

    // Cache for 5 minutes
    await AICache.set(cacheKey, result, 5 * 60 * 1000);

    log.info('Market sentiment generated', { sectors: focusSectors, sentiment: sentimentData.sentiment });
    res.json(result);
  } catch (error) {
    log.error('Market sentiment error', error);
    res.status(500).json({ error: 'Failed to generate market sentiment' });
  }
});

export default subRouter;
