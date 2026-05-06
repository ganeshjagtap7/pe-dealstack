// ─── Memo regenerate-all-sections route ───────────────────────────
// POST /api/memos/:id/generate-all — re-runs the memo agent for all
// sections of a memo. Requires the memo to have a bound dealId.

import { Router } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId } from '../middleware/orgScope.js';
import { generateAllSections } from '../services/agents/memoAgent/index.js';
import { isLLMAvailable } from '../services/llm.js';
import { classifyAIError } from '../utils/aiErrors.js';

const router = Router();

// POST /api/memos/:id/generate-all - Regenerate all sections
router.post('/:id/generate-all', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: memo } = await supabase
      .from('Memo')
      .select('id, dealId')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (!memo) return res.status(404).json({ error: 'Memo not found' });
    if (!memo.dealId) {
      return res.status(400).json({
        error: "This memo isn't attached to a deal — attach one before generating AI sections. Open the memo and pick a deal from the title bar, or recreate the memo via the Create Memo modal with a deal selected.",
        code: 'MEMO_MISSING_DEAL',
      });
    }
    if (!isLLMAvailable()) return res.status(503).json({ error: 'AI service unavailable' });

    const { sections: generated } = await generateAllSections(memo.dealId, orgId);

    let completed = 0;
    for (const gen of generated) {
      const { data: existing } = await supabase
        .from('MemoSection')
        .select('id')
        .eq('memoId', id)
        .eq('type', gen.type)
        .single();

      const updateData: any = {
        content: gen.content,
        aiGenerated: gen.aiGenerated,
        aiModel: gen.aiModel,
        updatedAt: new Date().toISOString(),
      };
      if (gen.tableData) updateData.tableData = gen.tableData;
      if (gen.chartConfig) updateData.chartConfig = gen.chartConfig;

      if (existing) {
        await supabase.from('MemoSection').update(updateData).eq('id', existing.id);
      } else {
        // Normalize type to match DB CHECK constraint
        const DB_TYPE_MAP: Record<string, string> = {
          'EXIT_ANALYSIS': 'EXIT_STRATEGY',
          'VALUE_CREATION_PLAN': 'VALUE_CREATION',
          'QUALITY_OF_EARNINGS': 'FINANCIAL_PERFORMANCE',
          'MANAGEMENT_ASSESSMENT': 'CUSTOM',
          'OPERATIONAL_DEEP_DIVE': 'CUSTOM',
        };
        const normalizedType = DB_TYPE_MAP[gen.type] || gen.type;
        await supabase.from('MemoSection').insert({
          memoId: id, type: normalizedType, title: gen.title,
          sortOrder: (gen as any).sortOrder || completed + 1,
          status: 'DRAFT', ...updateData,
        });
      }
      completed++;
    }

    const { data: refreshedSections } = await supabase
      .from('MemoSection')
      .select('*')
      .eq('memoId', id)
      .order('sortOrder', { ascending: true });

    res.json({ success: true, completed, total: generated.length, sections: refreshedSections || [] });
  } catch (error: any) {
    log.error('Generate-all failed', error);
    res.status(500).json({ error: classifyAIError(error.message || 'Failed to regenerate memo') });
  }
});

export default router;
