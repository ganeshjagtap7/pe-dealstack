# Deal Import — AI-Powered Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bulk deal import system that accepts CSV/Excel/pasted text, uses GPT-4o to map foreign columns to our Deal schema, stores unmapped fields in `customFields` JSONB, and provides a 4-step modal UX with preview before committing.

**Architecture:** Two new API endpoints (`/analyze` + `/import`) backed by a `dealImportMapper` service that parses input and calls GPT-4o for column mapping. Frontend is a 4-step modal (Upload → Mapping → Preview → Result) in `crm.html`. Follows the existing contacts import pattern.

**Tech Stack:** Express + Zod (API), GPT-4o via LangChain `getChatModel` (mapping), `xlsx` library (Excel parsing), `csv-parse` (CSV parsing), Vanilla JS frontend (modal).

**Spec:** `docs/superpowers/specs/2026-04-04-deal-import-design.md`

---

## File Structure

| File | Type | Responsibility |
|------|------|----------------|
| `apps/api/src/services/dealImportMapper.ts` | Create | CSV/Excel/text parsing, GPT-4o mapping prompt, row transformation, validation |
| `apps/api/src/routes/deal-import.ts` | Create | `/analyze` and `/import` endpoints, Zod schemas, org scoping |
| `apps/web/js/deal-import.js` | Create | 4-step modal logic, file handling, API calls, mapping UI |
| `apps/web/crm.html` | Modify | Add modal HTML + script tag + "Import Deals" button |
| `apps/web/crm.js` | Modify | Wire up import button + init function |
| `apps/api/src/app.ts` | Modify | Mount deal-import router |
| `apps/api/src/routes/deals.ts` | Modify | Accept `customFields` in create/update Zod schemas |

---

## Task 1: Install `csv-parse` dependency

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install csv-parse**

```bash
cd apps/api && npm install csv-parse
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/api && node -e "require('csv-parse'); console.log('csv-parse OK')"
```

Expected: `csv-parse OK`

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json
git commit -m "chore(import): add csv-parse dependency for deal import"
```

---

## Task 2: Add `customFields` to Deal create/update schemas

**Files:**
- Modify: `apps/api/src/routes/deals.ts` (lines 25-45 for createDealSchema, and the updateDealSchema)

- [ ] **Step 1: Add customFields to createDealSchema**

In `apps/api/src/routes/deals.ts`, find the `createDealSchema` (around line 25). Add `customFields` at the end:

```typescript
const createDealSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().optional(),
  companyName: z.string().optional(),
  stage: z.string().default('INITIAL_REVIEW'),
  status: z.string().default('ACTIVE'),
  irrProjected: z.number().nullable().optional(),
  mom: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  dealSize: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  aiThesis: z.string().nullable().optional(),
  icon: z.string().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional().default({}),
});
```

- [ ] **Step 2: Add customFields to the insert call**

In the POST `/` handler (around line 270), add `customFields` to the insert object:

```typescript
const { data: deal, error: dealError } = await supabase
  .from('Deal')
  .insert({
    name: data.name,
    companyId,
    stage: data.stage,
    status: data.status,
    irrProjected: data.irrProjected,
    mom: data.mom,
    ebitda: data.ebitda,
    revenue: data.revenue,
    industry: data.industry,
    dealSize: data.dealSize,
    description: data.description,
    aiThesis: data.aiThesis,
    icon: data.icon || 'business_center',
    assignedTo: data.assignedTo,
    priority: data.priority || 'MEDIUM',
    tags: data.tags,
    targetCloseDate: data.targetCloseDate,
    source: data.source,
    organizationId: orgId,
    customFields: data.customFields || {},
  })
```

- [ ] **Step 3: Also add customFields to updateDealSchema**

Find `updateDealSchema` (similar to create but all optional). Add:

```typescript
customFields: z.record(z.string(), z.any()).optional(),
```

And add `customFields: data.customFields,` to the PATCH handler's update object.

- [ ] **Step 4: Type check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/deals.ts
git commit -m "feat(deals): add customFields JSONB support to create/update schemas"
```

---

## Task 3: Build `dealImportMapper.ts` service

**Files:**
- Create: `apps/api/src/services/dealImportMapper.ts`

This is the core service — handles parsing, AI mapping, transformation, and validation.

- [ ] **Step 1: Create the service file with parsing functions**

Create `apps/api/src/services/dealImportMapper.ts`:

```typescript
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import { getChatModel } from './llm.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { log } from '../utils/logger.js';

// ============================================
// Types
// ============================================

export interface ColumnMapping {
  field: string;          // e.g., "companyName" or "customFields.boardSeats"
  confidence: number;     // 0-1
  transform?: string;     // e.g., "multiply_1000000", "percentage_to_decimal"
}

export interface MappingResult {
  mapping: Record<string, ColumnMapping>;
  preview: Array<{ original: Record<string, string>; mapped: Record<string, any> }>;
  totalRows: number;
  validRows: number;
  warnings: string[];
  unmappedColumns: string[];
}

export interface ValidatedDeal {
  name: string;
  companyName: string;
  stage?: string;
  status?: string;
  dealSize?: number | null;
  ebitda?: number | null;
  revenue?: number | null;
  irrProjected?: number | null;
  mom?: number | null;
  industry?: string | null;
  description?: string | null;
  priority?: string;
  tags?: string[];
  targetCloseDate?: string | null;
  source?: string | null;
  customFields?: Record<string, any>;
}

// ============================================
// Parsers
// ============================================

export function parseCSV(text: string): Record<string, string>[] {
  try {
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    });
    return records;
  } catch (err) {
    log.error('CSV parse error', err);
    throw new Error('Failed to parse CSV. Please check the file format.');
  }
}

export function parseExcel(buffer: Buffer): Record<string, string>[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel file has no sheets');

    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName], {
      defval: '',
      raw: false,
    });

    if (workbook.SheetNames.length > 1) {
      log.info(`Excel file has ${workbook.SheetNames.length} sheets, using first: "${sheetName}"`);
    }

    return rows;
  } catch (err) {
    log.error('Excel parse error', err);
    throw new Error('Failed to parse Excel file. Please check the file format.');
  }
}

export function parsePastedText(text: string): Record<string, string>[] {
  // Detect delimiter: tab-separated (Notion/Excel paste) vs comma-separated
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  if (tabCount > 0 && tabCount >= commaCount) {
    // Tab-separated — convert tabs to commas for csv-parse
    const csvText = text.split(/\r?\n/).map(line =>
      line.split('\t').map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    return parseCSV(csvText);
  }

  // Default: treat as CSV
  return parseCSV(text);
}

// ============================================
// AI Mapping
// ============================================

const DEAL_SCHEMA_PROMPT = `You are a data mapping assistant for a Private Equity deal management system.

Given CSV/spreadsheet column headers and sample data rows, map each column to the closest Deal field in our schema, or classify it as a custom field.

## Our Deal Schema Fields:
- name: Deal or project name (e.g., "Acme Acquisition", "Project Alpha")
- companyName: Target company name
- stage: Pipeline stage. Must be one of: INITIAL_REVIEW, DUE_DILIGENCE, IOI_SUBMITTED, LOI_SUBMITTED, NEGOTIATION, CLOSING, PASSED, CLOSED_WON, CLOSED_LOST
- status: ACTIVE, PROCESSING, PASSED, ARCHIVED
- dealSize: Total deal/enterprise value in USD (store as raw number — NOT in millions)
- ebitda: EBITDA in USD (raw number)
- revenue: Revenue in USD (raw number)
- irrProjected: Projected IRR as decimal (e.g., 0.25 for 25%)
- mom: Multiple on Money as decimal (e.g., 2.5)
- industry: Industry sector (free text)
- description: Deal description or thesis
- priority: LOW, MEDIUM, HIGH, URGENT
- tags: Array of string tags (comma-separated in source)
- targetCloseDate: Target close date (ISO 8601 format YYYY-MM-DD)
- source: Deal source (e.g., "banker", "proprietary", "auction")

## Rules:
1. Map each source column to the closest schema field based on header name AND sample values
2. For financial values, detect the unit scale from headers or values:
   - "$50M" or "50" with header containing "(M)" or "(millions)" → multiply by 1,000,000 → transform: "multiply_1000000"
   - "$50B" → multiply by 1,000,000,000 → transform: "multiply_1000000000"
   - Plain numbers with no unit indicator → no transform needed
3. For percentages: "25%" → 0.25, transform: "percentage_to_decimal"
4. For multiples: "2.5x" → 2.5, transform: "strip_x_suffix"
5. Normalize stages: "DD" → "DUE_DILIGENCE", "Passed" → "PASSED", "IOI" → "IOI_SUBMITTED", "LOI" → "LOI_SUBMITTED", "Initial Review" → "INITIAL_REVIEW", etc.
6. Columns that don't match any schema field → mark as customFields with a camelCase key derived from the column name
7. Return confidence score 0-1 for each mapping
8. If a column clearly contains deal names AND company names in the same column, map to "name" and note in warnings

Return valid JSON only. No markdown, no explanation.

## Response Schema:
{
  "mapping": {
    "<source column name>": {
      "field": "<our field name or customFields.camelCaseKey>",
      "confidence": <0-1>,
      "transform": "<optional: multiply_1000000 | multiply_1000000000 | percentage_to_decimal | strip_x_suffix>"
    }
  },
  "warnings": ["<any issues detected>"]
}`;

export async function analyzeImportData(
  rows: Record<string, string>[],
  source: 'csv' | 'excel' | 'paste'
): Promise<MappingResult> {
  if (rows.length === 0) {
    throw new Error('No data rows found. Please check your file.');
  }

  const headers = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 3);

  // Call GPT-4o for mapping
  const model = getChatModel(0.1, 2000);
  const userPrompt = `Column headers: ${JSON.stringify(headers)}

Sample data (first ${sampleRows.length} rows):
${JSON.stringify(sampleRows, null, 2)}

Map each column to our Deal schema. Return JSON only.`;

  const response = await model.invoke([
    new SystemMessage(DEAL_SCHEMA_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  let aiResult: { mapping: Record<string, ColumnMapping>; warnings: string[] };
  try {
    const content = typeof response.content === 'string' ? response.content : '';
    // Strip markdown code fences if present
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
    aiResult = JSON.parse(cleaned);
  } catch (err) {
    log.error('Failed to parse AI mapping response', err);
    throw new Error('AI mapping failed. Please try again.');
  }

  // Apply mapping to generate preview (first 10 rows)
  const previewRows = rows.slice(0, 10);
  const preview = previewRows.map(row => ({
    original: row,
    mapped: applyMappingToRow(row, aiResult.mapping),
  }));

  // Validate all rows
  let validRows = 0;
  const warnings = [...(aiResult.warnings || [])];

  for (const row of rows) {
    const mapped = applyMappingToRow(row, aiResult.mapping);
    if (mapped.companyName || mapped.name) {
      validRows++;
    }
  }

  const missingCompany = rows.length - validRows;
  if (missingCompany > 0) {
    warnings.push(`${missingCompany} rows missing company name or deal name`);
  }

  // Identify unmapped columns
  const unmappedColumns = headers.filter(h => {
    const m = aiResult.mapping[h];
    return !m || m.field.startsWith('customFields.');
  });

  return {
    mapping: aiResult.mapping,
    preview,
    totalRows: rows.length,
    validRows,
    warnings,
    unmappedColumns,
  };
}

// ============================================
// Row Transformation
// ============================================

const VALID_STAGES = [
  'INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED', 'LOI_SUBMITTED',
  'NEGOTIATION', 'CLOSING', 'PASSED', 'CLOSED_WON', 'CLOSED_LOST',
];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const VALID_STATUSES = ['ACTIVE', 'PROCESSING', 'PASSED', 'ARCHIVED'];

function applyTransform(value: string, transform?: string): any {
  if (!value || value.trim() === '') return null;

  // Strip currency symbols and commas
  let cleaned = value.replace(/[$€£,]/g, '').trim();

  switch (transform) {
    case 'multiply_1000000':
      return parseFloat(cleaned) * 1_000_000 || null;
    case 'multiply_1000000000':
      return parseFloat(cleaned) * 1_000_000_000 || null;
    case 'percentage_to_decimal':
      cleaned = cleaned.replace(/%/g, '');
      return parseFloat(cleaned) / 100 || null;
    case 'strip_x_suffix':
      cleaned = cleaned.replace(/x$/i, '');
      return parseFloat(cleaned) || null;
    default:
      return value.trim();
  }
}

export function applyMappingToRow(
  row: Record<string, string>,
  mapping: Record<string, ColumnMapping>
): Record<string, any> {
  const result: Record<string, any> = { customFields: {} };

  for (const [sourceCol, value] of Object.entries(row)) {
    const colMapping = mapping[sourceCol];
    if (!colMapping) continue;

    const transformedValue = applyTransform(value, colMapping.transform);
    if (transformedValue === null || transformedValue === '') continue;

    if (colMapping.field.startsWith('customFields.')) {
      const key = colMapping.field.replace('customFields.', '');
      result.customFields[key] = transformedValue;
    } else {
      result[colMapping.field] = transformedValue;
    }
  }

  // Normalize enums
  if (result.stage) {
    const upper = String(result.stage).toUpperCase().replace(/[\s-]/g, '_');
    result.stage = VALID_STAGES.includes(upper) ? upper : 'INITIAL_REVIEW';
  }
  if (result.priority) {
    const upper = String(result.priority).toUpperCase();
    result.priority = VALID_PRIORITIES.includes(upper) ? upper : 'MEDIUM';
  }
  if (result.status) {
    const upper = String(result.status).toUpperCase();
    result.status = VALID_STATUSES.includes(upper) ? upper : 'ACTIVE';
  }
  if (result.tags && typeof result.tags === 'string') {
    result.tags = result.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
  }

  // Numeric fields — ensure they're numbers
  for (const numField of ['dealSize', 'ebitda', 'revenue', 'irrProjected', 'mom']) {
    if (result[numField] !== undefined && result[numField] !== null) {
      const num = parseFloat(String(result[numField]).replace(/[$€£,%x,]/g, ''));
      result[numField] = isNaN(num) ? null : num;
    }
  }

  return result;
}

// ============================================
// Validation
// ============================================

export interface RowValidation {
  valid: boolean;
  errors: string[];
}

export function validateDealRow(row: Record<string, any>, index: number): RowValidation {
  const errors: string[] = [];

  // Must have either companyName or name
  if (!row.companyName && !row.name) {
    errors.push(`Row ${index + 1}: Missing company name and deal name`);
  }

  // Auto-generate deal name from company if missing
  if (!row.name && row.companyName) {
    row.name = row.companyName;
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 2: Type check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/dealImportMapper.ts
git commit -m "feat(import): add dealImportMapper service with CSV/Excel/text parsing and GPT-4o mapping"
```

---

## Task 4: Build `deal-import.ts` route

**Files:**
- Create: `apps/api/src/routes/deal-import.ts`

- [ ] **Step 1: Create the route file**

Create `apps/api/src/routes/deal-import.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { getOrgId } from '../middleware/orgScope.js';
import { supabase } from '../config/supabase.js';
import { log } from '../utils/logger.js';
import {
  parseCSV,
  parseExcel,
  parsePastedText,
  analyzeImportData,
  applyMappingToRow,
  validateDealRow,
  ColumnMapping,
} from '../services/dealImportMapper.js';

const router = Router();

// Multer for Excel file uploads (in-memory, 5MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are supported'));
    }
  },
});

// ============================================
// POST /api/deals/import/analyze
// ============================================

const analyzeTextSchema = z.object({
  source: z.enum(['csv', 'paste']),
  rawData: z.string().min(1, 'No data provided'),
});

router.post('/analyze', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let rows: Record<string, string>[];
    let source: 'csv' | 'excel' | 'paste';

    if (req.file) {
      // Excel file upload
      source = 'excel';
      rows = parseExcel(req.file.buffer);
    } else {
      // CSV or pasted text (JSON body)
      const validation = analyzeTextSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }
      source = validation.data.source;
      rows = source === 'csv'
        ? parseCSV(validation.data.rawData)
        : parsePastedText(validation.data.rawData);
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found. Please check your file.' });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        error: `Too many rows (${rows.length}). Maximum 500 deals per import. Please split your file.`,
      });
    }

    const result = await analyzeImportData(rows, source);

    res.json({
      success: true,
      ...result,
      // Also send all parsed rows so frontend can re-apply mapping client-side if user changes it
      allRows: rows,
    });
  } catch (error: any) {
    log.error('Deal import analyze error', error);
    res.status(500).json({ error: error.message || 'Failed to analyze import data' });
  }
});

// ============================================
// POST /api/deals/import
// ============================================

const importDealSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  stage: z.string().optional().default('INITIAL_REVIEW'),
  status: z.string().optional().default('ACTIVE'),
  dealSize: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  irrProjected: z.number().nullable().optional(),
  mom: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  priority: z.string().optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional().default({}),
});

const importRequestSchema = z.object({
  deals: z.array(z.record(z.string(), z.any())).min(1).max(500),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = importRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const orgId = getOrgId(req);
    const { deals } = validation.data;
    const results = {
      imported: 0,
      failed: 0,
      companiesCreated: 0,
      errors: [] as Array<{ row: number; reason: string }>,
    };

    // Cache company lookups to avoid repeated queries
    const companyCache = new Map<string, string>(); // companyName -> companyId

    for (let i = 0; i < deals.length; i++) {
      try {
        // Validate the row
        const rowValidation = validateDealRow(deals[i], i);
        if (!rowValidation.valid) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: rowValidation.errors.join('; ') });
          continue;
        }

        // Parse through Zod (lenient — fills defaults)
        const parsed = importDealSchema.safeParse(deals[i]);
        if (!parsed.success) {
          results.failed++;
          results.errors.push({
            row: i + 1,
            reason: parsed.error.errors.map(e => e.message).join('; '),
          });
          continue;
        }

        const deal = parsed.data;

        // Resolve or create company
        let companyId = companyCache.get(deal.companyName.toLowerCase());
        if (!companyId) {
          // Check if company exists in this org
          const { data: existing } = await supabase
            .from('Company')
            .select('id')
            .eq('organizationId', orgId)
            .ilike('name', deal.companyName)
            .limit(1)
            .single();

          if (existing) {
            companyId = existing.id;
          } else {
            // Create new company
            const { data: newCompany, error: companyError } = await supabase
              .from('Company')
              .insert({
                name: deal.companyName,
                industry: deal.industry || null,
                organizationId: orgId,
              })
              .select('id')
              .single();

            if (companyError) {
              results.failed++;
              results.errors.push({ row: i + 1, reason: `Failed to create company: ${companyError.message}` });
              continue;
            }
            companyId = newCompany.id;
            results.companiesCreated++;
          }
          companyCache.set(deal.companyName.toLowerCase(), companyId);
        }

        // Check for duplicate deal name in org
        const { data: existingDeal } = await supabase
          .from('Deal')
          .select('id')
          .eq('organizationId', orgId)
          .eq('name', deal.name)
          .limit(1)
          .single();

        if (existingDeal) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: `Duplicate deal name: "${deal.name}" already exists` });
          continue;
        }

        // Insert deal
        const { error: dealError } = await supabase
          .from('Deal')
          .insert({
            name: deal.name,
            companyId,
            stage: deal.stage,
            status: deal.status,
            dealSize: deal.dealSize,
            ebitda: deal.ebitda,
            revenue: deal.revenue,
            irrProjected: deal.irrProjected,
            mom: deal.mom,
            industry: deal.industry,
            description: deal.description,
            priority: deal.priority,
            tags: deal.tags || [],
            targetCloseDate: deal.targetCloseDate,
            source: deal.source,
            customFields: deal.customFields || {},
            icon: 'business_center',
            organizationId: orgId,
          });

        if (dealError) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: dealError.message });
        } else {
          results.imported++;
        }
      } catch (rowErr: any) {
        results.failed++;
        results.errors.push({ row: i + 1, reason: rowErr.message || 'Unknown error' });
      }
    }

    log.info('Deal import complete', {
      total: deals.length,
      imported: results.imported,
      failed: results.failed,
      companiesCreated: results.companiesCreated,
    });

    res.status(201).json({ success: true, ...results });
  } catch (error: any) {
    log.error('Deal import error', error);
    res.status(500).json({ error: error.message || 'Failed to import deals' });
  }
});

export default router;
```

- [ ] **Step 2: Type check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/deal-import.ts
git commit -m "feat(import): add /api/deals/import/analyze and /api/deals/import endpoints"
```

---

## Task 5: Mount the deal-import router in app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add import statement**

Near the top of `apps/api/src/app.ts` where other route imports are, add:

```typescript
import dealImportRouter from './routes/deal-import.js';
```

- [ ] **Step 2: Mount the route**

In the protected routes section (around line 230, after the deals route), add:

```typescript
app.use('/api/deals/import', authMiddleware, orgMiddleware, dealImportRouter);
```

**IMPORTANT:** This line MUST come BEFORE `app.use('/api/deals', ...)` because Express matches routes in order and `/api/deals` would catch `/api/deals/import` first.

- [ ] **Step 3: Type check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(import): mount deal-import router in app.ts"
```

---

## Task 6: Build the frontend modal HTML in crm.html

**Files:**
- Modify: `apps/web/crm.html`

- [ ] **Step 1: Add the "Import Deals" button**

In `crm.html`, find the "Ingest Deal Data" button (around line 160). Add an "Import Deals" button right before it:

```html
<button id="import-deals-btn"
    class="flex items-center gap-2 px-4 py-2 rounded-lg shadow-sm transition-colors text-sm font-medium border-2"
    style="border-color: #003366; color: #003366; background: white;"
    onmouseover="this.style.background='#003366'; this.style.color='white';"
    onmouseout="this.style.background='white'; this.style.color='#003366';">
    <span class="material-symbols-outlined text-[18px]">upload_file</span>
    Import Deals
</button>
```

- [ ] **Step 2: Add the 4-step import modal HTML**

Add this modal HTML just before the closing `</body>` tag (before the script tags):

```html
<!-- Deal Import Modal -->
<div id="deal-import-modal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
  <div class="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-[slideIn_0.2s_ease-out]">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200">
      <div class="flex items-center gap-2">
        <span class="material-symbols-outlined text-[22px]" style="color: #003366;">upload_file</span>
        <h2 class="text-lg font-bold text-slate-900">Import Deals</h2>
      </div>
      <button onclick="closeDealImportModal()" class="p-1 rounded-lg hover:bg-slate-100 transition-colors">
        <span class="material-symbols-outlined text-slate-400">close</span>
      </button>
    </div>

    <!-- Step Indicator -->
    <div class="px-6 pt-4">
      <div id="import-steps-indicator" class="flex items-center gap-2 text-xs font-medium text-slate-400">
        <span id="step-ind-1" class="px-2 py-1 rounded" style="background: #003366; color: white;">1. Upload</span>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span id="step-ind-2" class="px-2 py-1 rounded bg-slate-100">2. Map Columns</span>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span id="step-ind-3" class="px-2 py-1 rounded bg-slate-100">3. Preview</span>
        <span class="material-symbols-outlined text-[14px]">chevron_right</span>
        <span id="step-ind-4" class="px-2 py-1 rounded bg-slate-100">4. Result</span>
      </div>
    </div>

    <!-- Step 1: Upload -->
    <div id="import-step-1" class="p-6">
      <!-- Tabs -->
      <div class="flex gap-2 mb-4">
        <button id="tab-upload" onclick="switchImportTab('upload')" class="px-4 py-2 text-sm font-medium rounded-lg" style="background: #003366; color: white;">
          Upload File
        </button>
        <button id="tab-paste" onclick="switchImportTab('paste')" class="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
          Paste Data
        </button>
      </div>

      <!-- Upload Tab -->
      <div id="upload-tab-content">
        <div id="import-dropzone"
          class="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:border-blue-400 transition-colors cursor-pointer"
          onclick="document.getElementById('deal-import-file').click()"
          ondragover="event.preventDefault(); this.classList.add('border-blue-500', 'bg-blue-50');"
          ondragleave="this.classList.remove('border-blue-500', 'bg-blue-50');"
          ondrop="event.preventDefault(); this.classList.remove('border-blue-500', 'bg-blue-50'); handleDealImportFile(event.dataTransfer.files[0]);">
          <span class="material-symbols-outlined text-slate-400 text-4xl mb-3">cloud_upload</span>
          <p class="text-sm font-medium text-slate-900 mb-1">Drop your CSV or Excel file here, or click to browse</p>
          <p class="text-xs text-slate-400">Supports .csv and .xlsx files up to 5MB</p>
        </div>
        <input id="deal-import-file" type="file" accept=".csv,.xlsx" class="hidden" onchange="handleDealImportFile(this.files[0])" />
        <div id="import-file-name" class="hidden mt-3 flex items-center gap-2 text-sm text-slate-600">
          <span class="material-symbols-outlined text-[16px]">description</span>
          <span id="import-file-label"></span>
          <button onclick="clearDealImportFile()" class="ml-auto text-slate-400 hover:text-red-500">
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      <!-- Paste Tab -->
      <div id="paste-tab-content" class="hidden">
        <textarea id="import-paste-area"
          class="w-full h-48 p-4 border border-slate-300 rounded-xl text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Paste your deal data here — from Notion, Excel, Google Sheets, or any table.

Example:
Company	Deal Size	Stage	Industry
Acme Corp	$50M	Due Diligence	Technology
Beta Inc	$25M	Initial Review	Healthcare"></textarea>
      </div>

      <!-- Error message -->
      <div id="import-upload-error" class="hidden mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"></div>

      <!-- Analyze button -->
      <div class="mt-4 flex justify-end">
        <button id="import-analyze-btn" onclick="analyzeDealImport()" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors" style="background: #003366;">
          <span class="material-symbols-outlined text-[18px]">auto_awesome</span>
          Analyze with AI
        </button>
      </div>
    </div>

    <!-- Step 2: Column Mapping -->
    <div id="import-step-2" class="hidden p-6">
      <p class="text-sm text-slate-500 mb-4">AI mapped your columns. Review and adjust if needed. Unmapped columns will be saved as custom fields.</p>
      <div id="mapping-container" class="space-y-3 max-h-[400px] overflow-y-auto"></div>
      <div class="mt-4 flex justify-between">
        <button onclick="goToImportStep(1)" class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Back</button>
        <button id="import-continue-btn" onclick="applyMappingAndPreview()" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white" style="background: #003366;">
          Continue to Preview
        </button>
      </div>
    </div>

    <!-- Step 3: Data Preview -->
    <div id="import-step-3" class="hidden p-6">
      <div id="preview-summary" class="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm"></div>
      <div class="overflow-x-auto max-h-[350px] overflow-y-auto border border-slate-200 rounded-lg">
        <table class="w-full text-sm">
          <thead id="preview-thead" class="bg-slate-50 sticky top-0"></thead>
          <tbody id="preview-tbody"></tbody>
        </table>
      </div>
      <div class="mt-4 flex justify-between">
        <button onclick="goToImportStep(2)" class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">Back</button>
        <button id="import-submit-btn" onclick="submitDealImport()" class="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white" style="background: #003366;">
          <span class="material-symbols-outlined text-[18px]">upload</span>
          <span id="import-submit-label">Import Deals</span>
        </button>
      </div>
    </div>

    <!-- Step 4: Result -->
    <div id="import-step-4" class="hidden p-6 text-center">
      <span id="import-result-icon" class="material-symbols-outlined text-5xl mb-3" style="color: #003366;">check_circle</span>
      <h3 id="import-result-title" class="text-lg font-bold text-slate-900 mb-2"></h3>
      <p id="import-result-detail" class="text-sm text-slate-500 mb-2"></p>
      <div id="import-result-errors" class="hidden mt-3 text-left max-h-[200px] overflow-y-auto"></div>
      <div class="mt-6 flex justify-center gap-3">
        <button onclick="closeDealImportModal(); location.reload();" class="px-5 py-2.5 rounded-lg text-sm font-medium text-white" style="background: #003366;">
          View in Pipeline
        </button>
        <button onclick="resetDealImport()" class="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200">
          Import More
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add the script tag**

In the script loading section at the bottom of `crm.html`, add `deal-import.js` BEFORE `crm.js`:

```html
<script src="js/deal-import.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/crm.html
git commit -m "feat(import): add deal import modal HTML and import button to CRM page"
```

---

## Task 7: Build the frontend JavaScript `deal-import.js`

**Files:**
- Create: `apps/web/js/deal-import.js`

- [ ] **Step 1: Create `apps/web/js/deal-import.js`**

```javascript
// Deal Import — AI-powered bulk import from CSV/Excel/pasted text
// Depends on: auth.js (PEAuth), config.js (API_BASE_URL), formatters.js (escapeHtml), notifications.js (showNotification)

let importState = {
  file: null,
  source: null,        // 'csv' | 'excel' | 'paste'
  mapping: {},          // column mapping from AI
  allRows: [],          // all parsed rows from server
  mappedDeals: [],      // deals after applying mapping
  currentTab: 'upload', // 'upload' | 'paste'
};

// ============================================
// Modal Controls
// ============================================

function openDealImportModal() {
  resetDealImport();
  document.getElementById('deal-import-modal').classList.remove('hidden');
}

function closeDealImportModal() {
  document.getElementById('deal-import-modal').classList.add('hidden');
}

function resetDealImport() {
  importState = { file: null, source: null, mapping: {}, allRows: [], mappedDeals: [], currentTab: 'upload' };
  goToImportStep(1);
  document.getElementById('import-paste-area').value = '';
  document.getElementById('import-file-name').classList.add('hidden');
  document.getElementById('import-upload-error').classList.add('hidden');
  document.getElementById('deal-import-file').value = '';
  switchImportTab('upload');
}

// ============================================
// Tab Switching
// ============================================

function switchImportTab(tab) {
  importState.currentTab = tab;
  const uploadTab = document.getElementById('tab-upload');
  const pasteTab = document.getElementById('tab-paste');
  const uploadContent = document.getElementById('upload-tab-content');
  const pasteContent = document.getElementById('paste-tab-content');

  if (tab === 'upload') {
    uploadTab.style.background = '#003366';
    uploadTab.style.color = 'white';
    pasteTab.style.background = '';
    pasteTab.style.color = '';
    pasteTab.className = 'px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
    uploadContent.classList.remove('hidden');
    pasteContent.classList.add('hidden');
  } else {
    pasteTab.style.background = '#003366';
    pasteTab.style.color = 'white';
    uploadTab.style.background = '';
    uploadTab.style.color = '';
    uploadTab.className = 'px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
    pasteContent.classList.remove('hidden');
    uploadContent.classList.add('hidden');
  }
}

// ============================================
// Step Navigation
// ============================================

function goToImportStep(step) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`import-step-${i}`).classList.toggle('hidden', i !== step);
    const ind = document.getElementById(`step-ind-${i}`);
    if (i === step) {
      ind.style.background = '#003366';
      ind.style.color = 'white';
      ind.className = 'px-2 py-1 rounded';
    } else if (i < step) {
      ind.style.background = '#e2e8f0';
      ind.style.color = '#003366';
      ind.className = 'px-2 py-1 rounded';
    } else {
      ind.style.background = '';
      ind.style.color = '';
      ind.className = 'px-2 py-1 rounded bg-slate-100';
    }
  }
}

// ============================================
// File Handling
// ============================================

function handleDealImportFile(file) {
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx'].includes(ext)) {
    showImportError('Please select a CSV or Excel (.xlsx) file.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showImportError('File too large. Maximum 5MB.');
    return;
  }

  importState.file = file;
  importState.source = ext === 'xlsx' ? 'excel' : 'csv';

  document.getElementById('import-file-name').classList.remove('hidden');
  document.getElementById('import-file-label').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById('import-upload-error').classList.add('hidden');
}

function clearDealImportFile() {
  importState.file = null;
  importState.source = null;
  document.getElementById('import-file-name').classList.add('hidden');
  document.getElementById('deal-import-file').value = '';
}

function showImportError(msg) {
  const el = document.getElementById('import-upload-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ============================================
// Step 1 → Step 2: Analyze
// ============================================

async function analyzeDealImport() {
  const btn = document.getElementById('import-analyze-btn');
  const origHTML = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> AI is analyzing...';

    let res;

    if (importState.currentTab === 'paste') {
      const text = document.getElementById('import-paste-area').value.trim();
      if (!text) {
        showImportError('Please paste your deal data first.');
        return;
      }
      importState.source = 'paste';
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'paste', rawData: text }),
      });
    } else if (importState.source === 'excel' && importState.file) {
      const formData = new FormData();
      formData.append('file', importState.file);
      formData.append('source', 'excel');
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        body: formData,
      });
    } else if (importState.file) {
      // CSV — read as text
      const text = await importState.file.text();
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'csv', rawData: text }),
      });
    } else {
      showImportError('Please upload a file or paste data first.');
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      showImportError(data.error || 'Analysis failed. Please try again.');
      return;
    }

    importState.mapping = data.mapping;
    importState.allRows = data.allRows;

    renderMappingUI(data);
    goToImportStep(2);

  } catch (err) {
    console.error('Analyze error:', err);
    showImportError('Failed to analyze data. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

// ============================================
// Step 2: Column Mapping UI
// ============================================

const DEAL_FIELDS = [
  { value: 'name', label: 'Deal Name' },
  { value: 'companyName', label: 'Company Name' },
  { value: 'stage', label: 'Stage' },
  { value: 'status', label: 'Status' },
  { value: 'dealSize', label: 'Deal Size ($)' },
  { value: 'ebitda', label: 'EBITDA ($)' },
  { value: 'revenue', label: 'Revenue ($)' },
  { value: 'irrProjected', label: 'IRR (%)' },
  { value: 'mom', label: 'MoM Multiple' },
  { value: 'industry', label: 'Industry' },
  { value: 'description', label: 'Description' },
  { value: 'priority', label: 'Priority' },
  { value: 'tags', label: 'Tags' },
  { value: 'targetCloseDate', label: 'Target Close Date' },
  { value: 'source', label: 'Source' },
];

function renderMappingUI(data) {
  const container = document.getElementById('mapping-container');
  const headers = Object.keys(data.mapping);

  container.innerHTML = headers.map(header => {
    const m = data.mapping[header];
    const isCustom = m.field.startsWith('customFields.');
    const confidence = m.confidence;
    const sample = data.preview[0]?.original[header] || '';

    let colorClass, colorBg;
    if (isCustom) {
      colorClass = 'text-amber-700';
      colorBg = 'bg-amber-50 border-amber-200';
    } else if (confidence >= 0.8) {
      colorClass = 'text-emerald-700';
      colorBg = 'bg-emerald-50 border-emerald-200';
    } else {
      colorClass = 'text-amber-700';
      colorBg = 'bg-amber-50 border-amber-200';
    }

    const options = DEAL_FIELDS.map(f =>
      `<option value="${f.value}" ${m.field === f.value ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    const customKey = isCustom ? m.field.replace('customFields.', '') : header.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());

    return `
      <div class="flex items-center gap-3 p-3 rounded-lg border ${colorBg}">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-slate-900">${escapeHtml(header)}</div>
          <div class="text-xs text-slate-400 truncate">e.g., "${escapeHtml(sample)}"</div>
        </div>
        <span class="material-symbols-outlined text-slate-400 text-[18px]">arrow_forward</span>
        <div class="flex-1">
          <select data-source-col="${escapeHtml(header)}" onchange="updateMapping(this)"
            class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300">
            ${options}
            <option value="custom" ${isCustom ? 'selected' : ''}>Custom Field</option>
            <option value="skip">Skip</option>
          </select>
          ${isCustom ? `<div class="mt-1 text-xs ${colorClass}">→ custom field: "${escapeHtml(customKey)}"</div>` : ''}
        </div>
        <div class="text-xs font-medium ${colorClass} w-12 text-right">${Math.round(confidence * 100)}%</div>
      </div>
    `;
  }).join('');

  // Show warnings
  if (data.warnings && data.warnings.length > 0) {
    container.innerHTML += `
      <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div class="text-sm font-medium text-amber-800 mb-1">Warnings</div>
        ${data.warnings.map(w => `<div class="text-xs text-amber-700">• ${escapeHtml(w)}</div>`).join('')}
      </div>
    `;
  }
}

function updateMapping(select) {
  const sourceCol = select.dataset.sourceCol;
  const value = select.value;

  if (value === 'skip') {
    delete importState.mapping[sourceCol];
  } else if (value === 'custom') {
    const key = sourceCol.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());
    importState.mapping[sourceCol] = { field: `customFields.${key}`, confidence: 1.0 };
  } else {
    importState.mapping[sourceCol] = { ...importState.mapping[sourceCol], field: value };
  }
}

// ============================================
// Step 2 → Step 3: Apply Mapping & Preview
// ============================================

function applyMappingAndPreview() {
  const VALID_STAGES = ['INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED', 'LOI_SUBMITTED', 'NEGOTIATION', 'CLOSING', 'PASSED', 'CLOSED_WON', 'CLOSED_LOST'];
  const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  importState.mappedDeals = importState.allRows.map(row => {
    const deal = { customFields: {} };

    for (const [sourceCol, value] of Object.entries(row)) {
      const m = importState.mapping[sourceCol];
      if (!m) continue;

      let transformed = value;
      if (m.transform === 'multiply_1000000') transformed = parseFloat(String(value).replace(/[$€£,]/g, '')) * 1000000 || null;
      else if (m.transform === 'multiply_1000000000') transformed = parseFloat(String(value).replace(/[$€£,]/g, '')) * 1000000000 || null;
      else if (m.transform === 'percentage_to_decimal') transformed = parseFloat(String(value).replace(/%/g, '')) / 100 || null;
      else if (m.transform === 'strip_x_suffix') transformed = parseFloat(String(value).replace(/x$/i, '')) || null;

      if (transformed === null || transformed === '') continue;

      if (m.field.startsWith('customFields.')) {
        deal.customFields[m.field.replace('customFields.', '')] = transformed;
      } else {
        deal[m.field] = transformed;
      }
    }

    // Normalize enums
    if (deal.stage) {
      const upper = String(deal.stage).toUpperCase().replace(/[\s-]/g, '_');
      deal.stage = VALID_STAGES.includes(upper) ? upper : 'INITIAL_REVIEW';
    }
    if (deal.priority) {
      const upper = String(deal.priority).toUpperCase();
      deal.priority = VALID_PRIORITIES.includes(upper) ? upper : 'MEDIUM';
    }

    // Numeric fields
    for (const f of ['dealSize', 'ebitda', 'revenue', 'irrProjected', 'mom']) {
      if (deal[f] !== undefined && deal[f] !== null && typeof deal[f] === 'string') {
        const num = parseFloat(String(deal[f]).replace(/[$€£,%x,]/g, ''));
        deal[f] = isNaN(num) ? null : num;
      }
    }

    // Auto-generate name from company if missing
    if (!deal.name && deal.companyName) deal.name = deal.companyName;

    return deal;
  });

  // Count valid/invalid
  const valid = importState.mappedDeals.filter(d => d.companyName || d.name).length;
  const invalid = importState.mappedDeals.length - valid;

  // Render preview
  const summaryEl = document.getElementById('preview-summary');
  summaryEl.innerHTML = `
    <span class="font-medium text-slate-900">${importState.mappedDeals.length} deals found</span>
    <span class="mx-2 text-slate-300">·</span>
    <span class="text-emerald-600 font-medium">${valid} valid</span>
    ${invalid > 0 ? `<span class="mx-2 text-slate-300">·</span><span class="text-red-500 font-medium">${invalid} have issues</span>` : ''}
  `;

  // Table headers — show mapped field names
  const mappedFields = [...new Set(Object.values(importState.mapping).map(m => m.field).filter(f => !f.startsWith('customFields.')))];
  const displayFields = mappedFields.slice(0, 8); // Show max 8 columns

  const thead = document.getElementById('preview-thead');
  thead.innerHTML = `<tr>${displayFields.map(f => {
    const label = DEAL_FIELDS.find(df => df.value === f)?.label || f;
    return `<th class="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">${escapeHtml(label)}</th>`;
  }).join('')}</tr>`;

  const tbody = document.getElementById('preview-tbody');
  const previewRows = importState.mappedDeals.slice(0, 50);
  tbody.innerHTML = previewRows.map((deal, i) => {
    const hasIssue = !deal.companyName && !deal.name;
    const rowClass = hasIssue ? 'bg-red-50' : (i % 2 === 0 ? 'bg-white' : 'bg-slate-50');
    return `<tr class="${rowClass} border-b border-slate-100">${displayFields.map(f => {
      let val = deal[f];
      if (val === null || val === undefined) val = '—';
      else if (typeof val === 'number' && ['dealSize', 'ebitda', 'revenue'].includes(f)) {
        val = '$' + Number(val).toLocaleString();
      } else if (typeof val === 'number' && f === 'irrProjected') {
        val = (val * 100).toFixed(1) + '%';
      } else if (typeof val === 'number' && f === 'mom') {
        val = val.toFixed(1) + 'x';
      }
      return `<td class="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">${escapeHtml(String(val))}</td>`;
    }).join('')}</tr>`;
  }).join('');

  if (importState.mappedDeals.length > 50) {
    tbody.innerHTML += `<tr><td colspan="${displayFields.length}" class="px-3 py-2 text-xs text-slate-400 text-center">...and ${importState.mappedDeals.length - 50} more rows</td></tr>`;
  }

  // Update submit button label
  document.getElementById('import-submit-label').textContent = `Import ${valid} Deals`;

  goToImportStep(3);
}

// ============================================
// Step 3 → Step 4: Submit Import
// ============================================

async function submitDealImport() {
  const btn = document.getElementById('import-submit-btn');
  const origHTML = btn.innerHTML;

  // Filter to valid deals only
  const validDeals = importState.mappedDeals.filter(d => d.companyName || d.name);

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Importing...';

    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deals: validDeals }),
    });

    const data = await res.json();

    // Show result
    goToImportStep(4);

    if (data.imported > 0) {
      document.getElementById('import-result-icon').textContent = 'check_circle';
      document.getElementById('import-result-icon').style.color = '#059669';
      document.getElementById('import-result-title').textContent = `${data.imported} deals imported successfully!`;

      let detail = '';
      if (data.companiesCreated > 0) detail += `${data.companiesCreated} new companies created. `;
      if (data.failed > 0) detail += `${data.failed} rows failed.`;
      document.getElementById('import-result-detail').textContent = detail || 'All deals imported successfully.';
    } else {
      document.getElementById('import-result-icon').textContent = 'error';
      document.getElementById('import-result-icon').style.color = '#ef4444';
      document.getElementById('import-result-title').textContent = 'Import failed';
      document.getElementById('import-result-detail').textContent = 'No deals could be imported.';
    }

    // Show errors if any
    if (data.errors && data.errors.length > 0) {
      const errContainer = document.getElementById('import-result-errors');
      errContainer.classList.remove('hidden');
      errContainer.innerHTML = `
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div class="text-sm font-medium text-red-800 mb-2">Failed Rows</div>
          ${data.errors.map(e => `<div class="text-xs text-red-600 mb-1">Row ${e.row}: ${escapeHtml(e.reason)}</div>`).join('')}
        </div>
      `;
    }

    if (data.imported > 0) {
      showNotification('Deal Import', `${data.imported} deals imported successfully`, 'success');
    }

  } catch (err) {
    console.error('Import error:', err);
    goToImportStep(4);
    document.getElementById('import-result-icon').textContent = 'error';
    document.getElementById('import-result-icon').style.color = '#ef4444';
    document.getElementById('import-result-title').textContent = 'Import failed';
    document.getElementById('import-result-detail').textContent = 'An unexpected error occurred. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/js/deal-import.js
git commit -m "feat(import): add deal-import.js frontend with 4-step modal flow"
```

---

## Task 8: Wire up the import button in crm.js

**Files:**
- Modify: `apps/web/crm.js`

- [ ] **Step 1: Add import button listener**

In `apps/web/crm.js`, find the `initializeUploadModal()` function (around line 134). Add the import button wiring after the ingest button:

```javascript
// Wire up the "Import Deals" button
const importBtn = document.getElementById('import-deals-btn');
if (importBtn) {
    importBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDealImportModal();
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/crm.js
git commit -m "feat(import): wire import button to modal in crm.js"
```

---

## Task 9: Manual Integration Test

- [ ] **Step 1: Start the API server**

```bash
cd apps/api && npm run dev
```

- [ ] **Step 2: Start the web server**

```bash
cd apps/web && npm run dev
```

- [ ] **Step 3: Test CSV paste import**

1. Navigate to the CRM page (http://localhost:3000/crm.html)
2. Click "Import Deals" button
3. Switch to "Paste Data" tab
4. Paste this test data:

```
Company,Deal Size,Stage,Industry,Lead Partner
Acme Corp,$50M,Due Diligence,Technology,John Smith
Beta Healthcare,$25M,Initial Review,Healthcare,Jane Doe
Gamma Energy,$100M,LOI,Energy,Bob Wilson
```

5. Click "Analyze with AI"
6. Verify: Step 2 shows column mapping with green/amber indicators
7. Click "Continue to Preview"
8. Verify: Step 3 shows 3 deals with correct values ($50M = $50,000,000 etc.)
9. Click "Import 3 Deals"
10. Verify: Step 4 shows success message with "3 deals imported"
11. Click "View in Pipeline" — verify deals appear in CRM

- [ ] **Step 4: Test Excel upload**

1. Create a small .xlsx file with 5 deals in Excel/Google Sheets
2. Upload via the file upload tab
3. Verify full flow works

- [ ] **Step 5: Verify custom fields**

1. Include a column like "Board Seats" or "Lead Partner" in test data
2. Verify it shows as "Custom Field" in mapping
3. After import, check Supabase: the deal's `customFields` JSONB should contain the unmapped values

- [ ] **Step 6: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(import): complete deal import integration — CSV/Excel/paste with AI mapping"
```

---

## Task Summary

| Task | Description | Files | Est. |
|------|-------------|-------|------|
| 1 | Install csv-parse | package.json | 2 min |
| 2 | Add customFields to Deal schemas | deals.ts | 5 min |
| 3 | Build dealImportMapper service | dealImportMapper.ts (new) | 15 min |
| 4 | Build deal-import route | deal-import.ts (new) | 10 min |
| 5 | Mount router in app.ts | app.ts | 2 min |
| 6 | Add modal HTML to crm.html | crm.html | 10 min |
| 7 | Build frontend JS | deal-import.js (new) | 15 min |
| 8 | Wire button in crm.js | crm.js | 2 min |
| 9 | Integration test | Manual | 10 min |
