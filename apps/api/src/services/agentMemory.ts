/**
 * Agent Memory Service
 *
 * Persistent memory for the financial agent across deals.
 * Three layers:
 *  1. Industry patterns — running averages of metrics per industry
 *  2. Extraction learnings — what extraction source works best
 *  3. Deal history — portfolio-level benchmarking
 *
 * All data is org-scoped (multi-tenant safe).
 */

import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

// ─── Types ───────────────────────────────────────────────────

export interface IndustryBenchmark {
  metric: string;
  typicalLow: number | null;
  typicalMid: number | null;
  typicalHigh: number | null;
  sampleSize: number;
  source: 'observed' | 'seeded';
}

export interface ExtractionLearning {
  documentPattern: string;
  fileType: string;
  bestExtractionSource: string | null;
  avgConfidence: number | null;
  totalExtractions: number;
}

export interface DealSnapshot {
  dealId: string;
  industry: string | null;
  latestRevenue: number | null;
  latestEbitda: number | null;
  ebitdaMargin: number | null;
  revenueCAGR: number | null;
  qoeScore: number | null;
  fcfConversion: number | null;
  leverage: number | null;
  lboPasses: boolean | null;
}

export interface PortfolioSummary {
  dealCount: number;
  medianEbitdaMargin: number | null;
  medianRevenueCAGR: number | null;
  medianQoeScore: number | null;
  medianFcfConversion: number | null;
  medianLeverage: number | null;
  lboPassRate: number | null;
}

// ─── Industry Benchmarks ─────────────────────────────────────

export async function getIndustryBenchmarks(
  orgId: string,
  industry: string,
): Promise<IndustryBenchmark[]> {
  try {
    const { data, error } = await supabase
      .from('AgentMemoryIndustry')
      .select('metric, typicalLow, typicalMid, typicalHigh, sampleSize, source')
      .eq('organizationId', orgId)
      .eq('industry', industry);

    if (error) throw error;
    return (data || []) as IndustryBenchmark[];
  } catch (err) {
    log.error('agentMemory: getIndustryBenchmarks failed', err);
    return [];
  }
}

export async function updateIndustryMemory(
  orgId: string,
  industry: string,
  metrics: Record<string, number>,
): Promise<void> {
  try {
    for (const [metric, value] of Object.entries(metrics)) {
      if (value == null || isNaN(value)) continue;

      // Fetch existing
      const { data: existing } = await supabase
        .from('AgentMemoryIndustry')
        .select('id, typicalLow, typicalMid, typicalHigh, sampleSize')
        .eq('organizationId', orgId)
        .eq('industry', industry)
        .eq('metric', metric)
        .single();

      if (existing) {
        // Incremental weighted average
        const n = existing.sampleSize || 1;
        const newMid = ((existing.typicalMid || 0) * n + value) / (n + 1);
        const newLow = Math.min(existing.typicalLow ?? value, value);
        const newHigh = Math.max(existing.typicalHigh ?? value, value);

        await supabase
          .from('AgentMemoryIndustry')
          .update({
            typicalLow: Math.round(newLow * 100) / 100,
            typicalMid: Math.round(newMid * 100) / 100,
            typicalHigh: Math.round(newHigh * 100) / 100,
            sampleSize: n + 1,
            source: 'observed',
            updatedAt: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        // First observation
        await supabase.from('AgentMemoryIndustry').insert({
          organizationId: orgId,
          industry,
          metric,
          typicalLow: value,
          typicalMid: value,
          typicalHigh: value,
          sampleSize: 1,
          source: 'observed',
        });
      }
    }
  } catch (err) {
    log.error('agentMemory: updateIndustryMemory failed', err);
  }
}

// ─── Extraction Learnings ────────────────────────────────────

export async function recordExtractionLearning(
  orgId: string,
  documentPattern: string,
  fileType: string,
  source: string,
  confidence: number,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('AgentMemoryExtraction')
      .select('id, avgConfidence, totalExtractions, bestExtractionSource')
      .eq('organizationId', orgId)
      .eq('documentPattern', documentPattern)
      .eq('fileType', fileType)
      .single();

    if (existing) {
      const n = existing.totalExtractions || 1;
      const newAvg = ((existing.avgConfidence || 0) * n + confidence) / (n + 1);
      // Update best source if this confidence is higher
      const bestSource = confidence > (existing.avgConfidence || 0)
        ? source
        : existing.bestExtractionSource;

      await supabase
        .from('AgentMemoryExtraction')
        .update({
          avgConfidence: Math.round(newAvg * 100) / 100,
          totalExtractions: n + 1,
          bestExtractionSource: bestSource,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('AgentMemoryExtraction').insert({
        organizationId: orgId,
        documentPattern,
        fileType,
        bestExtractionSource: source,
        avgConfidence: confidence,
        totalExtractions: 1,
      });
    }
  } catch (err) {
    log.error('agentMemory: recordExtractionLearning failed', err);
  }
}

export async function getBestExtractionSource(
  orgId: string,
  documentPattern: string,
  fileType: string,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('AgentMemoryExtraction')
      .select('bestExtractionSource')
      .eq('organizationId', orgId)
      .eq('documentPattern', documentPattern)
      .eq('fileType', fileType)
      .single();

    return data?.bestExtractionSource || null;
  } catch (err) {
    log.warn('agentMemory: getBestExtractionSource failed', { error: err instanceof Error ? err.message : String(err), documentPattern, fileType });
    return null;
  }
}

// ─── Deal History ────────────────────────────────────────────

export async function snapshotDealMetrics(
  orgId: string,
  dealId: string,
  analysis: {
    qoe?: { score: number };
    revenueQuality?: { revenueCAGR: number | null };
    cashFlowAnalysis?: { avgConversion: number | null };
    debtCapacity?: { currentLeverage: number | null };
    lboScreen?: { passesScreen: boolean };
    periods: string[];
  },
  industry?: string,
  latestRevenue?: number | null,
  latestEbitda?: number | null,
): Promise<void> {
  try {
    const margin = latestRevenue && latestEbitda
      ? Math.round((latestEbitda / latestRevenue) * 10000) / 100
      : null;

    await supabase
      .from('AgentMemoryDealHistory')
      .upsert({
        organizationId: orgId,
        dealId,
        industry: industry || null,
        latestRevenue: latestRevenue || null,
        latestEbitda: latestEbitda || null,
        ebitdaMargin: margin,
        revenueCAGR: analysis.revenueQuality?.revenueCAGR ?? null,
        qoeScore: analysis.qoe?.score ?? null,
        fcfConversion: analysis.cashFlowAnalysis?.avgConversion ?? null,
        leverage: analysis.debtCapacity?.currentLeverage ?? null,
        lboPasses: analysis.lboScreen?.passesScreen ?? null,
        snapshotAt: new Date().toISOString(),
      }, { onConflict: 'organizationId,dealId' });
  } catch (err) {
    log.error('agentMemory: snapshotDealMetrics failed', err);
  }
}

export async function getPortfolioSummary(
  orgId: string,
  excludeDealId?: string,
): Promise<PortfolioSummary> {
  try {
    let query = supabase
      .from('AgentMemoryDealHistory')
      .select('*')
      .eq('organizationId', orgId);

    if (excludeDealId) {
      query = query.neq('dealId', excludeDealId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      return { dealCount: 0, medianEbitdaMargin: null, medianRevenueCAGR: null, medianQoeScore: null, medianFcfConversion: null, medianLeverage: null, lboPassRate: null };
    }

    const median = (arr: number[]) => {
      const sorted = arr.filter(v => v != null).sort((a, b) => a - b);
      if (sorted.length === 0) return null;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const lboArr = data.filter(d => d.lboPasses != null);
    const lboPassRate = lboArr.length > 0
      ? Math.round(lboArr.filter(d => d.lboPasses).length / lboArr.length * 100)
      : null;

    return {
      dealCount: data.length,
      medianEbitdaMargin: median(data.map(d => d.ebitdaMargin)),
      medianRevenueCAGR: median(data.map(d => d.revenueCAGR)),
      medianQoeScore: median(data.map(d => d.qoeScore)),
      medianFcfConversion: median(data.map(d => d.fcfConversion)),
      medianLeverage: median(data.map(d => d.leverage)),
      lboPassRate,
    };
  } catch (err) {
    log.error('agentMemory: getPortfolioSummary failed', err);
    return { dealCount: 0, medianEbitdaMargin: null, medianRevenueCAGR: null, medianQoeScore: null, medianFcfConversion: null, medianLeverage: null, lboPassRate: null };
  }
}
