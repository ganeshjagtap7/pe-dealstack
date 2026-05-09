// ─── change_deal_stage tool ──────────────────────────────────────
// Advance / move back / close the deal pipeline stage.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';

export function makeChangeDealStageTool(dealId: string, _orgId: string) {
  return tool(
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
}
