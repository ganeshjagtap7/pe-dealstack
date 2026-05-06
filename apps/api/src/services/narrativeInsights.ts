/**
 * Narrative Insights Service
 *
 * Generates PE-grade AI commentary from computed analysis results.
 * Uses GPT-4.1 (MODEL_INSIGHTS tier) with a senior PE associate persona.
 * Caches results keyed by analysisHash to avoid repeat calls.
 */

import crypto from 'crypto';
import { openai, isAIEnabled } from '../openai.js';
import { MODEL_INSIGHTS } from '../utils/aiModels.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import type { IndustryBenchmark, PortfolioSummary } from './agentMemory.js';

// ─── Types ───────────────────────────────────────────────────

export interface NarrativeInsight {
  headline: string;
  commentary: string;
  conviction: 'bullish' | 'neutral' | 'bearish';
}

export interface InsightsResult {
  modules: Record<string, NarrativeInsight>;
  executiveSummary: string;
  topThreeRisks: string[];
  topThreeStrengths: string[];
  diligencePriorities: string[];
  generatedAt: string;
}

interface DealContext {
  dealName?: string;
  industry?: string;
  dealSize?: number;
  revenue?: number;
  ebitda?: number;
}

interface MemoryContext {
  industry: IndustryBenchmark[];
  portfolio: PortfolioSummary;
}

// ─── Hash ────────────────────────────────────────────────────

export function computeAnalysisHash(analysis: any): string {
  // Exclude volatile fields that change on every call
  const { analyzedAt, ...stable } = analysis;
  return crypto.createHash('md5').update(JSON.stringify(stable)).digest('hex');
}

// ─── Cache ───────────────────────────────────────────────────

export async function getCachedInsights(
  dealId: string,
  analysisHash: string,
): Promise<InsightsResult | null> {
  try {
    const { data } = await supabase
      .from('NarrativeInsightCache')
      .select('insights')
      .eq('dealId', dealId)
      .eq('analysisHash', analysisHash)
      .single();

    return data?.insights as InsightsResult | null;
  } catch (err) {
    // Cache miss / DB error — caller will regenerate. Log so persistent failures are visible.
    log.warn('narrativeInsights: getCachedInsights failed', { error: err instanceof Error ? err.message : String(err), dealId });
    return null;
  }
}

export async function cacheInsights(
  dealId: string,
  orgId: string,
  analysisHash: string,
  insights: InsightsResult,
): Promise<void> {
  try {
    await supabase
      .from('NarrativeInsightCache')
      .upsert({
        dealId,
        organizationId: orgId,
        analysisHash,
        insights,
        generatedAt: new Date().toISOString(),
      }, { onConflict: 'dealId,analysisHash' });
  } catch (err) {
    log.error('narrativeInsights: cacheInsights failed', err);
  }
}

export async function invalidateCache(dealId: string): Promise<void> {
  try {
    await supabase
      .from('NarrativeInsightCache')
      .delete()
      .eq('dealId', dealId);
  } catch (err) {
    log.error('narrativeInsights: invalidateCache failed', err);
  }
}

// ─── Condense Analysis ──────────────────────────────────────

function condenseAnalysis(analysis: any): any {
  const condensed: any = {};

  // QoE
  if (analysis.qoe) {
    condensed.qoe = {
      score: analysis.qoe.score,
      summary: analysis.qoe.summary,
      flagCount: analysis.qoe.flags?.length || 0,
      criticalFlags: (analysis.qoe.flags || [])
        .filter((f: any) => f.severity === 'critical' || f.severity === 'warning')
        .map((f: any) => ({ name: f.name, severity: f.severity, detail: f.detail })),
    };
  }

  // Latest period ratios (just trend + latest value)
  if (analysis.ratios?.length) {
    condensed.ratios = analysis.ratios.map((group: any) => ({
      name: group.name,
      ratios: (group.ratios || []).map((r: any) => ({
        name: r.name,
        latestValue: r.periods?.[r.periods.length - 1]?.value,
        trend: r.trend,
        benchmark: r.benchmark,
      })),
    }));
  }

  // Revenue quality
  if (analysis.revenueQuality) {
    condensed.revenueQuality = {
      revenueCAGR: analysis.revenueQuality.revenueCAGR,
      consistencyScore: analysis.revenueQuality.consistencyScore,
    };
  }

  // Cash flow
  if (analysis.cashFlowAnalysis) {
    condensed.cashFlow = {
      avgConversion: analysis.cashFlowAnalysis.avgConversion,
      latestFCF: analysis.cashFlowAnalysis.periods?.[
        analysis.cashFlowAnalysis.periods.length - 1
      ]?.fcf,
    };
  }

  // Working capital
  if (analysis.workingCapital) {
    const latestWc = analysis.workingCapital.periods?.[
      analysis.workingCapital.periods.length - 1
    ];
    condensed.workingCapital = {
      nwcAsPercentRevenue: latestWc?.nwcPctRevenue,
      trend: analysis.workingCapital.trend,
    };
  }

  // Debt capacity
  if (analysis.debtCapacity) {
    condensed.debtCapacity = {
      currentLeverage: analysis.debtCapacity.currentLeverage,
      interestCoverage: analysis.debtCapacity.interestCoverage,
      debtToEquity: analysis.debtCapacity.debtToEquity,
    };
  }

  // LBO screen
  if (analysis.lboScreen) {
    condensed.lboScreen = {
      passesScreen: analysis.lboScreen.passesScreen,
      bestIRR: analysis.lboScreen.scenarios?.reduce(
        (max: number | null, s: any) => (s.irr != null && (max == null || s.irr > max) ? s.irr : max), null),
      entryEbitda: analysis.lboScreen.entryEbitda,
    };
  }

  // Cost structure
  if (analysis.costStructure) {
    condensed.costStructure = {
      breakEvenRevenue: analysis.costStructure.breakEvenRevenue,
      operatingLeverage: analysis.costStructure.operatingLeverage,
    };
  }

  // Red flags
  if (analysis.redFlags?.length) {
    condensed.redFlags = analysis.redFlags.map((f: any) => ({
      name: f.name,
      severity: f.severity,
      detail: f.detail,
    }));
  }

  // EBITDA bridge
  if (analysis.ebitdaBridge?.periods?.length) {
    const latest = analysis.ebitdaBridge.periods[analysis.ebitdaBridge.periods.length - 1];
    condensed.ebitdaBridge = {
      latestReported: latest?.reportedEbitda,
      latestAdjusted: latest?.adjustedEbitda,
    };
  }

  condensed.periods = analysis.periods;
  condensed.periodCount = analysis.periods?.length || 0;

  return condensed;
}

// ─── System Prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior PE associate writing investment committee commentary for a lower middle market private equity firm.

Your audience: Managing Directors and Partners making investment decisions.

RULES:
- Be direct and analytical. Lead with the conclusion, then the evidence.
- Every insight must be 2-4 sentences. No fluff.
- Frame findings in terms of: (a) investment risk, (b) value creation potential, (c) diligence priorities.
- If data is insufficient, say so explicitly rather than speculating.
- Use conviction levels: "bullish" = clearly positive, "bearish" = clearly concerning, "neutral" = mixed/insufficient.
- Reference specific numbers when making claims.
- Compare against industry benchmarks and portfolio context when available.

BAD insight: "Revenue grew 42% year-over-year." (Just restating a number)
GOOD insight: "Revenue quality is concerning. The -28% CAGR suggests structural decline rather than cyclical softness, significantly below the 5-15% typical for this industry. Recommend a customer cohort analysis to isolate whether decline is concentration-driven."

Return valid JSON matching the requested schema exactly.`;

// ─── Generate ────────────────────────────────────────────────

export async function generateNarrativeInsights(
  analysisResult: any,
  dealContext: DealContext,
  memory: MemoryContext,
): Promise<InsightsResult> {
  if (!isAIEnabled() || !openai) {
    return fallbackInsights();
  }

  const condensed = condenseAnalysis(analysisResult);

  // Build memory context string
  let memorySection = '';
  if (memory.industry.length > 0) {
    memorySection += '\n[INDUSTRY BENCHMARKS]\n';
    for (const b of memory.industry) {
      memorySection += `${b.metric}: typical range ${b.typicalLow}-${b.typicalHigh} (median ${b.typicalMid}, n=${b.sampleSize})\n`;
    }
  }
  if (memory.portfolio.dealCount > 0) {
    memorySection += '\n[PORTFOLIO CONTEXT — firm historical deals]\n';
    memorySection += `Deals analyzed: ${memory.portfolio.dealCount}\n`;
    if (memory.portfolio.medianEbitdaMargin != null) memorySection += `Median EBITDA margin: ${memory.portfolio.medianEbitdaMargin}%\n`;
    if (memory.portfolio.medianRevenueCAGR != null) memorySection += `Median revenue CAGR: ${memory.portfolio.medianRevenueCAGR}%\n`;
    if (memory.portfolio.medianQoeScore != null) memorySection += `Median QoE score: ${memory.portfolio.medianQoeScore}/100\n`;
    if (memory.portfolio.medianFcfConversion != null) memorySection += `Median FCF conversion: ${memory.portfolio.medianFcfConversion}%\n`;
    if (memory.portfolio.lboPassRate != null) memorySection += `LBO screen pass rate: ${memory.portfolio.lboPassRate}%\n`;
  }

  const userPrompt = `Generate PE investment insights for this deal.

[DEAL]
Name: ${dealContext.dealName || 'Unknown'}
Industry: ${dealContext.industry || 'Not specified'}
${dealContext.dealSize ? `Deal Size: $${dealContext.dealSize}M` : ''}
${dealContext.revenue ? `Revenue: $${dealContext.revenue}M` : ''}
${dealContext.ebitda ? `EBITDA: $${dealContext.ebitda}M` : ''}

[ANALYSIS DATA]
${JSON.stringify(condensed, null, 2)}
${memorySection}

Return JSON:
{
  "modules": {
    "qoe": { "headline": "...", "commentary": "...", "conviction": "bullish|neutral|bearish" },
    "revenueQuality": { "headline": "...", "commentary": "...", "conviction": "..." },
    "ebitdaBridge": { "headline": "...", "commentary": "...", "conviction": "..." },
    "cashFlow": { "headline": "...", "commentary": "...", "conviction": "..." },
    "workingCapital": { "headline": "...", "commentary": "...", "conviction": "..." },
    "debtCapacity": { "headline": "...", "commentary": "...", "conviction": "..." },
    "lboScreen": { "headline": "...", "commentary": "...", "conviction": "..." },
    "costStructure": { "headline": "...", "commentary": "...", "conviction": "..." },
    "redFlags": { "headline": "...", "commentary": "...", "conviction": "..." }
  },
  "executiveSummary": "3-sentence overall investment thesis commentary",
  "topThreeRisks": ["risk1", "risk2", "risk3"],
  "topThreeStrengths": ["strength1", "strength2", "strength3"],
  "diligencePriorities": ["priority1", "priority2", "priority3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_INSIGHTS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    const parsed = JSON.parse(content) as InsightsResult;
    parsed.generatedAt = new Date().toISOString();

    // Validate structure
    if (!parsed.modules || !parsed.executiveSummary) {
      throw new Error('Invalid response structure');
    }

    return parsed;
  } catch (err) {
    log.error('narrativeInsights: AI generation failed', err);
    return fallbackInsights();
  }
}

// ─── Fallback ────────────────────────────────────────────────

function fallbackInsights(): InsightsResult {
  return {
    modules: {},
    executiveSummary: 'AI insights are currently unavailable. Review the quantitative analysis above for key metrics.',
    topThreeRisks: [],
    topThreeStrengths: [],
    diligencePriorities: [],
    generatedAt: new Date().toISOString(),
  };
}
