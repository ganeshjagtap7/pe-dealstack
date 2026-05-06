// ─── add_note tool ───────────────────────────────────────────────
// Append a note / call log / email log / meeting note to the deal
// activity feed.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';

export function makeAddNoteTool(dealId: string, _orgId: string) {
  return tool(
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
}
