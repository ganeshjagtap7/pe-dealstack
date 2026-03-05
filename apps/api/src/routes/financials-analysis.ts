import { Router } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import { analyzeFinancials } from '../services/analysis/index.js';
import {
  generateNarrativeInsights,
  computeAnalysisHash,
  getCachedInsights,
  cacheInsights,
  invalidateCache,
} from '../services/narrativeInsights.js';
import {
  getIndustryBenchmarks,
  getPortfolioSummary,
  snapshotDealMetrics,
  updateIndustryMemory,
} from '../services/agentMemory.js';

const router = Router();

// ─── 5b2: GET /api/deals/:dealId/financials/analysis ─────────
// QoE flags + Financial Ratios computed from stored data

router.get('/deals/:dealId/financials/analysis', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    const { data: rows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
      .order('period', { ascending: true });

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return res.json({ hasData: false, qoe: null, ratios: [], periods: [] });
    }

    const analysis = await analyzeFinancials(dealId, rows);
    res.json({ hasData: true, ...analysis });
  } catch (err) {
    log.error('GET financials analysis error', err);
    res.status(500).json({ error: 'Failed to compute financial analysis' });
  }
});

// ─── AI Narrative Insights (GPT-4o + Agent Memory) ────────────

router.get('/deals/:dealId/financials/insights', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Fetch financial rows
    const { data: rows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
      .order('period', { ascending: true });

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.json({ hasData: false, insights: null });
    }

    // Run analysis (pure math — fast)
    const analysis = await analyzeFinancials(dealId, rows);
    const analysisHash = computeAnalysisHash(analysis);

    // Check cache
    const cached = await getCachedInsights(dealId, analysisHash);
    if (cached) {
      return res.json({ hasData: true, insights: cached, fromCache: true });
    }

    // Fetch deal context
    const { data: deal } = await supabase
      .from('Deal')
      .select('name, industry, dealSize, revenue, ebitda')
      .eq('id', dealId)
      .single();

    // Fetch memory in parallel
    const [industryMem, portfolioMem] = await Promise.all([
      deal?.industry ? getIndustryBenchmarks(orgId, deal.industry) : Promise.resolve([]),
      getPortfolioSummary(orgId, dealId),
    ]);

    // Generate AI insights
    const insights = await generateNarrativeInsights(
      analysis,
      {
        dealName: deal?.name,
        industry: deal?.industry,
        dealSize: deal?.dealSize,
        revenue: deal?.revenue,
        ebitda: deal?.ebitda,
      },
      { industry: industryMem, portfolio: portfolioMem },
    );

    // Fire-and-forget: cache + memory updates
    cacheInsights(dealId, orgId, analysisHash, insights).catch(() => {});
    if (deal?.industry) {
      const metrics: Record<string, number> = {};
      if (analysis.qoe?.score != null) metrics.qoe_score = analysis.qoe.score;
      if (analysis.revenueQuality?.revenueCAGR != null) metrics.revenue_cagr = analysis.revenueQuality.revenueCAGR;
      if (analysis.cashFlowAnalysis?.avgConversion != null) metrics.fcf_conversion = analysis.cashFlowAnalysis.avgConversion;
      if (analysis.debtCapacity?.currentLeverage != null) metrics.leverage = analysis.debtCapacity.currentLeverage;
      updateIndustryMemory(orgId, deal.industry, metrics).catch(() => {});
    }
    snapshotDealMetrics(orgId, dealId, analysis, deal?.industry, deal?.revenue, deal?.ebitda).catch(() => {});

    res.json({ hasData: true, insights, fromCache: false });
  } catch (err) {
    log.error('GET financials insights error', err);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

router.post('/deals/:dealId/financials/insights/regenerate', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Invalidate cache
    await invalidateCache(dealId);

    // Fetch rows
    const { data: rows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
      .order('period', { ascending: true });

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return res.json({ hasData: false, insights: null });
    }

    const analysis = await analyzeFinancials(dealId, rows);
    const analysisHash = computeAnalysisHash(analysis);

    const { data: deal } = await supabase
      .from('Deal')
      .select('name, industry, dealSize, revenue, ebitda')
      .eq('id', dealId)
      .single();

    const [industryMem, portfolioMem] = await Promise.all([
      deal?.industry ? getIndustryBenchmarks(orgId, deal.industry) : Promise.resolve([]),
      getPortfolioSummary(orgId, dealId),
    ]);

    const insights = await generateNarrativeInsights(
      analysis,
      {
        dealName: deal?.name,
        industry: deal?.industry,
        dealSize: deal?.dealSize,
        revenue: deal?.revenue,
        ebitda: deal?.ebitda,
      },
      { industry: industryMem, portfolio: portfolioMem },
    );

    cacheInsights(dealId, orgId, analysisHash, insights).catch(() => {});

    res.json({ hasData: true, insights, fromCache: false });
  } catch (err) {
    log.error('POST financials insights regenerate error', err);
    res.status(500).json({ error: 'Failed to regenerate insights' });
  }
});

// ─── Phase 4: Cross-Document Verification ────────────────────

router.get('/deals/:dealId/financials/cross-doc', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Get ALL rows (including inactive) to compare across documents
    const { data: allRows, error } = await supabase
      .from('FinancialStatement')
      .select('*, Document(id, name)')
      .eq('dealId', dealId)
      .order('period', { ascending: true });

    if (error) throw error;
    if (!allRows || allRows.length === 0) {
      return res.json({ hasData: false, conflicts: [], documents: [] });
    }

    // Group by (statementType, period) to find discrepancies across documents
    const groups = new Map<string, typeof allRows>();
    for (const row of allRows) {
      const key = `${row.statementType}|${row.period}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const conflicts: {
      statementType: string;
      period: string;
      field: string;
      values: { documentName: string; value: number | null; isActive: boolean }[];
      discrepancyPct: number;
    }[] = [];

    const keyFields = ['revenue', 'ebitda', 'net_income', 'total_assets', 'total_equity', 'operating_cf'];

    for (const [key, rows] of groups) {
      if (rows.length < 2) continue;
      const [statementType, period] = key.split('|');

      for (const field of keyFields) {
        const values = rows
          .map(r => ({
            documentName: (r as any).Document?.name ?? 'Unknown',
            value: (r.lineItems as Record<string, number | null>)?.[field] ?? null,
            isActive: r.isActive,
          }))
          .filter(v => v.value != null);

        if (values.length < 2) continue;

        const nums = values.map(v => v.value!);
        const maxVal = Math.max(...nums.map(Math.abs));
        const spread = Math.max(...nums) - Math.min(...nums);
        const discrepancyPct = maxVal > 0 ? (spread / maxVal) * 100 : 0;

        if (discrepancyPct > 2) {
          conflicts.push({ statementType, period, field, values, discrepancyPct: Math.round(discrepancyPct * 10) / 10 });
        }
      }
    }

    // Unique documents
    const documents = [...new Set(allRows.map(r => (r as any).Document?.name).filter(Boolean))];

    res.json({
      hasData: true,
      conflicts: conflicts.sort((a, b) => b.discrepancyPct - a.discrepancyPct),
      documents,
      totalComparisons: groups.size,
    });
  } catch (err) {
    log.error('GET cross-doc error', err);
    res.status(500).json({ error: 'Failed to run cross-document verification' });
  }
});

// ─── Phase 5: Portfolio Benchmarking ─────────────────────────

router.get('/deals/:dealId/financials/benchmark', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Get this deal's latest financials
    const { data: dealRows } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
      .eq('statementType', 'INCOME_STATEMENT')
      .eq('periodType', 'HISTORICAL')
      .order('period', { ascending: false })
      .limit(1);

    if (!dealRows || dealRows.length === 0) {
      return res.json({ hasData: false });
    }

    const dealLi = dealRows[0].lineItems as Record<string, number | null>;
    const dealRev = dealLi.revenue;
    const dealEbitda = dealLi.ebitda;
    const dealMargin = dealRev && dealEbitda && dealRev > 0 ? (dealEbitda / dealRev) * 100 : null;
    const dealGrossMargin = dealLi.gross_profit && dealRev && dealRev > 0
      ? (dealLi.gross_profit / dealRev) * 100 : null;

    // Get latest income statements from ALL deals in the org
    const { data: allDeals } = await supabase
      .from('Deal')
      .select('id, name')
      .eq('organizationId', orgId)
      .neq('id', dealId);

    if (!allDeals || allDeals.length === 0) {
      return res.json({ hasData: true, peerCount: 0, benchmarks: [] });
    }

    const peerMetrics: { revenue: number; ebitdaMargin: number; grossMargin: number | null }[] = [];

    // Fetch latest IS for each peer deal
    for (const peer of allDeals.slice(0, 50)) {
      const { data: peerRows } = await supabase
        .from('FinancialStatement')
        .select('lineItems')
        .eq('dealId', peer.id)
        .eq('isActive', true)
        .eq('statementType', 'INCOME_STATEMENT')
        .eq('periodType', 'HISTORICAL')
        .order('period', { ascending: false })
        .limit(1);

      if (peerRows && peerRows.length > 0) {
        const pli = peerRows[0].lineItems as Record<string, number | null>;
        const pRev = pli.revenue;
        const pEbitda = pli.ebitda;
        if (pRev && pEbitda && pRev > 0) {
          peerMetrics.push({
            revenue: pRev,
            ebitdaMargin: (pEbitda / pRev) * 100,
            grossMargin: pli.gross_profit && pRev > 0 ? (pli.gross_profit / pRev) * 100 : null,
          });
        }
      }
    }

    // Compute percentile ranks
    function percentileRank(values: number[], target: number): number {
      const sorted = [...values].sort((a, b) => a - b);
      const below = sorted.filter(v => v < target).length;
      return Math.round((below / sorted.length) * 100);
    }

    const benchmarks: {
      metric: string;
      dealValue: number | null;
      percentile: number | null;
      peerMedian: number | null;
      peerMin: number | null;
      peerMax: number | null;
      unit: string;
    }[] = [];

    if (peerMetrics.length > 0) {
      const revs = peerMetrics.map(p => p.revenue);
      const margins = peerMetrics.map(p => p.ebitdaMargin);
      const grossMargins = peerMetrics.map(p => p.grossMargin).filter((v): v is number => v != null);

      const median = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };
      const r2 = (v: number | null) => v != null ? Math.round(v * 100) / 100 : null;

      if (dealRev != null) {
        benchmarks.push({
          metric: 'Revenue',
          dealValue: r2(dealRev),
          percentile: percentileRank(revs, dealRev),
          peerMedian: r2(median(revs)),
          peerMin: r2(Math.min(...revs)),
          peerMax: r2(Math.max(...revs)),
          unit: '$M',
        });
      }

      if (dealMargin != null) {
        benchmarks.push({
          metric: 'EBITDA Margin',
          dealValue: r2(dealMargin),
          percentile: percentileRank(margins, dealMargin),
          peerMedian: r2(median(margins)),
          peerMin: r2(Math.min(...margins)),
          peerMax: r2(Math.max(...margins)),
          unit: '%',
        });
      }

      if (dealGrossMargin != null && grossMargins.length > 0) {
        benchmarks.push({
          metric: 'Gross Margin',
          dealValue: r2(dealGrossMargin),
          percentile: percentileRank(grossMargins, dealGrossMargin),
          peerMedian: r2(median(grossMargins)),
          peerMin: r2(Math.min(...grossMargins)),
          peerMax: r2(Math.max(...grossMargins)),
          unit: '%',
        });
      }
    }

    res.json({
      hasData: true,
      peerCount: peerMetrics.length,
      benchmarks,
    });
  } catch (err) {
    log.error('GET benchmark error', err);
    res.status(500).json({ error: 'Failed to compute benchmarks' });
  }
});

// ─── Phase 6: Investment Memo Auto-Draft ─────────────────────

router.get('/deals/:dealId/financials/memo', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Fetch deal info
    const { data: deal } = await supabase
      .from('Deal')
      .select('*, Company(name, industry, description)')
      .eq('id', dealId)
      .single();

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Fetch financials
    const { data: rows } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
      .order('period', { ascending: true });

    // Fetch analysis
    let analysis = null;
    if (rows && rows.length > 0) {
      analysis = await analyzeFinancials(dealId, rows);
    }

    // Build memo sections
    const company = (deal as any).Company;
    const sections: { title: string; content: string; icon: string }[] = [];

    // 1. Executive Summary
    sections.push({
      title: 'Executive Summary',
      icon: 'summarize',
      content: `${company?.name || deal.name || 'Target Company'} is a ${company?.industry || 'N/A'} company. ${company?.description || ''} ${deal.dealSize ? `The proposed transaction size is $${deal.dealSize}M.` : ''}`,
    });

    // 2. Financial Overview
    if (analysis) {
      const latestP = analysis.periods[analysis.periods.length - 1];
      const isData = rows?.filter(r => r.statementType === 'INCOME_STATEMENT' && r.period === latestP);
      if (isData && isData.length > 0) {
        const li = isData[0].lineItems as Record<string, number | null>;
        sections.push({
          title: 'Financial Summary',
          icon: 'table_chart',
          content: `Latest period (${latestP}): Revenue $${li.revenue ?? 'N/A'}M, EBITDA $${li.ebitda ?? 'N/A'}M, Net Income $${li.net_income ?? 'N/A'}M. ${analysis.revenueQuality ? `Revenue CAGR: ${analysis.revenueQuality.revenueCAGR}%.` : ''} ${analysis.cashFlowAnalysis ? `Average EBITDA-to-FCF conversion: ${analysis.cashFlowAnalysis.avgConversion}%.` : ''}`,
        });
      }
    }

    // 3. Quality of Earnings
    if (analysis?.qoe) {
      const critical = analysis.qoe.flags.filter(f => f.severity === 'critical');
      const positive = analysis.qoe.flags.filter(f => f.severity === 'positive');
      sections.push({
        title: 'Quality of Earnings',
        icon: 'verified',
        content: `QoE Score: ${analysis.qoe.score}/100. ${analysis.qoe.summary} ${critical.length > 0 ? `\n\nCritical concerns: ${critical.map(f => f.title).join(', ')}.` : ''} ${positive.length > 0 ? `\n\nStrengths: ${positive.map(f => f.title).join(', ')}.` : ''}`,
      });
    }

    // 4. Key Risks
    if (analysis?.redFlags && analysis.redFlags.length > 0) {
      sections.push({
        title: 'Key Risks',
        icon: 'flag',
        content: analysis.redFlags.map(f => `• [${f.severity.toUpperCase()}] ${f.title}: ${f.detail}`).join('\n'),
      });
    }

    // 5. Debt Capacity
    if (analysis?.debtCapacity) {
      const dc = analysis.debtCapacity;
      sections.push({
        title: 'Debt Capacity & Financing',
        icon: 'account_balance',
        content: `Current leverage: ${dc.currentLeverage}x Net Debt/EBITDA. Maximum senior debt capacity at 4x: $${dc.maxDebt4x}M. DSCR: ${dc.dscr}x. Debt headroom: $${dc.debtHeadroom}M.`,
      });
    }

    // 6. LBO Assessment
    if (analysis?.lboScreen) {
      const lbo = analysis.lboScreen;
      const bestScenario = lbo.scenarios.reduce((best, s) =>
        (s.irr ?? 0) > (best.irr ?? 0) ? s : best, lbo.scenarios[0]);
      sections.push({
        title: 'LBO Assessment',
        icon: 'rocket_launch',
        content: `${lbo.passesScreen ? 'Deal passes LBO screen.' : 'Deal below typical LBO return thresholds.'} Best-case scenario: Entry at ${bestScenario.entryMultiple}x, Exit at ${bestScenario.exitMultiple}x → ${bestScenario.moic}x MOIC / ${bestScenario.irr}% IRR over 5 years. Equity required: $${bestScenario.equityRequired}M.`,
      });
    }

    // 7. Recommendation placeholder
    sections.push({
      title: 'Recommendation',
      icon: 'recommend',
      content: analysis?.qoe && analysis.qoe.score >= 70
        ? 'Based on the financial analysis, this deal warrants further due diligence. The quality of earnings profile is generally supportive of the investment thesis. Key areas for focused diligence have been flagged above.'
        : 'Based on the financial analysis, several concerns have been identified that require thorough investigation before proceeding. Recommend focused diligence on flagged risk areas before advancing to LOI stage.',
    });

    res.json({
      dealName: company?.name || deal.name,
      generatedAt: new Date().toISOString(),
      sections,
      periodsCovered: analysis?.periods || [],
      qoeScore: analysis?.qoe?.score || null,
    });
  } catch (err) {
    log.error('GET memo error', err);
    res.status(500).json({ error: 'Failed to generate investment memo' });
  }
});

export default router;
