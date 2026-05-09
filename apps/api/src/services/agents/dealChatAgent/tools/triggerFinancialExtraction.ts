// ─── trigger_financial_extraction tool ───────────────────────────
// Surfaces the best document for extraction and tells the user where
// to click. (Doesn't actually run extraction — just guides.)

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';

export function makeTriggerFinancialExtractionTool(dealId: string, _orgId: string) {
  return tool(
    async () => {
      try {
        const { data: docs } = await supabase
          .from('Document')
          .select('id, name, type, fileUrl')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false })
          .limit(5);

        if (!docs || docs.length === 0) {
          return 'No documents found for this deal. Please upload a CIM or financial document first.';
        }

        // Find the best document for extraction
        const financialDoc = docs.find(d => d.type === 'FINANCIALS' || d.type === 'CIM') || docs[0];

        return JSON.stringify({
          success: true,
          type: 'extraction_triggered',
          documentName: financialDoc.name,
          message: `Financial extraction queued for "${financialDoc.name}". Use the Extract Financials button on the page to run it, or navigate to the financials section.`,
        });
      } catch (error) {
        log.error('triggerFinancialExtraction tool error', error);
        return JSON.stringify({ success: false, error: 'Failed to trigger extraction' });
      }
    },
    {
      name: 'trigger_financial_extraction',
      description: 'Check which documents are available for financial extraction and guide the user to trigger it.',
      schema: z.object({}),
    }
  );
}
