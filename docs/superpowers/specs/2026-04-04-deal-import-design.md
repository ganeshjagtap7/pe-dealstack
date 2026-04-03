# Deal Import — AI-Powered Bulk Import from Any Source

**Date:** 2026-04-04
**Status:** Approved
**Scope:** CSV/Excel upload + pasted text → AI mapping → bulk deal creation

## Problem

PE firms have existing deal pipelines in Notion, Airtable, Excel, Google Sheets, and other tools. There's no way to bring that data into PE OS without manually creating each deal. Column names and data structures vary wildly across firms — there's no single source of truth.

## Solution

An AI-powered import system that accepts any structured data (CSV, Excel, pasted text), uses GPT-4o to intelligently map foreign columns to our Deal schema, preserves unmapped fields in a `customFields` JSONB column, and lets users review everything before committing.

## Supported Formats (v1)

- CSV files (.csv)
- Excel files (.xlsx)
- Pasted text (tab-separated, comma-separated, or Notion/browser copy-paste)

Future: PDF pipeline reports, images/screenshots of spreadsheets.

---

## 1. Database Changes

### Migration: `apps/api/deal-import-migration.sql`

```sql
-- Deal Import: Add customFields JSONB for unmapped import data
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "customFields" JSONB DEFAULT '{}';
```

**Already run by user.** No new tables needed. The `customFields` column stores any field that doesn't map to an existing Deal column as key-value pairs.

Example:
```json
{
  "leadPartner": "John Smith",
  "fundName": "Fund III",
  "boardSeats": 2,
  "geographicRegion": "Southeast Asia",
  "coInvestors": "Sequoia, a16z"
}
```

---

## 2. API Endpoints

### 2.1 `POST /api/deals/import/analyze`

Accepts raw data, uses GPT-4o to produce column mapping and parsed preview.

**Request:**
- For CSV/paste: JSON body `{ "source": "csv" | "paste", "rawData": "...csv string or pasted text..." }`
- For Excel: `multipart/form-data` with `file` field (binary) + `source: "excel"`
- `multer` middleware handles file upload (already used in document upload routes)

**Response:**
```json
{
  "mapping": {
    "Target Company": { "field": "companyName", "confidence": 0.95 },
    "EV ($M)": { "field": "dealSize", "confidence": 0.9, "transform": "multiply_1000000" },
    "Board Seats": { "field": "customFields.boardSeats", "confidence": 1.0 }
  },
  "preview": [
    {
      "original": { "Target Company": "Acme Corp", "EV ($M)": "50", "Board Seats": "2" },
      "mapped": { "companyName": "Acme Corp", "dealSize": 50000000, "customFields": { "boardSeats": 2 } }
    }
  ],
  "totalRows": 100,
  "validRows": 97,
  "warnings": ["3 rows missing company name", "Column 'Status' has 2 values that don't match any known stage"],
  "unmappedColumns": ["Internal Notes"]
}
```

**Implementation:**
- Parse CSV/Excel/text into rows (server-side using `csv-parse` for CSV, `xlsx` for Excel)
- Send column headers + first 3 sample rows to GPT-4o
- GPT-4o returns structured JSON mapping with confidence scores and transforms
- Apply mapping to all rows, generate preview of first 10
- Validate each row: required fields (companyName), enum matching (stage), type coercion (numbers)
- Return mapping + preview + stats

**GPT-4o prompt context:**
- All Deal schema fields with descriptions
- Valid enum values for stage, status, priority
- Rules: normalize financials to raw numbers, stages to our enum, camelCase custom field keys
- Structured output (JSON mode)

### 2.2 `POST /api/deals/import`

Accepts the final mapped deals array and bulk creates them.

**Request:**
```json
{
  "mapping": { ... },
  "deals": [
    {
      "name": "Acme Corp Acquisition",
      "companyName": "Acme Corp",
      "dealSize": 50000000,
      "stage": "DUE_DILIGENCE",
      "ebitda": 8000000,
      "customFields": { "boardSeats": 2, "leadPartner": "John Smith" }
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "imported": 85,
  "failed": 2,
  "companiesCreated": 13,
  "errors": [
    { "row": 12, "reason": "Missing required field: company name" },
    { "row": 67, "reason": "Duplicate deal name: 'Acme Corp Series B' already exists" }
  ]
}
```

**Implementation:**
- Validate each deal row (Zod schema, same as create deal but more lenient — fewer required fields)
- For each `companyName`: find existing Company in org, or auto-create
- Bulk insert deals with `organizationId` from auth context
- Stage defaults to `INITIAL_REVIEW` if not provided or unrecognized
- Status defaults to `ACTIVE`
- Priority defaults to `MEDIUM`
- Each row in try/catch — failures don't block other rows
- Max 500 deals per request
- Return summary with per-row errors

### Route file: `apps/api/src/routes/deal-import.ts`

Mounted in `app.ts` at `/api/deals/import`. Uses `orgMiddleware` for org scoping.

### Service file: `apps/api/src/services/dealImportMapper.ts`

Contains:
- `analyzeImportData(rawData, source)` — parse + GPT-4o mapping
- `parseCSV(text)` — CSV string to rows array
- `parseExcel(buffer)` — Excel buffer to rows array
- `parsePastedText(text)` — detect delimiter, parse to rows
- `buildGPTMappingPrompt(headers, sampleRows)` — structured prompt
- `applyMapping(rows, mapping)` — transform all rows using mapping
- `validateDealRow(row)` — validate a single mapped row

---

## 3. Frontend UX

### Entry Point

"Import Deals" button on CRM page, next to existing "Ingest Deal Data" button. Uses Banker Blue outline style to differentiate from primary ingest button.

### 4-Step Modal Flow

#### Step 1: Upload
- Two tabs: **Upload File** | **Paste Data**
- Upload: drag-drop zone + file picker, accepts `.csv`, `.xlsx`, max 5MB
- Paste: large textarea with placeholder "Paste your deal data here — from Notion, Excel, Google Sheets, or any table"
- "Analyze" button → calls `POST /api/deals/import/analyze`
- Loading state: "AI is analyzing your data..." with spinner

#### Step 2: Column Mapping
- Two-column layout per row:
  - Left: source column name + sample value (greyed)
  - Right: dropdown of Deal fields + "Custom Field" + "Skip"
- AI pre-fills all dropdowns — user adjusts if needed
- Color coding:
  - Green: mapped to Deal field (high confidence ≥0.8)
  - Amber: mapped but low confidence (<0.8), or custom field
  - Grey: skipped
- Unmapped columns default to "Import as custom field" (not skip)
- "Continue" button

#### Step 3: Data Preview
- Scrollable table showing all rows with mapped column headers
- Red highlight on cells with issues (missing required, invalid value)
- Summary bar: "100 deals found · 97 valid · 3 have warnings"
- "Back" button to return to mapping
- "Import X Deals" primary button

#### Step 4: Result
- Progress bar during import
- Final summary card:
  - "85 deals imported successfully"
  - "13 new companies created"
  - "2 rows failed" (expandable error list)
- "View in Pipeline" button → navigates to CRM page
- "Import More" button → resets to Step 1

### File: `apps/web/js/deal-import.js`

Modal HTML embedded in `crm.html` (same pattern as contacts import modal in `contacts.html`).

### Script loading

Add `deal-import.js` to `crm.html` script tags after `crm-actions.js`.

---

## 4. AI Mapping Details

### GPT-4o System Prompt

```
You are a data mapping assistant for a Private Equity deal management system.

Given CSV/spreadsheet column headers and sample data rows, map each column to the closest Deal field in our schema, or classify it as a custom field.

## Our Deal Schema Fields:
- name: Deal or project name (e.g., "Acme Acquisition", "Project Alpha")
- companyName: Target company name
- stage: Pipeline stage. Must be one of: INITIAL_REVIEW, DUE_DILIGENCE, IOI_SUBMITTED, LOI_SUBMITTED, NEGOTIATION, CLOSING, PASSED, CLOSED_WON, CLOSED_LOST
- status: ACTIVE, PROCESSING, PASSED, ARCHIVED
- dealSize: Total deal/enterprise value in USD (raw number, not millions)
- ebitda: EBITDA in USD (raw number)
- revenue: Revenue in USD (raw number)
- irrProjected: Projected IRR as decimal (e.g., 0.25 for 25%)
- mom: Multiple on Money as decimal (e.g., 2.5)
- industry: Industry sector (free text)
- description: Deal description or thesis
- priority: LOW, MEDIUM, HIGH, URGENT
- tags: Array of string tags
- targetCloseDate: Target close date (ISO 8601)
- source: Deal source (e.g., "banker", "proprietary", "auction")

## Rules:
1. Map each source column to the closest schema field based on header name AND sample values
2. Normalize financial values: "$50M" → 50000000, "2.5x" → 2.5, "25%" → 0.25
3. Normalize stages: "DD" → "DUE_DILIGENCE", "Passed" → "PASSED", "IOI" → "IOI_SUBMITTED", etc.
4. Columns that don't match any schema field → mark as customFields with camelCase key
5. Return confidence score 0-1 for each mapping
6. Include transform instructions for financial normalization

Return JSON only.
```

### Model: `gpt-4o` (not mini — accuracy critical for mapping)

### Cost: ~$0.01-0.02 per import (single call with headers + 3 sample rows)

### Structured output schema enforced via `response_format: { type: "json_object" }`

---

## 5. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Duplicate deal name in org | Warn in preview, skip on import, include in errors |
| Missing companyName | Flag in preview (red), skip row on import |
| Unrecognizable stage value | Default to `INITIAL_REVIEW`, note in warnings |
| Financial values in different currencies | v1: assume USD, note in warnings. Future: currency detection |
| Empty rows in CSV | Skip silently |
| >500 deals | Reject with error: "Maximum 500 deals per import. Please split your file." |
| >5MB file | Reject at upload: "File too large. Maximum 5MB." |
| Excel with multiple sheets | Use first sheet, warn if multiple detected |
| GPT-4o API failure | Show error: "AI analysis failed. Please try again." No fallback to rule-based. |
| companyName matches existing Company | Link to existing Company record (don't create duplicate) |
| Pasted text with no clear structure | AI attempts best-effort parse, low confidence scores signal issues in mapping UI |

---

## 6. File Inventory

| File | Type | Purpose |
|------|------|---------|
| `apps/api/deal-import-migration.sql` | New | Migration for customFields JSONB |
| `apps/api/src/routes/deal-import.ts` | New | `/analyze` and `/import` endpoints |
| `apps/api/src/services/dealImportMapper.ts` | New | CSV/Excel parsing, GPT-4o mapping, validation |
| `apps/web/js/deal-import.js` | New | Frontend modal, 4-step UX, API calls |
| `apps/web/crm.html` | Edit | Add import modal HTML + script tag |
| `apps/web/crm.js` | Edit | Add "Import Deals" button + `openDealImportModal()` |
| `apps/api/src/app.ts` | Edit | Mount deal-import routes |
| `apps/api/src/routes/deals.ts` | Edit | Accept `customFields` in create/update schemas |

---

## 7. Dependencies

- `csv-parse` — CSV parsing (already in Node.js ecosystem, lightweight)
- `xlsx` — Excel parsing (already used in project for financial extraction)
- No new frontend dependencies

---

## 8. Out of Scope (v1)

- PDF/image import (future)
- Direct API integrations (Notion, Airtable, Salesforce)
- Automatic sync / recurring import
- Custom field UI on deal page (can display in "Additional Info" section later)
- Import history / undo import
- Field-level deduplication (only name-level duplicate detection)
