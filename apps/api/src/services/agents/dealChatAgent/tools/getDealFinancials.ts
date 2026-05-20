// ─── get_deal_financials tool ─────────────────────────────────────
// Reads extracted FinancialStatement rows + deal-level metrics and
// formats them as Markdown for the chat agent.
//
// Bug history: this tool previously selected `extractedData` and
// `confidence` columns that don't exist on FinancialStatement (the
// real columns are `lineItems` and `extractionConfidence`). Supabase
// returned a PostgrestError + null data for every deal, so the tool
// always reported "No financial statements extracted for this deal
// yet." even when statements existed (the DMpro report). The select
// list now matches the memoAgent equivalent in
// `services/agents/memoAgent/tools.ts` and the error from Supabase
// is surfaced into the tool's return value so future regressions
// fail loudly instead of looking like "empty extraction".

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../../supabase.js';
import { log } from '../../../../utils/logger.js';
import { formatDealHeadline, formatFinancialValue, type UnitScale } from '../../../../utils/financialFormat.js';

export function makeGetDealFinancialsTool(dealId: string, _orgId: string) {
  return tool(
    async () => {
      try {
        // Fetch ALL statements (active + inactive/needs_review) so chat sees
        // what the user sees. Column names MUST match the Prisma schema:
        // `lineItems` (Record<string, number | null>), not `extractedData`;
        // `extractionConfidence` (0-100), not `confidence`.
        //
        // Pull `unitScale` + `currency` so we can render values at the right
        // magnitude (e.g. ACTUALS 6900 → "$6.9K", MILLIONS 6.9 → "$6.9M").
        // Before this fix, every value was rendered with a hardcoded "M"
        // suffix — a $6,900 deal showed as "$6,900M" in the agent's view.
        const { data: statements, error } = await supabase
          .from('FinancialStatement')
          .select('statementType, period, lineItems, unitScale, currency, extractionConfidence, extractionSource, isActive')
          .eq('dealId', dealId)
          .order('period', { ascending: false });

        if (error) {
          log.error('getDealFinancials tool: supabase select failed', { dealId, error });
          return `Error fetching financial statements: ${error.message}. Treat as a transient backend failure — do NOT tell the user "no financials were extracted" based on this response.`;
        }

        if (!statements || statements.length === 0) {
          return 'No financial statements extracted for this deal yet.';
        }

        const activeStatements = statements.filter(s => s.isActive);
        const inactiveStatements = statements.filter(s => !s.isActive);

        const summary: string[] = [
          `Found ${statements.length} financial statements (${activeStatements.length} active, ${inactiveStatements.length} pending review). Active + pending statements ALL count as extracted data — render charts from them.`,
        ];

        // Group by type
        const byType: Record<string, typeof statements> = {};
        for (const s of statements) {
          byType[s.statementType] = byType[s.statementType] || [];
          byType[s.statementType].push(s);
        }

        for (const [type, stmts] of Object.entries(byType)) {
          summary.push(`\n**${type}** (${stmts.length} periods):`);
          for (const s of stmts.slice(0, 8)) {
            const items = s.lineItems && typeof s.lineItems === 'object'
              ? (s.lineItems as Record<string, number | null>)
              : {};
            const entries = Object.entries(items).filter(([, v]) => v !== null && v !== undefined);
            const revenue = entries.find(([k]) =>
              k.toLowerCase().includes('revenue') || k.toLowerCase().includes('net sales')
            );
            const ebitda = entries.find(([k]) => k.toLowerCase().includes('ebitda'));
            const statusNote = s.isActive ? '' : ' (pending merge review)';

            // Render at the row's actual unitScale + currency. ACTUALS keeps
            // raw dollars, MILLIONS expands to $X.XM, etc — drops the
            // previous always-"M" suffix that mis-tagged every non-MILLIONS
            // statement in the agent's view.
            const rowScale = (s.unitScale ?? 'ACTUALS') as UnitScale;
            const rowCurrency = s.currency ?? 'USD';
            summary.push(
              `  - ${s.period}: ${entries.length} line items, confidence ${s.extractionConfidence ?? 'N/A'}%, source: ${s.extractionSource}${statusNote} [scale: ${rowScale} ${rowCurrency}]`
            );
            if (revenue) summary.push(`    ${revenue[0]}: ${formatFinancialValue(revenue[1] as number, rowScale, { currency: rowCurrency })}`);
            if (ebitda) summary.push(`    ${ebitda[0]}: ${formatFinancialValue(ebitda[1] as number, rowScale, { currency: rowCurrency })}`);
          }
        }

        // Also fetch deal-level financial metrics — including the cached
        // ACTUAL-DOLLAR columns so formatDealHeadline picks the right scale.
        const { data: deal } = await supabase
          .from('Deal')
          .select('revenue, ebitda, dealSize, currency, cachedRevenue, cachedEbitda, cachedEbitdaMargin, cachedPeriod, cachedCurrency, irrProjected, mom')
          .eq('id', dealId)
          .single();

        if (deal) {
          summary.push('\n**Deal-Level Metrics:**');
          const headline = formatDealHeadline(deal);
          if (headline.revenue) summary.push(`  Revenue: ${headline.revenue}${headline.cachedPeriod ? ` (${headline.cachedPeriod})` : ''}`);
          if (headline.ebitda)  summary.push(`  EBITDA: ${headline.ebitda}${headline.cachedPeriod ? ` (${headline.cachedPeriod})` : ''}`);
          if (headline.dealSize) summary.push(`  Deal Size: ${headline.dealSize}`);
          if (headline.ebitdaMargin) summary.push(`  EBITDA Margin: ${headline.ebitdaMargin}`);
          if (deal.irrProjected) summary.push(`  Projected IRR: ${deal.irrProjected}%`);
          if (deal.mom) summary.push(`  MoM: ${deal.mom}x`);
        }

        return summary.join('\n');
      } catch (error) {
        log.error('getDealFinancials tool error', error);
        return 'Error fetching financial data.';
      }
    },
    {
      name: 'get_deal_financials',
      description: 'Fetch extracted financial statements and deal-level metrics (revenue, EBITDA, IRR, MoM). Use when user asks about financials, numbers, revenue trends, or analysis.',
      schema: z.object({}),
    }
  );
}
