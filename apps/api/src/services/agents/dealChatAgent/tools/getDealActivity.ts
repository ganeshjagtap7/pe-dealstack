// ─── get_deal_activity tool ──────────────────────────────────────
// Fetches the deal's recent activity timeline.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';

export function makeGetDealActivityTool(dealId: string, _orgId: string) {
  return tool(
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
}
