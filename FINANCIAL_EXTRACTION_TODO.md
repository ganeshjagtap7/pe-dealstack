# Structured Financial Table Extraction — Brainstorm & TODO

> **Goal:** "AI that auto-extracts financials" — matching LMM OS landing page claims
> **Status:** IN PROGRESS — building Week 1 foundation
> **Date:** Feb 27, 2026
> **Stack decisions:** GPT-4o only (Azure later), synchronous API calls (no bg jobs), JSONB for lineItems

---

## Implementation Progress

### TASK 1 — Database Migration [x]
Create `financial-statement-migration.sql` and add model to `schema.prisma`

**Subtasks:**
- [x] 1a. Write `FinancialStatement` table SQL (Supabase-compatible, camelCase, UUID PKs)
- [x] 1b. Add indexes (dealId, documentId, statementType) + updatedAt trigger
- [x] 1c. Update `schema.prisma` with the FinancialStatement model (for TypeScript types)
- [x] 1d. **USER runs SQL in Supabase SQL Editor** → confirmed success

---

### TASK 2 — Financial Classifier Service [x]
`apps/api/src/services/financialClassifier.ts`

**Subtasks:**
- [x] 2a. Define TypeScript types: `StatementType`, `PeriodType`, `FinancialPeriod`, `ClassifiedStatement`, `ClassificationResult`
- [x] 2b. Write GPT-4o prompt that extracts full 3-statement from raw document text
- [x] 2c. Handles: multi-year columns, historical vs projected labels, unit detection ($K/$M/$B → normalize to $M)
- [x] 2d. Returns structured JSON matching DB schema, with normalization + validation helpers

---

### TASK 3 — Extraction Orchestrator [x]
`apps/api/src/services/financialExtractionOrchestrator.ts`

**Subtasks:**
- [x] 3a. Fast pass — wraps existing aiExtractor, returns top-line immediately
- [x] 3b. Deep pass — calls financialClassifier, upserts each (statementType, period) row to DB
- [x] 3c. Azure-ready: only classifyFinancials() + runDeepPass() need to change when Azure added
- [x] 3d. Combined runFullExtraction() for re-extraction use case

---

### TASK 4 — Enhanced Validation Engine [x]
Extend `apps/api/src/services/financialValidator.ts`

**Subtasks:**
- [x] 4a. Income statement: Revenue - COGS = Gross Profit (±5% tolerance), EBITDA - D&A = EBIT
- [x] 4b. Balance sheet: Assets = Liabilities + Equity, current ≤ total checks
- [x] 4c. Cash flow: FCF = Operating CF - CapEx
- [x] 4d. Margin sanity: EBITDA margin range, mismatch vs extracted margin
- [x] 4e. YoY growth: flag >100% revenue swings, >20pp margin swings
- [x] 4f. `validateStatements()` returns `StatementsValidationResult` with checks[], errorCount, warningCount

---

### TASK 5 — API Routes [x]
`apps/api/src/routes/financials.ts` + register in `app.ts`

**Subtasks:**
- [x] 5a. `GET /api/deals/:dealId/financials` — all extracted statements
- [x] 5b. `GET /api/deals/:dealId/financials/summary` — top-line + sparkline periods
- [x] 5c. `PATCH /api/deals/:dealId/financials/:statementId` — user edits, records reviewedBy/At
- [x] 5d. `POST /api/deals/:dealId/financials/extract` — downloads doc, parses PDF, runs deep pass
- [x] 5e. `GET /api/deals/:dealId/financials/validation` — returns only failed checks (errors + warnings)
- [x] 5f. Registered in `app.ts` with auth middleware

---

### TASK 6 — Frontend (Week 3, deferred) [ ]
Deal page financial dashboard, editable table, charts, red flag alerts

---

---

## What We're Building

Upload a CIM or standalone financial PDF → system extracts a **full 3-statement financial model** (P&L, Balance Sheet, Cash Flow) across **all available years**, labels historicals vs projections, and presents it as an **editable table with charts** in the deal view.

---

## Scope Summary (from brainstorm)

| Decision | Answer |
|---|---|
| Document types | CIMs + standalone financials (PDFs and Excel) |
| Data points | Full 3-statement: P&L + Balance Sheet + Cash Flow |
| Years | Extract whatever's in the doc (flexible 2-7+ years) |
| Projections | Extract historicals; flag/label projections separately |
| Engine | Azure Doc Intelligence for table extraction + text-first with GPT-4o Vision fallback |
| UI | Editable financial table + auto-generated charts |
| V1 priority | 80/20 — fast top-line (Revenue, EBITDA, margins), full 3-statement async in background |

---

## Architecture: 3-Layer Extraction Pipeline

```
PDF Upload
    │
    ▼
┌─────────────────────────────────────┐
│  Layer 1: Azure Document Intelligence│  (table structure extraction)
│  - Extracts raw table cells/rows     │
│  - Identifies table boundaries       │
│  - Returns structured table JSON     │
│  - ~$1.50 per 1000 pages             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 2: AI Classification (GPT-4o)│  (understand what the tables mean)
│  - Classify: is this a P&L? BS? CF? │
│  - Map rows to standard line items   │
│  - Identify year columns             │
│  - Flag historical vs projected      │
│  - Handle unit detection ($K, $M)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Layer 3: Validation + Storage       │
│  - Cross-check math (Rev - COGS = GP)│
│  - Flag anomalies / red flags        │
│  - Store in FinancialStatement table │
│  - Compute derived metrics (margins) │
└─────────────────────────────────────┘

FALLBACK: If Azure fails or confidence < threshold
    → Send page images to GPT-4o Vision for direct table extraction
```

---

## What Needs to Be Built

### Backend (apps/api/)

#### 1. Azure Document Intelligence Integration
- [ ] New service: `services/azureDocIntelligence.ts`
- [ ] Calls Azure "prebuilt-layout" model for table extraction
- [ ] Parses response into normalized table structure: `{ tables: [{ rows: [{ cells: [] }] }] }`
- [ ] Handles multi-page tables (tables that span page breaks)
- [ ] Environment config: `AZURE_DOC_INTEL_ENDPOINT`, `AZURE_DOC_INTEL_KEY`

#### 2. GPT-4o Vision Fallback
- [ ] New service: `services/visionExtractor.ts`
- [ ] Converts PDF pages to images (use `pdf-to-img` or `sharp` + `pdf-parse`)
- [ ] Sends page images to GPT-4o with structured output prompt
- [ ] Returns same normalized table format as Azure
- [ ] Triggered when: Azure confidence < 70% OR Azure returns no tables

#### 3. Financial Table Classifier (AI)
- [ ] New service: `services/financialClassifier.ts`
- [ ] Input: raw extracted tables from Layer 1
- [ ] GPT-4o prompt that:
  - Classifies each table as: INCOME_STATEMENT | BALANCE_SHEET | CASH_FLOW | KPI_TABLE | OTHER
  - Maps each row to a standard line item (see Standard Chart of Accounts below)
  - Identifies column headers as years (2021, 2022, 2023, FY2024E, etc.)
  - Labels each year column as HISTORICAL or PROJECTED
  - Detects units ($, $K, $M, $B) and normalizes everything to $M
- [ ] Confidence score per field

#### 4. Financial Data Model + Migration
- [ ] New DB table: `FinancialStatement`
  ```
  id UUID PK
  dealId UUID FK → Deal
  documentId UUID FK → Document (which doc it came from)
  statementType TEXT — INCOME_STATEMENT | BALANCE_SHEET | CASH_FLOW
  period TEXT — "2021" | "2022" | "LTM" | "2025E"
  periodType TEXT — HISTORICAL | PROJECTED | LTM
  lineItems JSONB — structured line items (see below)
  currency TEXT — USD (default)
  unitScale TEXT — MILLIONS | THOUSANDS | ACTUALS
  extractionConfidence INTEGER (0-100)
  extractedAt TIMESTAMPTZ
  reviewedAt TIMESTAMPTZ (null until human reviews)
  reviewedBy UUID FK → User
  createdAt TIMESTAMPTZ
  updatedAt TIMESTAMPTZ
  ```

- [ ] New DB table: `FinancialLineItem` (or store as JSONB in FinancialStatement)
  ```
  id UUID PK
  statementId UUID FK → FinancialStatement
  lineItemKey TEXT — "revenue", "cogs", "gross_profit", "ebitda", etc.
  lineItemLabel TEXT — original label from document ("Net Revenue", "Cost of Goods Sold")
  value DOUBLE PRECISION — normalized to $M
  confidence INTEGER (0-100)
  isComputed BOOLEAN — true if we calculated it (e.g., margin)
  source TEXT — "azure_table" | "vision_extraction" | "text_extraction" | "computed"
  notes TEXT — any flags or anomalies
  sortOrder INTEGER
  ```

#### 5. Standard Chart of Accounts (line item mapping)

**Income Statement:**
| Key | Label | Notes |
|---|---|---|
| `revenue` | Revenue / Net Sales | Top line |
| `cogs` | Cost of Goods Sold | |
| `gross_profit` | Gross Profit | Computed: revenue - cogs |
| `gross_margin` | Gross Margin % | Computed: gross_profit / revenue |
| `sga` | SG&A | Selling, General & Administrative |
| `rd` | R&D Expense | If applicable |
| `other_opex` | Other Operating Expenses | |
| `total_opex` | Total Operating Expenses | |
| `ebitda` | EBITDA | |
| `ebitda_margin` | EBITDA Margin % | Computed |
| `da` | Depreciation & Amortization | |
| `ebit` | EBIT / Operating Income | |
| `interest_expense` | Interest Expense | |
| `ebt` | Earnings Before Tax | |
| `tax` | Income Tax | |
| `net_income` | Net Income | |
| `sde` | Seller's Discretionary Earnings | Common in LMM deals |

**Balance Sheet:**
| Key | Label |
|---|---|
| `cash` | Cash & Equivalents |
| `accounts_receivable` | Accounts Receivable |
| `inventory` | Inventory |
| `other_current_assets` | Other Current Assets |
| `total_current_assets` | Total Current Assets |
| `ppe_net` | PP&E (Net) |
| `goodwill` | Goodwill |
| `intangibles` | Intangible Assets |
| `total_assets` | Total Assets |
| `accounts_payable` | Accounts Payable |
| `short_term_debt` | Short-Term Debt |
| `other_current_liabilities` | Other Current Liabilities |
| `total_current_liabilities` | Total Current Liabilities |
| `long_term_debt` | Long-Term Debt |
| `total_liabilities` | Total Liabilities |
| `total_equity` | Total Equity |

**Cash Flow Statement:**
| Key | Label |
|---|---|
| `operating_cf` | Operating Cash Flow |
| `capex` | Capital Expenditures |
| `fcf` | Free Cash Flow (Computed: operating_cf - capex) |
| `acquisitions` | Acquisitions |
| `debt_repayment` | Debt Repayment |
| `dividends` | Dividends |
| `net_change_cash` | Net Change in Cash |

#### 6. Extraction Orchestrator
- [ ] New service: `services/financialExtractionOrchestrator.ts`
- [ ] Coordinates the full pipeline:
  1. Receive PDF buffer
  2. **Fast pass (sync, <10s):** Text extraction → GPT-4o extracts top-line (Revenue, EBITDA, margins) → update Deal row immediately (existing flow, enhanced)
  3. **Deep pass (async, background job):** Azure Doc Intelligence → table classification → full 3-statement storage → validation
  4. Emit events/notifications when deep pass completes
- [ ] Handles the 80/20 split: user sees top-line fast, full detail loads async

#### 7. Validation Engine (enhanced)
- [ ] Extend existing `financialValidator.ts` with:
  - Math cross-checks: Revenue - COGS = Gross Profit (within tolerance)
  - Balance sheet balances: Assets = Liabilities + Equity
  - Cash flow ties to balance sheet: ending cash = beginning cash + net change
  - Margin sanity: EBITDA margin 5-60% normal for LMM
  - YoY growth sanity: flag >100% swings
  - Projected vs historical consistency: projections shouldn't be wildly different
- [ ] Each check produces a `ValidationResult`:
  ```
  { check: string, passed: boolean, severity: 'error' | 'warning' | 'info', message: string }
  ```

#### 8. API Routes
- [ ] `GET /api/deals/:dealId/financials` — Get all extracted financial statements for a deal
- [ ] `GET /api/deals/:dealId/financials/summary` — Top-line summary (latest year revenue, EBITDA, margins, growth rates)
- [ ] `PATCH /api/deals/:dealId/financials/:statementId` — User edits/corrects extracted data
- [ ] `POST /api/deals/:dealId/financials/reextract` — Re-run extraction on deal documents
- [ ] `GET /api/deals/:dealId/financials/validation` — Get validation results / red flags
- [ ] `POST /api/documents/:id/extract-financials` — Trigger extraction on a specific document

---

### Frontend (apps/web/)

#### 9. Financial Dashboard Component
- [ ] New component: `FinancialDashboard.tsx` (inside deal detail view)
- [ ] Tabs: Income Statement | Balance Sheet | Cash Flow | Summary
- [ ] Editable table (spreadsheet-like):
  - Rows = line items, Columns = years
  - Cells are editable (click to edit, saves via PATCH)
  - Projected years visually distinguished (italic or different bg color)
  - Confidence indicators: green (>80%), yellow (50-80%), red (<50%)
  - Hover to see source ("Extracted from CIM page 42")
- [ ] Loading states: top-line shows immediately, full table shows "Extracting detailed financials..." with progress

#### 10. Auto-Generated Charts
- [ ] Revenue trend line chart (multi-year)
- [ ] EBITDA & margin bar+line combo chart
- [ ] Revenue bridge / waterfall (if enough data)
- [ ] Balance sheet composition (stacked bar)
- [ ] Library: Chart.js or Recharts (check what's already in the project)

#### 11. Red Flag / Validation Alerts
- [ ] Banner or sidebar showing validation results
- [ ] Color-coded: red (errors), yellow (warnings), blue (info)
- [ ] Examples:
  - "EBITDA margin of 75% is unusually high — verify"
  - "Balance sheet doesn't balance: Assets ($45M) != Liabilities + Equity ($42M)"
  - "Revenue growth jumped from 5% to 85% in 2024 — verify"
  - "2025E projections show 3x revenue growth vs historical avg of 12%"

#### 12. Extraction Status Indicator
- [ ] In deal header or sidebar: "Financials: Extracted (92% confidence)" or "Extracting..."
- [ ] Click to see per-field confidence breakdown
- [ ] "Needs Review" badge if confidence < threshold

---

## Key Technical Questions Still Open

1. **Azure Doc Intelligence pricing** — Free tier gives 500 pages/month. Paid is $1.50/1000 pages. Good enough for MVP?

2. **FinancialLineItem: separate table vs JSONB?**
   - Separate table = easier to query, harder to update atomically
   - JSONB = simpler, atomic updates, but harder to query individual line items
   - **Leaning:** JSONB for V1, migrate to separate table if needed

3. **PDF-to-image conversion** — For GPT-4o Vision fallback, we need to convert PDF pages to PNG. Options:
   - `pdf-poppler` (needs system dependency)
   - `pdf2pic` (uses GraphicsMagick)
   - `pdfjs-dist` + canvas (pure JS but slower)
   - Or just send PDF directly to Azure (it handles it natively)

4. **How to handle Excel uploads?** — User uploads a .xlsx P&L:
   - Parse with existing `excelParser.ts` (already have this)
   - Enhance to detect financial statement structure in sheets
   - Probably easier than PDF extraction

5. **Multi-document merge for financials** — If user uploads CIM (has 2022-2024) then later uploads standalone 2025 P&L:
   - Merge into same timeline? Or keep separate per-document?
   - **Leaning:** Store per-document, show merged view in UI with source attribution

---

## Cost Estimate Per Deal

| Step | Cost |
|---|---|
| Azure Doc Intelligence (50-page CIM) | ~$0.075 |
| GPT-4o classification prompt (~2K tokens in, ~1K out) | ~$0.02 |
| GPT-4o Vision fallback (if needed, ~5 pages) | ~$0.10 |
| **Total per CIM** | **~$0.10 - $0.20** |

Very affordable. Even at 1000 deals/month = $100-200/month in AI costs.

---

## Matching the Landing Page Claims

| Claim | How We Deliver |
|---|---|
| "AI that auto-extracts financials" | Upload PDF → full 3-statement extracted in <60s, top-line in <10s |
| "Flags red flags" | Validation engine + AI analysis flags margin issues, math errors, anomalies |
| "Flags inconsistencies" | Multi-doc analyzer detects conflicts between CIM and standalone financials |
| "Extracts the key metrics" | Revenue, EBITDA, margins, growth, debt — all auto-extracted with confidence |
| "Makes everything searchable" | Already have RAG pipeline — financial data adds structured search |
| "Drop in a CIM, LOI, or P&L" | CIM + P&L extraction built here; LOI drafting is Phase 3 |

---

## Implementation Order (suggested)

```
Week 1: Foundation
  ├── DB migration (FinancialStatement table)
  ├── Azure Document Intelligence service
  ├── Basic table extraction → JSON pipeline
  └── API routes (GET/PATCH financials)

Week 2: Intelligence
  ├── Financial classifier (GPT-4o)
  ├── Standard chart of accounts mapping
  ├── GPT-4o Vision fallback service
  ├── Orchestrator (fast pass + deep pass)
  └── Enhanced validation engine

Week 3: Frontend
  ├── Financial dashboard component
  ├── Editable table with confidence indicators
  ├── Charts (revenue trend, EBITDA, margins)
  ├── Red flag alerts
  └── Extraction status indicators

Week 4: Polish
  ├── Multi-document financial merge view
  ├── Excel financial upload support
  ├── Edge cases & error handling
  └── Testing with real CIMs
```

---

## Dependencies / New Packages Needed

| Package | Purpose |
|---|---|
| `@azure/ai-form-recognizer` | Azure Document Intelligence SDK |
| `pdf2pic` or `pdfjs-dist` | PDF → image conversion for Vision fallback |
| `recharts` or `chart.js` | Financial charts in frontend |

---

## Notes

- This builds on top of the existing extraction pipeline (aiExtractor.ts) — not replacing it
- The fast pass (top-line extraction) IS the existing flow, just enhanced
- The deep pass (full 3-statement) is the NEW capability
- Everything stores back to the deal, so existing AI chat can reference financial data
