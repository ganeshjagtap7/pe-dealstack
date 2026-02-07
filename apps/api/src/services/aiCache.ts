import { supabase } from '../supabase.js';

// Cache TTL in hours - cached AI responses are valid for this duration
const CACHE_TTL_HOURS = 24;

// In-memory cache for non-deal-specific data (market sentiment, etc.)
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

export interface CachedAnalysis {
  thesis?: string;
  risks?: any[];
  generatedAt: string;
}

export interface CacheResult<T> {
  hit: boolean;
  data: T | null;
  age?: number; // Age in hours
}

/**
 * AI Cache Service
 * Reduces OpenAI API costs by caching analysis results
 */
export const AICache = {
  /**
   * Check if cached thesis exists and is fresh
   */
  async getThesis(dealId: string): Promise<CacheResult<string>> {
    try {
      const { data: deal } = await supabase
        .from('Deal')
        .select('aiThesis, aiCacheUpdatedAt')
        .eq('id', dealId)
        .single();

      if (!deal?.aiThesis) {
        return { hit: false, data: null };
      }

      // Check if cache is still valid
      if (deal.aiCacheUpdatedAt) {
        const cacheAge = getAgeInHours(deal.aiCacheUpdatedAt);
        if (cacheAge < CACHE_TTL_HOURS) {
          console.log(`[AICache] Thesis HIT for deal ${dealId} (${cacheAge.toFixed(1)}h old)`);
          return { hit: true, data: deal.aiThesis, age: cacheAge };
        }
        console.log(`[AICache] Thesis STALE for deal ${dealId} (${cacheAge.toFixed(1)}h old)`);
      }

      return { hit: false, data: null };
    } catch (error) {
      console.error('[AICache] Error checking thesis cache:', error);
      return { hit: false, data: null };
    }
  },

  /**
   * Store thesis in cache
   */
  async setThesis(dealId: string, thesis: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('Deal')
        .update({
          aiThesis: thesis,
          aiCacheUpdatedAt: new Date().toISOString(),
        })
        .eq('id', dealId);

      if (error) throw error;
      console.log(`[AICache] Thesis STORED for deal ${dealId}`);
      return true;
    } catch (error) {
      console.error('[AICache] Error storing thesis:', error);
      return false;
    }
  },

  /**
   * Check if cached risk analysis exists and is fresh
   */
  async getRisks(dealId: string): Promise<CacheResult<any[]>> {
    try {
      const { data: deal } = await supabase
        .from('Deal')
        .select('aiRisks, aiCacheUpdatedAt')
        .eq('id', dealId)
        .single();

      if (!deal?.aiRisks || !Array.isArray(deal.aiRisks) || deal.aiRisks.length === 0) {
        return { hit: false, data: null };
      }

      // Check if cache is still valid
      if (deal.aiCacheUpdatedAt) {
        const cacheAge = getAgeInHours(deal.aiCacheUpdatedAt);
        if (cacheAge < CACHE_TTL_HOURS) {
          console.log(`[AICache] Risks HIT for deal ${dealId} (${cacheAge.toFixed(1)}h old)`);
          return { hit: true, data: deal.aiRisks, age: cacheAge };
        }
        console.log(`[AICache] Risks STALE for deal ${dealId} (${cacheAge.toFixed(1)}h old)`);
      }

      return { hit: false, data: null };
    } catch (error) {
      console.error('[AICache] Error checking risks cache:', error);
      return { hit: false, data: null };
    }
  },

  /**
   * Store risk analysis in cache
   */
  async setRisks(dealId: string, risks: any[]): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('Deal')
        .update({
          aiRisks: risks,
          aiCacheUpdatedAt: new Date().toISOString(),
        })
        .eq('id', dealId);

      if (error) throw error;
      console.log(`[AICache] Risks STORED for deal ${dealId}`);
      return true;
    } catch (error) {
      console.error('[AICache] Error storing risks:', error);
      return false;
    }
  },

  /**
   * Invalidate all cached AI data for a deal
   * Call this when documents are uploaded/updated
   */
  async invalidate(dealId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('Deal')
        .update({
          aiCacheUpdatedAt: null,
        })
        .eq('id', dealId);

      if (error) throw error;
      console.log(`[AICache] Cache INVALIDATED for deal ${dealId}`);
      return true;
    } catch (error) {
      console.error('[AICache] Error invalidating cache:', error);
      return false;
    }
  },

  /**
   * Get cache statistics for a deal
   */
  async getStats(dealId: string): Promise<{
    hasThesis: boolean;
    hasRisks: boolean;
    cacheAge: number | null;
    isValid: boolean;
  }> {
    try {
      const { data: deal } = await supabase
        .from('Deal')
        .select('aiThesis, aiRisks, aiCacheUpdatedAt')
        .eq('id', dealId)
        .single();

      if (!deal) {
        return { hasThesis: false, hasRisks: false, cacheAge: null, isValid: false };
      }

      const cacheAge = deal.aiCacheUpdatedAt ? getAgeInHours(deal.aiCacheUpdatedAt) : null;
      const isValid = cacheAge !== null && cacheAge < CACHE_TTL_HOURS;

      return {
        hasThesis: !!deal.aiThesis,
        hasRisks: Array.isArray(deal.aiRisks) && deal.aiRisks.length > 0,
        cacheAge,
        isValid,
      };
    } catch (error) {
      console.error('[AICache] Error getting stats:', error);
      return { hasThesis: false, hasRisks: false, cacheAge: null, isValid: false };
    }
  },

  /**
   * Generic in-memory cache get (for non-deal-specific data)
   */
  async get(key: string): Promise<any | null> {
    const cached = memoryCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    console.log(`[AICache] Memory HIT for key: ${key}`);
    return cached.data;
  },

  /**
   * Generic in-memory cache set (for non-deal-specific data)
   */
  async set(key: string, data: any, ttlMs: number = 5 * 60 * 1000): Promise<void> {
    memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    console.log(`[AICache] Memory STORED for key: ${key} (TTL: ${ttlMs / 1000}s)`);
  },
};

/**
 * Calculate age in hours from ISO timestamp
 */
function getAgeInHours(timestamp: string): number {
  const then = new Date(timestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60);
}

export default AICache;
