// ─── draft_email tool ────────────────────────────────────────────
// Calls the emailDrafter agent and surfaces the result + compliance.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { log } from '../../../../utils/logger.js';
import { generateEmailDraft } from '../../emailDrafter/index.js';

export function makeDraftEmailTool(dealId: string, orgId: string) {
  return tool(
    async ({ recipient, purpose, tone }) => {
      try {
        const result = await generateEmailDraft({
          organizationId: orgId,
          dealId,
          purpose,
          context: recipient,
          tone: tone || 'formal',
        });

        if (result.status === 'failed') {
          return `Email draft failed: ${result.error || 'Unknown error'}`;
        }

        const parts = [
          `**Subject:** ${result.subject}\n`,
          result.draft,
        ];
        if (result.suggestions.length) {
          parts.push(`\n**Suggestions:** ${result.suggestions.join('; ')}`);
        }
        if (!result.isCompliant && result.complianceIssues.length) {
          parts.push(`\n**Compliance Notes:** ${result.complianceIssues.join('; ')}`);
        }

        return parts.join('\n');
      } catch (error) {
        log.error('draftEmail tool error', error);
        return 'Failed to draft email. Please try again.';
      }
    },
    {
      name: 'draft_email',
      description: 'Draft a professional email related to this deal. Returns subject line, body, and compliance check.',
      schema: z.object({
        recipient: z.string().describe('Who the email is for (e.g., "management team", "broker", "legal counsel")'),
        purpose: z.string().describe('Purpose of the email (e.g., "request additional financials", "schedule site visit", "follow up on LOI")'),
        tone: z.enum(['formal', 'casual', 'direct']).default('formal').describe('Email tone'),
      }),
    }
  );
}
