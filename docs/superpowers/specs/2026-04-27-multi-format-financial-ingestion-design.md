# Multi-Format Financial Data Ingestion — Design Spec

**Date:** 2026-04-27
**Goal:** Support Stripe exports, bank statements, and accounting exports alongside traditional CIMs/financial PDFs. Parse and show what's there. Report what's missing. Never assume.
**Principle:** No guessing, no inflating, no fabricating. Show raw data + computed summary. Tell user what's missing.

---

## Problem

The extraction pipeline only understands 3-statement financial models (P&L, Balance Sheet, Cash Flow from CIMs/PDFs/Excel). When users upload transaction-level data (Stripe CSVs, bank statements), GPT-4o tries to shoehorn individual transactions into income statement format — inflating $2,100 revenue to $2.1M. The pipeline needs dedicated parsers for each document type instead of one-size-fits-all AI extraction.

---

## Document Type Selection

When user clicks "Extract Financials", show a type picker modal before extraction begins:

| Type | Icon | Label | Description | Parser |
|------|------|-------|-------------|--------|
| Financial Statements | table_chart | Financial Statements | CIM, P&L, Balance Sheet, Cash Flow PDF/Excel | Existing LangGraph agent |
| Payment Data | credit_card | Payment Data | Stripe, PayPal, Square CSV export | CSV parser (no AI) |
| Bank Statement | account_balance | Bank Statement | Bank PDF/CSV (Chase, BofA, etc.) | PDF/CSV parser + light AI for categorization |
| Accounting Export | receipt_long | Accounting Export | QuickBooks, Xero, FreshBooks export | CSV/Excel parser |
| Auto-detect | auto_awesome | Auto-detect | Let AI figure it out | Existing pipeline with type hint |

### UI: Type Picker Modal

Rendered inside the existing financial statements section when user clicks "Extract Financials". 5 clickable cards in a grid. After selection, extraction proceeds with the chosen parser.

**Fallback:** If user selects "Auto-detect", the existing LangGraph agent runs. But all other types use dedicated parsers.

### Files Modified
- `apps/web/js/financials.js` — `handleExtract()` shows type picker before calling API
- `apps/api/src/routes/financials-extraction.ts` — accepts `documentType` parameter, routes to correct parser

---

## Payment Data Parser (Stripe, PayPal, Square)

### No AI Required

This is pure programmatic parsing. No GPT-4o calls. 100% deterministic, 100% accurate.

### Detection: Known CSV Formats

**Stripe:** Headers include `Amount`, `Currency`, `Status`, `Customer Email`, `Description`
**PayPal:** Headers include `Gross`, `Fee`, `Net`, `From Email Address`, `Status`
**Square:** Headers include `Gross Sales`, `Discounts`, `Net Sales`, `Transaction ID`

Parser detects format from CSV headers automatically.

### Processing Pipeline

```
1. Read CSV → detect format (Stripe/PayPal/Square)
2. Normalize columns to standard schema:
   { date, amount, currency, status, customerEmail, description, type, refundAmount }
3. Filter: status === 'Paid' AND NOT fully refunded
4. Categorize: subscription vs trial vs one-time vs credit_purchase (from metadata)
5. Aggregate by month:
   - Total revenue (sum of paid, non-refunded amounts)
   - Transaction count
   - Average transaction size
   - Unique customers
   - MRR (subscription payments only)
   - Trial count and conversion rate
   - Refund total and rate
6. Store as FinancialStatement rows:
   - statementType: 'INCOME_STATEMENT'
   - period: 'Jan-26', 'Feb-26', etc.
   - lineItems: { revenue, mrr, trial_revenue, subscription_revenue, refunds, transaction_count, unique_customers }
   - extractionSource: 'csv_parser'
   - extractionConfidence: 100 (deterministic — no guessing)
```

### Stripe-Specific Logic

From the Stripe CSV schema:
- `Status === 'Paid'` → include in revenue
- `Status === 'Failed'` or `Status === 'Refunded'` → exclude from revenue
- `Amount Refunded > 0` → deduct from that month's revenue
- `purpose (metadata) === 'trial_activation'` → categorize as trial revenue
- `Description` contains "Subscription" → categorize as subscription revenue
- `Customer Email` → count unique customers per month

### Output: What User Sees

**Two views in the financial table:**

**View 1 — Monthly Summary (default)**

Table with columns: Month, Revenue, MRR, Trials, Subscriptions, Refunds, Customers, Avg Transaction

| Month | Revenue | MRR | Trials | Subs | Refunds | Customers | Avg |
|-------|---------|-----|--------|------|---------|-----------|-----|
| Jan-26 | $2,102 | $1,789 | $13 | $2,089 | -$158 | 18 | $84 |
| Feb-26 | $258 | $245 | $13 | $245 | -$111 | 12 | $17 |

**View 2 — Raw Transactions (toggle)**

Full transaction table with search/filter:

| Date | Amount | Customer | Type | Description | Status |
|------|--------|----------|------|-------------|--------|
| 2026-04-22 | $148.00 | mshaheen@... | Subscription | Subscription creation | Paid |

### Missing Data Notice

Always shown below the table:

```
This is payment transaction data — not a financial statement.
Available: Revenue, MRR, Customer metrics
Missing: COGS, Gross Profit, EBITDA, Operating Expenses, Balance Sheet, Cash Flow

Upload a P&L, financial model, or accounting export for full 3-statement analysis.
```

### Files Created
- `apps/api/src/services/parsers/stripeParser.ts` — Stripe CSV parsing + aggregation
- `apps/api/src/services/parsers/paypalParser.ts` — PayPal CSV parsing
- `apps/api/src/services/parsers/parserRouter.ts` — detects format, routes to correct parser

---

## Bank Statement Parser

### Light AI + Programmatic Parsing

Bank statements come as PDFs (need OCR/parsing) or CSVs. The main challenge is **categorizing** transactions as revenue vs expense.

### Processing Pipeline

```
1. If PDF → extract text via pdf-parse or Azure Document Intelligence
2. If CSV → read directly
3. Parse transactions: date, description, amount (positive = deposit, negative = debit)
4. Categorize with simple rules:
   - Deposits > $0 → Revenue / Inflows
   - Debits < $0 → Expenses / Outflows
   - Known patterns: "PAYROLL" → Payroll expense, "RENT" → Rent, etc.
5. Aggregate by month: total inflows, total outflows, net, ending balance
6. Store as FinancialStatement with extractionSource: 'bank_parser'
```

### Output

| Month | Inflows | Outflows | Net | End Balance |
|-------|---------|----------|-----|------------|
| Jan-26 | $15,200 | -$12,800 | $2,400 | $45,600 |

Missing data notice: "This is bank transaction data. Available: Cash inflows/outflows. Missing: Revenue breakdown, COGS, EBITDA, P&L."

### Files Created
- `apps/api/src/services/parsers/bankParser.ts`

---

## Accounting Export Parser

### Programmatic Parsing

QuickBooks/Xero exports are structured — they already have categorized P&L data.

### Processing Pipeline

```
1. Read CSV/Excel
2. Detect format (QuickBooks vs Xero vs FreshBooks from headers)
3. Map categories to standard line items:
   - "Total Income" → revenue
   - "Cost of Goods Sold" → cogs
   - "Gross Profit" → gross_profit
   - "Total Expenses" → total_opex
   - "Net Income" → net_income
4. Store as FinancialStatement rows (same as existing extraction)
```

This is the most accurate source — accounting data is already categorized by humans.

### Files Created
- `apps/api/src/services/parsers/accountingParser.ts`

---

## API Changes

### Updated Extraction Endpoint

`POST /api/deals/:dealId/financials/extract`

New request body:
```json
{
  "documentId": "uuid",
  "documentType": "financial_statements" | "payment_data" | "bank_statement" | "accounting_export" | "auto_detect"
}
```

If `documentType` is not `financial_statements` or `auto_detect`, skip the LangGraph agent entirely and route to the appropriate parser.

### Response Format

Same response structure as existing (backwards compatible):
```json
{
  "success": true,
  "documentUsed": { "id": "...", "name": "..." },
  "extractionMethod": "csv_parser",
  "result": {
    "statementsStored": 4,
    "periodsStored": 4,
    "overallConfidence": 100,
    "warnings": ["This is payment data. Balance Sheet and Cash Flow not available."]
  }
}
```

---

## Database: No Schema Changes

All parsed data stores in the existing `FinancialStatement` table:
- `extractionSource`: `'csv_parser'`, `'bank_parser'`, or `'accounting_parser'`
- `lineItems`: JSONB with parser-specific fields (revenue, mrr, unique_customers, etc.)
- `extractionConfidence`: `100` for deterministic parsers (no guessing)
- `statementType`: `'INCOME_STATEMENT'` for all transaction parsers (no BS/CF from transactions)

---

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| 1 | Document type picker UI + API routing | 2-3 hours |
| 2 | Stripe CSV parser (handles the DMPRO case) | 3-4 hours |
| 3 | PayPal/Square parsers (similar to Stripe) | 2-3 hours |
| 4 | Bank statement parser (PDF + CSV) | 4-5 hours |
| 5 | Accounting export parser (QuickBooks/Xero) | 3-4 hours |

**Phase 1+2 are the priority** — they solve the immediate problem (DMPRO Stripe CSV) and establish the pattern.

---

## What This Does NOT Do

- Does not modify the existing LangGraph financial statement pipeline
- Does not use AI for CSV parsing (100% deterministic)
- Does not fabricate Balance Sheet or Cash Flow from transaction data
- Does not auto-detect document type (user picks — explicit is better than magic)
- Does not support real-time Stripe API integration (only CSV exports)

---

## Success Criteria

1. User uploads Stripe CSV → sees accurate monthly revenue matching Stripe dashboard
2. Confidence is 100% for parsed CSV data (no guessing)
3. Missing statement types (BS, CF) are explicitly labeled as missing
4. Existing CIM/PDF extraction continues to work unchanged
5. Type picker is intuitive — user understands which option to pick
