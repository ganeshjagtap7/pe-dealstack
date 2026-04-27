/**
 * extractionPrompt.ts — Shared prompt template for financial extraction.
 * Used by both text classifier (GPT-4o) and vision extractor (GPT-4o Vision).
 * Single source of truth — prevents prompt drift between extraction paths.
 */

/** Known line item keys per statement type, for prompt guidance */
export const LINE_ITEM_KEYS = {
  INCOME_STATEMENT: 'revenue, cogs, gross_profit, gross_margin_pct, sga, rd, other_opex, total_opex, ebitda, ebitda_margin_pct, da, ebit, interest_expense, ebt, tax, net_income, sde',
  BALANCE_SHEET: 'cash, accounts_receivable, inventory, other_current_assets, total_current_assets, ppe_net, goodwill, intangibles, total_assets, accounts_payable, short_term_debt, other_current_liabilities, total_current_liabilities, long_term_debt, total_liabilities, total_equity',
  CASH_FLOW: 'operating_cf, capex, fcf, acquisitions, debt_repayment, dividends, net_change_cash',
};

/**
 * Build the extraction system prompt.
 * @param options.includeSourceCitations — whether to require _source fields (text path: yes, vision: optional)
 * @param options.currencyHint — pre-detected currency to guide extraction
 */
export function buildExtractionPrompt(options?: {
  includeSourceCitations?: boolean;
  currencyHint?: string;
}): string {
  const { includeSourceCitations = true, currencyHint } = options ?? {};

  const currencyHintLine = currencyHint
    ? `\nNOTE: The document currency has been pre-detected as ${currencyHint}. Verify this against the document content.\n`
    : '';

  const sourceCitationRules = includeSourceCitations
    ? `6. For EVERY extracted value, include a source_quote: the exact text from the document where you found that number
7. confidence: 90-100 = explicitly stated with source quote, 70-89 = clearly implied, 50-69 = partially inferred, 0-49 = uncertain`
    : `6. confidence: 90-100 = explicitly stated, 70-89 = clearly implied, 50-69 = partially inferred, 0-49 = uncertain`;

  const sourceExample = includeSourceCitations
    ? `            "revenue": 125.3,
            "revenue_source": "Total Revenue of $125.3 million (p.12)",
            "ebitda": 31.2,
            "ebitda_source": "Adjusted EBITDA was $31.2M",
            "gross_margin_pct": 65.2,
            "gross_margin_pct_source": "Gross Margin: 65.2%"`
    : `            "revenue": 12.5, "ebitda": 3.1, "ebitda_margin_pct": 24.8`;

  const sourceImportant = includeSourceCitations
    ? `\nIMPORTANT: For every numeric value you extract, include a corresponding _source field with the exact text from the document. For example: "revenue": 50.3, "revenue_source": "Revenue of $50.3M for FY2023"`
    : `\nIMPORTANT: margins/percentages as numbers (e.g. 25.5 means 25.5%), NOT decimals.`;

  return `You are a senior private equity analyst extracting structured financial data from deal documents (CIMs, teasers, standalone financials).

Your task: find ALL financial statements in the document and return them as structured JSON.
${currencyHintLine}
STEP 0 — IDENTIFY CURRENCY:
Before extracting any financial data, determine the document currency:
- Look for symbols: $, €, £, ₹, ¥
- Look for text: "USD", "EUR", "GBP", "INR", "JPY", "dollars", "euros", "pounds", "rupees"
- If multiple currencies appear, use the one in the main financial statements
- Return the ISO 4217 code (e.g. "USD", "INR", "EUR")
- Default to "USD" only if genuinely no currency indicator found

STEP 1 — IDENTIFY UNITS:
Search the document for unit declarations:
- Header text: "in thousands", "in millions", "$000s", "₹ Cr", "€M"
- Table headers: "(000s)", "(mn)", "(Cr)", "(Lakh)"
- Footnotes: "All figures in millions unless otherwise stated"
State your finding in the "unitsDetected" field.
If NO unit declaration is found:
- Examine number magnitudes in context of company size
- Revenue of "125,000" for a mid-market company → likely thousands ($125M)
- Revenue of "125" → likely already in millions
- Set confidence to 70 max when units are inferred, not declared

STEP 2 — EXTRACT:
1. Extract EVERY year/period column you find — do not skip any
2. Normalize ALL values to MILLIONS in the ORIGINAL currency (see conversion below)
3. Label each period: HISTORICAL (past actuals), PROJECTED (forecasts), or LTM (last twelve months)
4. Projected periods are identified by: "E", "F", "Est", "Forecast", "Budget", "Proj" suffix, or future years
5. If a value is not present, use null — never guess
${sourceCitationRules}

Use these line item keys exactly:
INCOME STATEMENT: ${LINE_ITEM_KEYS.INCOME_STATEMENT}
BALANCE SHEET: ${LINE_ITEM_KEYS.BALANCE_SHEET}
CASH FLOW: ${LINE_ITEM_KEYS.CASH_FLOW}

UNIT CONVERSION (always convert to millions in the original currency — do NOT convert between currencies):
- "50M" or "50,000" (when header says 000s) → 50
- "1.5B" or "1,500,000" (when header says 000s) → 1500
- "500K" or "500" (when header says 000s) → 0.5
- "38,200" (raw units) → 0.0382
- "₹50 Cr" (crore = 10M) → 500
- "₹50 Lakh" (lakh = 0.1M) → 5

STEP 3 — VERIFY YOUR MATH:
Before returning, check these relationships:
1. revenue - cogs = gross_profit (within 1%)
2. ebitda / revenue * 100 ≈ ebitda_margin_pct (within 1 percentage point)
3. ebitda - da = ebit (within 1%)
4. total_assets ≈ total_liabilities + total_equity (within 1%)
5. operating_cf - capex = fcf (within 1%)
If any check fails, re-examine your extraction and fix the error.
If the source document itself has inconsistent numbers, set confidence to 60-70 and add a warning.

Return JSON with this structure:
{
  "unitsDetected": "string describing units found",
  "statements": [
    {
      "statementType": "INCOME_STATEMENT | BALANCE_SHEET | CASH_FLOW",
      "unitScale": "MILLIONS",
      "currency": "USD",
      "periods": [
        {
          "period": "2023",
          "periodType": "HISTORICAL | PROJECTED | LTM",
          "confidence": 90,
          "lineItems": {
${sourceExample}
          }
        }
      ]
    }
  ],
  "overallConfidence": 88,
  "warnings": []
}
${sourceImportant}

If no financial data exists, return:
{ "unitsDetected": "none", "statements": [], "overallConfidence": 0, "warnings": ["No financial data found"] }`;
}
