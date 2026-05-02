// ─── Deep research — progress persistence ────────────────────────
// Writes the current Phase 2 progress to Organization.settings.deepResearch
// so the UI can poll status while the long-running task is in flight.

import { supabase } from '../../../supabase.js';
import { log } from '../../../utils/logger.js';

export interface DeepResearchProgress {
  status: 'running' | 'complete' | 'failed';
  startedAt: string;
  completedAt?: string;
  queriesRun: number;
  insightsFound: number;
  error?: string;
}

export async function updateProgress(orgId: string, progress: DeepResearchProgress): Promise<void> {
  if (!orgId) return;
  try {
    const { data: org } = await supabase
      .from('Organization')
      .select('settings')
      .eq('id', orgId)
      .single();
    const settings = (org?.settings || {}) as Record<string, any>;
    settings.deepResearch = progress;
    await supabase.from('Organization').update({ settings }).eq('id', orgId);
  } catch (error) {
    log.warn('Deep research: failed to update progress', { error: (error as Error).message });
  }
}
