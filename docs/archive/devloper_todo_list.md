🛠️ Developer TODO List — PE DealStack
For: Claude Code / Developer
Project: PE DealStack (AI-Native Deal CRM for Private Equity)
Date: February 13, 2026
Repo: https://github.com/ganeshjagtap7/pe-dealstack
Codebase location: /Users/ganesh/SF Antigravity/Antigravity AI CRM/pe-dealstack

⚠️ IMPORTANT CONTEXT — READ FIRST
Tech Stack
Backend: Node.js + Express + TypeScript (in apps/api/)
Frontend: Vanilla HTML/JS + Vite (in apps/web/)
Database: Supabase (PostgreSQL) via @supabase/supabase-js
AI: OpenAI GPT-4 Turbo + Google Gemini
ORM: Direct Supabase client (NOT Prisma for queries)
Testing: Vitest (apps/api/tests/)
Logging: Pino logger (apps/api/src/utils/logger.ts — use log.info/debug/warn/error, NEVER console.log)
Key Files You Must Understand Before Starting
apps/api/src/routes/ingest.ts — Current document ingestion (PDF upload → AI extraction → deal creation). This is the main file you'll be modifying.
apps/api/src/services/aiExtractor.ts — AI extraction logic using OpenAI. Returns ExtractedDealData with confidence scores.
apps/api/src/supabase.ts — Supabase client export.
apps/api/src/rag.ts — RAG embedding function embedDocument().
apps/api/src/utils/logger.ts — Pino logger. Import as import { log } from '../utils/logger.js';
apps/api/src/openai.ts — OpenAI client. Exports openai and isAIEnabled().
Coding Standards — MUST FOLLOW
NEVER use console.log — use log.info(), log.debug(), log.warn(), log.error() from logger.
Always validate input with Zod — every new route must have a Zod schema.
Always use .js extensions in imports — e.g., import { log } from '../utils/logger.js'; (TypeScript with ESM).
Error handling — wrap every route handler in try/catch, return proper HTTP status codes.
Supabase queries — use the supabase client from ../supabase.js, NOT Prisma.
Run tests after each change — cd apps/api && npm test (all 188 tests must pass).
No hardcoded secrets — use process.env.VARIABLE_NAME.
📋 TODO LIST
There are 2 sections: Production Readiness fixes, then Feature Development.

SECTION A: PRODUCTION READINESS (Do These First)
A1. Enable Supabase Database Backups ⏱️ 30 min
Priority: 🔴 P0 Critical
Type: Manual / Configuration
No code changes needed

Instructions:
Go to https://supabase.com/dashboard
Select the project (URL contains rnipkfubpvyvskswsekk)
Navigate to Database → Backups
Enable Daily automated backups
Set backup time to 02:00 UTC
Download one test backup to verify it works
Document the restore procedure in docs/RUNBOOK.md
Acceptance Criteria:
[ ] Daily backups are enabled
[ ] Test backup downloaded and verified
[ ] Restore procedure documented
A2. Verify Row-Level Security (RLS) Policies ⏱️ 2 hours
Priority: 🔴 P0 Critical
Type: Database / SQL

Instructions:
Open Supabase SQL Editor
Run this query to audit existing policies:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
Verify these tables ALL have RLS enabled:

Deal — users can only see deals from their organization
Document — users can only access docs from their org's deals
Company — users in the same org can see shared companies
Memo — users can only see memos for their org's deals
Activity — scoped to org's deals
User — users can only read their own profile or users in their org
DealTeamMember — scoped to org
Notification — users can only see their own notifications
Invitation — scoped properly
If any table is MISSING RLS, enable it:

-- Example for Deal table
ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deals from their organization"
ON "Deal" FOR SELECT
USING (
  "organizationId" IN (
    SELECT "organizationId" FROM "User" WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert deals in their organization"
ON "Deal" FOR INSERT
WITH CHECK (
  "organizationId" IN (
    SELECT "organizationId" FROM "User" WHERE id = auth.uid()
  )
);
Test by logging in as 2 different users from different orgs and verifying data isolation.
Acceptance Criteria:
[ ] All tables have RLS enabled
[ ] Policies verified for SELECT, INSERT, UPDATE, DELETE on critical tables
[ ] Cross-org data isolation tested
A3. Create Local .env Files ⏱️ 15 min
Priority: 🔴 P0 Critical
Type: Configuration

Instructions:
# Backend
cd apps/api
cp .env.example .env
# Edit .env with real values (Supabase URL, keys, OpenAI key, etc.)

# Frontend  
cd apps/web
cp .env.example .env
# Edit .env with real values (VITE_ prefixed variables)
Verify both services start without errors:

cd apps/api && npm run dev   # Should start on port 3001
cd apps/web && npm run dev   # Should start on port 3000
Acceptance Criteria:
[ ] Backend starts without "Missing required environment variables" error
[ ] Frontend starts and loads correctly
[ ] Both .env files are in .gitignore (DO NOT COMMIT)
A4. Sign Up for Sentry Error Tracking ⏱️ 30 min
Priority: 🟡 P1 High
Type: Configuration / External Service

Instructions:
Go to https://sentry.io and create a free account
Create an organization (e.g., "PocketFund" or "PE DealStack")
Create 2 projects:
Backend project: Platform = Node.js/Express → Copy DSN
Frontend project: Platform = JavaScript → Copy DSN
Add to apps/api/.env:
SENTRY_DSN=https://your-backend-dsn@o123.ingest.sentry.io/456
Add to apps/web/.env:
VITE_SENTRY_DSN=https://your-frontend-dsn@o123.ingest.sentry.io/789
The code already integrates Sentry — see apps/api/src/index.ts lines 44-52 and apps/web/vite.config.ts lines 22-27.
Test: Trigger an error and verify it appears in Sentry dashboard.
Acceptance Criteria:
[ ] Sentry account created with 2 projects
[ ] DSNs added to .env files
[ ] Test error appears in Sentry dashboard
A5. Manual QA Testing ⏱️ 2 hours
Priority: 🔴 P0 Critical
Type: Testing

Instructions:
Test each flow end-to-end. Track bugs in a spreadsheet.

Test 1: Authentication

[ ] Sign up with new email
[ ] Verify email (check Supabase Auth dashboard)
[ ] Log in with verified account
[ ] Log out
[ ] Forgot password flow
[ ] Try accessing /dashboard.html while logged out (should redirect to login)
Test 2: Deal Management

[ ] Create new deal from CRM page
[ ] Edit deal details (name, stage, description)
[ ] Change deal stage (drag in pipeline or dropdown)
[ ] Filter/search deals
[ ] Delete deal (if supported)
Test 3: Document Upload (Ingest)

[ ] Upload a sample PDF → should auto-create deal
[ ] Check extraction confidence scores shown correctly
[ ] Review pending deal (if confidence < 70%)
[ ] Approve deal from review
[ ] Upload to an existing deal
Test 4: AI Features

[ ] Generate AI deal thesis
[ ] Chat with AI about a deal
[ ] Generate investment memo sections
[ ] Check rate limiting works (try 15+ rapid AI requests → should get 429)
Test 5: Error Handling

[ ] Submit forms with empty required fields
[ ] Upload a non-PDF file to ingest (should fail gracefully)
[ ] Try accessing a non-existent deal ID (should 404)
Acceptance Criteria:
[ ] All critical flows work end-to-end
[ ] Bug list created with severity ratings
[ ] P0 bugs fixed before launch
SECTION B: FEATURE DEVELOPMENT — Smart Deal Data Extraction
Goal: Allow users to drop ANY type of raw deal data and have the system extract structured data and auto-create a deal.

Current state: Only PDF upload works via POST /api/ingest endpoint.
Target state: Support plain text, Word docs, Excel bulk import, URL scraping, and deep LangExtract extraction.

B1. Add Plain Text Ingestion Endpoint ⏱️ 2 hours
Priority: 🔴 P0 — Build First
Type: Backend — New Route
File to modify: apps/api/src/routes/ingest.ts

Context:
Users often receive deal information via email, Slack, WhatsApp, or notes. They need to copy-paste text and have the system extract deal data automatically.

Instructions:
Step 1: Add the Zod schema and new route at the end of apps/api/src/routes/ingest.ts (before export default router;):

// ─── Text Ingestion ───────────────────────────────────────────

const textIngestSchema = z.object({
  text: z.string().min(50, 'Text must be at least 50 characters'),
  sourceName: z.string().optional(),
  sourceType: z.enum(['email', 'note', 'slack', 'whatsapp', 'other']).optional(),
});

// POST /api/ingest/text — Create deal from raw pasted text
router.post('/text', async (req, res) => {
  try {
    const validation = textIngestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { text, sourceName, sourceType } = validation.data;
    log.info('Text ingest starting', { textLength: text.length, sourceType });

    // Step 1: Extract data using existing AI extractor
    const aiData = await extractDealDataFromText(text);
    if (!aiData) {
      return res.status(400).json({ error: 'Could not extract deal data from text. Try providing more detail.' });
    }

    // Step 2: Create or find company
    const companyName = aiData.companyName.value || 'Unknown Company';
    const { data: existingCompany } = await supabase
      .from('Company')
      .select('id, name')
      .ilike('name', companyName)
      .single();

    let company;
    if (existingCompany) {
      company = existingCompany;
      log.debug('Found existing company', { name: company.name });
    } else {
      const { data: newCompany, error: companyError } = await supabase
        .from('Company')
        .insert({
          name: companyName,
          industry: aiData.industry.value,
          description: aiData.description.value,
        })
        .select()
        .single();
      if (companyError) throw companyError;
      company = newCompany;
      log.debug('Created company', { name: company.name });
    }

    // Step 3: Create deal
    const dealIcon = getIconForIndustry(aiData.industry.value);
    const dealStatus = aiData.needsReview ? 'PENDING_REVIEW' : 'ACTIVE';

    const { data: deal, error: dealError } = await supabase
      .from('Deal')
      .insert({
        name: companyName,
        companyId: company.id,
        stage: 'INITIAL_REVIEW',
        status: dealStatus,
        industry: aiData.industry.value,
        description: aiData.description.value,
        revenue: aiData.revenue.value,
        ebitda: aiData.ebitda.value,
        dealSize: aiData.revenue.value,
        aiThesis: aiData.summary,
        icon: dealIcon,
        extractionConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      })
      .select()
      .single();

    if (dealError) throw dealError;

    // Step 4: Create document record for text source
    const { data: document } = await supabase
      .from('Document')
      .insert({
        dealId: deal.id,
        name: sourceName || `${sourceType || 'Text'} input - ${new Date().toLocaleDateString()}`,
        type: 'OTHER',
        extractedText: text,
        extractedData: {
          companyName: aiData.companyName,
          industry: aiData.industry,
          description: aiData.description,
          revenue: aiData.revenue,
          ebitda: aiData.ebitda,
          ebitdaMargin: aiData.ebitdaMargin,
          revenueGrowth: aiData.revenueGrowth,
          employees: aiData.employees,
          foundedYear: aiData.foundedYear,
          headquarters: aiData.headquarters,
          keyRisks: aiData.keyRisks,
          investmentHighlights: aiData.investmentHighlights,
          summary: aiData.summary,
          overallConfidence: aiData.overallConfidence,
          needsReview: aiData.needsReview,
          reviewReasons: aiData.reviewReasons,
        },
        status: aiData.needsReview ? 'pending_review' : 'analyzed',
        confidence: aiData.overallConfidence / 100,
        aiAnalyzedAt: new Date().toISOString(),
        mimeType: 'text/plain',
      })
      .select()
      .single();

    // Step 5: Log activity
    await supabase.from('Activity').insert({
      dealId: deal.id,
      type: 'DEAL_CREATED',
      title: `Deal created from ${sourceType || 'text'} input`,
      description: aiData.needsReview
        ? `"${companyName}" extracted with ${aiData.overallConfidence}% confidence — NEEDS REVIEW`
        : `"${companyName}" auto-created with ${aiData.overallConfidence}% confidence`,
      metadata: {
        sourceType,
        sourceName,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });

    // Step 6: Trigger RAG embedding in background
    if (text.length > 100) {
      embedDocument(document?.id || deal.id, deal.id, text)
        .then(result => {
          if (result.success) log.debug('RAG embedding complete', { chunkCount: result.chunkCount });
          else log.error('RAG embedding failed', result.error);
        })
        .catch(err => log.error('RAG embedding error', err));
    }

    log.info('Text ingest complete', { dealId: deal.id, confidence: aiData.overallConfidence });

    res.status(201).json({
      success: true,
      deal: { ...deal, company },
      document,
      extraction: {
        companyName: aiData.companyName,
        industry: aiData.industry,
        revenue: aiData.revenue,
        ebitda: aiData.ebitda,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
    });
  } catch (error) {
    log.error('Text ingest error', error);
    res.status(500).json({ error: 'Failed to process text input' });
  }
});
Step 2: Verify the AI rate limiter is applied. In apps/api/src/index.ts, check that /api/ingest routes use the writeLimiter or aiLimiter. The ingestion involves AI calls, so rate limiting matters.

Step 3: Write a test in apps/api/tests/ for this new endpoint.

Test It:
curl -X POST http://localhost:3001/api/ingest/text \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Acme Healthcare Services is a leading home healthcare provider in the Northeast US. The company generates $50M in annual revenue with $10M EBITDA (20% margins). Founded in 2010, they employ 500+ caregivers serving 10,000+ patients annually. The company is looking for growth capital for geographic expansion into the Mid-Atlantic region.",
    "sourceType": "email",
    "sourceName": "Email from Goldman Sachs"
  }'
Expected Response:
{
  "success": true,
  "deal": {
    "id": "uuid-here",
    "name": "Acme Healthcare Services",
    "industry": "Healthcare Services",
    "revenue": 50,
    "ebitda": 10,
    "status": "ACTIVE"
  },
  "extraction": {
    "companyName": { "value": "Acme Healthcare Services", "confidence": 95 },
    "revenue": { "value": 50, "confidence": 90 },
    "overallConfidence": 90,
    "needsReview": false
  }
}
Acceptance Criteria:
[ ] POST /api/ingest/text creates a deal from raw text
[ ] Zod validation rejects text shorter than 50 chars
[ ] AI extraction populates all fields with confidence scores
[ ] Company deduplication works (existing company matched by name)
[ ] Document record created with mimeType: 'text/plain'
[ ] Activity logged
[ ] RAG embedding triggered
[ ] All existing tests still pass (npm test → 188 pass)
[ ] New test written for this endpoint
B2. Add Word Document Support ⏱️ 1.5 hours
Priority: 🔴 P0
Type: Backend — Modify Existing Route
Files to modify:

apps/api/src/services/documentParser.ts (NEW FILE)
apps/api/src/routes/ingest.ts (modify existing PDF-only check)
Instructions:
Step 1: Install mammoth:

cd apps/api
npm install mammoth
npm install --save-dev @types/mammoth  # if types exist, otherwise skip
Step 2: Create apps/api/src/services/documentParser.ts:

import mammoth from 'mammoth';
import { log } from '../utils/logger.js';

/**
 * Extract raw text from a Word document (.docx / .doc)
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string | null> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length < 50) {
      log.warn('Word document had insufficient text', { length: result.value?.length || 0 });
      return null;
    }
    return result.value;
  } catch (error) {
    log.error('Word extraction error', error);
    return null;
  }
}
Step 3: Modify apps/api/src/routes/ingest.ts:

Add import at the top:

import { extractTextFromWord } from '../services/documentParser.js';
Find the block in the POST / handler (around line 111-123) that currently says:

if (mimeType === 'application/pdf') {
  // ... PDF extraction ...
} else {
  return res.status(400).json({ error: 'Only PDF files are supported for auto-deal creation' });
}
Replace the else block to support more formats:

if (mimeType === 'application/pdf') {
  log.debug('Step 1: Extracting text from PDF');
  const extraction = await extractTextFromPDF(file.buffer);
  if (extraction) {
    extractedText = extraction.text.replace(/\u0000/g, '');
    numPages = extraction.numPages;
    log.debug('PDF extracted', { numPages, charCount: extractedText.length });
  } else {
    return res.status(400).json({ error: 'Failed to extract text from PDF' });
  }
} else if (
  mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
  mimeType === 'application/msword'
) {
  log.debug('Step 1: Extracting text from Word document');
  extractedText = await extractTextFromWord(file.buffer);
  if (!extractedText) {
    return res.status(400).json({ error: 'Failed to extract text from Word document' });
  }
  log.debug('Word extracted', { charCount: extractedText.length });
} else if (mimeType === 'text/plain') {
  log.debug('Step 1: Reading plain text file');
  extractedText = file.buffer.toString('utf-8');
  if (!extractedText || extractedText.trim().length < 50) {
    return res.status(400).json({ error: 'Text file is too short or empty' });
  }
} else {
  return res.status(400).json({
    error: 'Unsupported file type',
    supported: ['PDF (.pdf)', 'Word (.docx, .doc)', 'Text (.txt)'],
  });
}
Step 4: Update the multer fileFilter (around line 36-49) to also accept .txt:

const allowedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
Acceptance Criteria:
[ ] POST /api/ingest accepts Word (.docx) files and creates deals
[ ] POST /api/ingest accepts plain text (.txt) files and creates deals
[ ] PDF still works as before (regression check)
[ ] Error messages are user-friendly for unsupported types
[ ] All 188 tests still pass
[ ] New test added for Word document ingestion
B3. Add Excel/CSV Bulk Import ⏱️ 3 hours
Priority: 🟡 P1
Type: Backend — New Service + Route
Files to create/modify:

apps/api/src/services/excelParser.ts (NEW FILE)
apps/api/src/routes/ingest.ts (add bulk route)
Instructions:
Step 1: Install xlsx:

cd apps/api
npm install xlsx
Step 2: Create apps/api/src/services/excelParser.ts:

import XLSX from 'xlsx';
import { log } from '../utils/logger.js';

export interface DealRow {
  companyName: string;
  industry?: string;
  description?: string;
  revenue?: number;
  ebitda?: number;
  stage?: string;
  notes?: string;
}

// Map common column header variations to our field names
const COLUMN_MAPPINGS: Record<string, string[]> = {
  companyName: ['Company', 'Company Name', 'Name', 'Target', 'Target Company', 'Entity'],
  industry: ['Industry', 'Sector', 'Vertical', 'Market'],
  description: ['Description', 'Business Description', 'Overview', 'Summary'],
  revenue: ['Revenue', 'Sales', 'Annual Revenue', 'Rev', 'TTM Revenue', 'Revenue ($M)'],
  ebitda: ['EBITDA', 'Adj. EBITDA', 'Adjusted EBITDA', 'Earnings', 'EBITDA ($M)'],
  stage: ['Stage', 'Pipeline Stage', 'Deal Stage', 'Status', 'Phase'],
  notes: ['Notes', 'Comments', 'Remarks', 'Details'],
};

function findFieldForHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    if (aliases.some(alias => alias.toLowerCase() === normalized)) {
      return field;
    }
  }
  return null;
}

export function parseExcelToDealRows(buffer: Buffer): DealRow[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

    if (rawData.length === 0) {
      log.warn('Excel file has no data rows');
      return [];
    }

    const deals = rawData
      .map((row) => {
        const mapped: Partial<DealRow> = {};
        for (const [key, value] of Object.entries(row)) {
          const field = findFieldForHeader(key);
          if (field) {
            if (field === 'revenue' || field === 'ebitda') {
              const num = parseFloat(String(value).replace(/[$,]/g, ''));
              (mapped as any)[field] = isNaN(num) ? undefined : num;
            } else {
              (mapped as any)[field] = typeof value === 'string' ? value.trim() : String(value);
            }
          }
        }
        return mapped;
      })
      .filter((row): row is DealRow => !!row.companyName && row.companyName.length > 0);

    log.info('Parsed Excel file', { totalRows: rawData.length, validDeals: deals.length });
    return deals;
  } catch (error) {
    log.error('Excel parsing error', error);
    return [];
  }
}
Step 3: Add the bulk import route to apps/api/src/routes/ingest.ts:

import { parseExcelToDealRows } from '../services/excelParser.js';

// POST /api/ingest/bulk — Import deals from Excel/CSV
router.post('/bulk', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    if (
      !file.mimetype.includes('spreadsheet') &&
      !file.mimetype.includes('excel') &&
      !file.mimetype.includes('csv')
    ) {
      return res.status(400).json({ error: 'File must be Excel (.xlsx) or CSV (.csv)' });
    }

    log.info('Bulk ingest starting', { filename: file.originalname });

    const dealRows = parseExcelToDealRows(file.buffer);
    if (dealRows.length === 0) {
      return res.status(400).json({
        error: 'No valid deals found in file. Ensure you have a column named "Company" or "Company Name".',
        hint: 'Supported columns: Company Name, Industry, Revenue, EBITDA, Stage, Description, Notes',
      });
    }

    if (dealRows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 deals per import. Split your file.' });
    }

    const results: { success: any[]; failed: any[]; total: number } = {
      success: [],
      failed: [],
      total: dealRows.length,
    };

    for (const row of dealRows) {
      try {
        // Deduplicate company
        const { data: existing } = await supabase
          .from('Company')
          .select('id, name')
          .ilike('name', row.companyName)
          .single();

        let company;
        if (existing) {
          company = existing;
        } else {
          const { data: newCo, error } = await supabase
            .from('Company')
            .insert({
              name: row.companyName,
              industry: row.industry,
              description: row.description,
            })
            .select()
            .single();
          if (error) throw error;
          company = newCo;
        }

        // Create deal
        const { data: deal, error: dealErr } = await supabase
          .from('Deal')
          .insert({
            name: row.companyName,
            companyId: company.id,
            stage: row.stage || 'INITIAL_REVIEW',
            status: 'ACTIVE',
            industry: row.industry,
            description: row.description || row.notes,
            revenue: row.revenue,
            ebitda: row.ebitda,
            icon: getIconForIndustry(row.industry || null),
            extractionConfidence: 100, // Manual import = high confidence
          })
          .select()
          .single();

        if (dealErr) throw dealErr;
        results.success.push({ companyName: row.companyName, dealId: deal.id });
      } catch (err) {
        log.warn('Row import failed', { companyName: row.companyName, error: (err as any).message });
        results.failed.push({ companyName: row.companyName, error: (err as any).message });
      }
    }

    log.info('Bulk ingest complete', {
      total: results.total,
      success: results.success.length,
      failed: results.failed.length,
    });

    res.status(201).json({
      success: true,
      summary: {
        total: results.total,
        imported: results.success.length,
        failed: results.failed.length,
        deals: results.success,
        errors: results.failed,
      },
    });
  } catch (error) {
    log.error('Bulk ingest error', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});
Test with sample Excel:
Create a test .xlsx with columns: Company Name | Industry | Revenue | EBITDA | Stage | Notes

Acceptance Criteria:
[ ] POST /api/ingest/bulk accepts Excel files
[ ] Smart column mapping (handles "Company", "Company Name", "Target", etc.)
[ ] Company deduplication works
[ ] Response shows imported count, failed count, and details
[ ] Maximum 500 deals per import enforced
[ ] Financial values handle $, commas, etc.
[ ] All existing tests still pass
B4. Add LangExtract Python Microservice ⏱️ 6 hours
Priority: 🟡 P1
Type: New Python Service + Node.js Integration
Why: For deep extraction from long CIMs (50-200 pages). Your current system truncates at 20,000 chars. LangExtract handles full documents with chunking, multi-pass extraction, and character-level source grounding.

Instructions:
Step 1: Create the Python service directory:

mkdir -p apps/extractor
cd apps/extractor
python3 -m venv .venv
source .venv/bin/activate
pip install langextract flask gunicorn
pip freeze > requirements.txt
Step 2: Create apps/extractor/server.py — See full code in DEAL_EXTRACTION_GUIDE.md section "Method 4: LangExtract Deep Extraction". The key pieces are:

Flask API with /health and /extract endpoints
PE-specific extraction prompt with few-shot examples for financial data
transform_to_deal_schema() function to convert LangExtract entities into our deal schema
Supports Gemini (default, cheaper) and OpenAI fallback
Step 3: Create apps/api/src/services/langExtractClient.ts — A thin HTTP client that calls the Python service:

import { log } from '../utils/logger.js';

const EXTRACTOR_URL = process.env.EXTRACTOR_URL || 'http://localhost:5050';

export interface DeepExtractionResult {
  success: boolean;
  dealData: {
    companyName: string | null;
    industry: string | null;
    revenue: number | null;
    ebitda: number | null;
    ebitdaMargin: number | null;
    revenueGrowth: number | null;
    employees: number | null;
    headquarters: string | null;
    keyRisks: string[];
    investmentHighlights: string[];
    financialMetrics: any[];
    sourceGroundings: any[];
  };
  rawExtractions: any[];
  extractionCount: number;
}

export async function deepExtract(text: string): Promise<DeepExtractionResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${EXTRACTOR_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model: 'gemini-2.5-flash',
        extraction_passes: 3,
        max_workers: 10,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error('LangExtract service returned error', { status: response.status });
      return null;
    }

    return await response.json();
  } catch (error) {
    log.warn('LangExtract service unavailable, will fallback', error);
    return null;
  }
}

export function isDeepExtractionAvailable(): boolean {
  return !!process.env.EXTRACTOR_URL;
}
Step 4: Add smart routing in apps/api/src/routes/ingest.ts — In the main POST / handler, after text extraction but before AI extraction, add:

import { deepExtract, isDeepExtractionAvailable } from '../services/langExtractClient.js';

// After extractedText is populated, decide extraction path:
const shouldUseDeepExtraction =
  extractedText.length > 50000 && isDeepExtractionAvailable();

let aiData: ExtractedDealData | null = null;

if (shouldUseDeepExtraction) {
  log.info('Using deep extraction for long document', { textLength: extractedText.length });
  const deepResult = await deepExtract(extractedText);

  if (deepResult?.success) {
    // Transform deep result into ExtractedDealData format
    // (you'll need a transformer function here)
    aiData = transformDeepResultToExtractedDealData(deepResult);
  } else {
    log.warn('Deep extraction failed, falling back to standard GPT-4');
    aiData = await extractDealDataFromText(extractedText);
  }
} else {
  aiData = await extractDealDataFromText(extractedText);
}
Step 5: Add EXTRACTOR_URL to .env.example files:

# apps/api/.env.example
EXTRACTOR_URL=http://localhost:5050  # Optional: LangExtract Python service
Running the Service:
# Terminal 1: Python extractor
cd apps/extractor
source .venv/bin/activate
python server.py  # Runs on port 5050

# Terminal 2: Node.js API
cd apps/api
EXTRACTOR_URL=http://localhost:5050 npm run dev
Acceptance Criteria:
[ ] Python service starts on port 5050
[ ] GET /health returns { "status": "ok" }
[ ] POST /extract returns structured deal data from text
[ ] Node.js client calls Python service successfully
[ ] Smart routing: documents > 50,000 chars use deep extraction
[ ] Graceful fallback: if Python service is down, uses standard GPT-4
[ ] All existing tests still pass
B5. Add Website URL Scraping ⏱️ 3 hours
Priority: 🟠 P2 — Nice to Have
Type: Backend — New Service + Route

Instructions:
Step 1: No new npm packages needed. Use Node.js built-in fetch.

Step 2: Create apps/api/src/services/webScraper.ts:

import { log } from '../utils/logger.js';

export async function scrapeWebsite(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PE-DealStack/1.0)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('Website scrape failed', { url, status: response.status });
      return null;
    }

    const html = await response.text();

    // Strip HTML to plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    return text.slice(0, 15000); // Limit to 15k chars
  } catch (error) {
    log.error('Web scraping error', { url, error });
    return null;
  }
}
Step 3: Add route to apps/api/src/routes/ingest.ts:

import { scrapeWebsite } from '../services/webScraper.js';

const urlIngestSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  companyName: z.string().optional(),
});

// POST /api/ingest/url — Create deal from company website
router.post('/url', async (req, res) => {
  try {
    const validation = urlIngestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const { url, companyName } = validation.data;
    log.info('URL ingest starting', { url });

    const scrapedText = await scrapeWebsite(url);
    if (!scrapedText || scrapedText.length < 100) {
      return res.status(400).json({ error: 'Could not extract enough content from this website' });
    }

    // Use AI extraction
    const aiData = await extractDealDataFromText(scrapedText);
    if (!aiData) {
      return res.status(400).json({ error: 'Could not extract deal data from website content' });
    }

    // Override company name if user provided one
    if (companyName) {
      aiData.companyName.value = companyName;
      aiData.companyName.confidence = 100;
    }

    // Create company and deal (same pattern as text ingest)
    // ... reuse the same company/deal creation code from B1 ...

    log.info('URL ingest complete', { dealId: deal.id, url });

    res.status(201).json({
      success: true,
      deal: { ...deal, company },
      extraction: { /* same as B1 */ },
      source: { type: 'web_scrape', url },
    });
  } catch (error) {
    log.error('URL ingest error', error);
    res.status(500).json({ error: 'Failed to process URL' });
  }
});
Acceptance Criteria:
[ ] POST /api/ingest/url accepts a URL and scrapes the website
[ ] Strips HTML properly (no tags in extracted text)
[ ] 10-second timeout on scraping
[ ] AI extracts deal data from scraped text
[ ] Optional companyName override works
[ ] All existing tests still pass
B6. Build Frontend Intake UI ⏱️ 3 hours
Priority: 🟡 P1
Type: Frontend — New Page
Files to create:

apps/web/deal-intake.html (new page)
apps/web/js/deal-intake.js (new JS file)
Instructions:
Create a unified deal intake page with tabs for:

Upload File — drag-and-drop for PDF, Word, Excel, Text
Paste Text — textarea for raw text input
Enter URL — input field for company website
Design requirements:

Follow the existing app's design system (see apps/web/css/ for styles)
Include a loading spinner during extraction
Show extraction preview with confidence scores before redirecting to deal
Support dark mode if the existing app does
Use the existing auth.js for authentication checks
Match the existing sidebar navigation pattern
Key JavaScript functions needed:

uploadFile() — sends file to POST /api/ingest or POST /api/ingest/bulk
extractFromText() — sends text to POST /api/ingest/text
extractFromURL() — sends URL to POST /api/ingest/url
showExtractionPreview() — displays extracted data with confidence bars
goToDeal() — redirects to deal.html?id=DEAL_ID
Add to sidebar navigation in all existing HTML pages:

<a href="/deal-intake.html" class="nav-link">
  <span class="material-icons-outlined">upload_file</span>
  <span>Deal Intake</span>
</a>
Add to Vite config (apps/web/vite.config.ts) in the rollupOptions.input object:

'deal-intake': resolve(__dirname, 'deal-intake.html'),
Acceptance Criteria:
[ ] New page at /deal-intake.html
[ ] File upload tab works (PDF, Word, Text files)
[ ] Text paste tab works
[ ] URL input tab works
[ ] Loading state during extraction
[ ] Extraction preview shows company name, industry, revenue, EBITDA with confidence %
[ ] Confidence bar with color coding (green > 80%, yellow 60-80%, red < 60%)
[ ] "View Deal" button redirects to deal page
[ ] Page is accessible from sidebar navigation
[ ] Page is in Vite build config
[ ] Auth check on page load (redirect to login if not authenticated)
📊 IMPLEMENTATION ORDER
Follow this order for maximum value with minimum risk:

Week 1 (4 hours):
  ✅ A1. Database backups (30 min)
  ✅ A2. Verify RLS (2 hours)
  ✅ A3. Create .env files (15 min)
  ✅ A4. Sentry setup (30 min)
  ✅ A5. Manual QA (2 hours)

Week 1-2 (4 hours):
  ✅ B1. Text ingestion endpoint (2 hours)
  ✅ B2. Word document support (1.5 hours)

Week 2 (6 hours):
  ✅ B3. Excel bulk import (3 hours)
  ✅ B6. Frontend intake UI (3 hours)

Week 3 (9 hours):
  ✅ B4. LangExtract service (6 hours)
  ✅ B5. URL scraping (3 hours)
After each task, run: cd apps/api && npm test
All 188 tests must continue to pass.

🧪 TESTING REQUIREMENTS
For each new endpoint, add tests in apps/api/tests/:

// apps/api/tests/ingest-text.test.ts
import { describe, it, expect } from 'vitest';

describe('POST /api/ingest/text', () => {
  it('should reject text shorter than 50 characters', async () => {
    // ...
  });

  it('should reject missing text field', async () => {
    // ...
  });

  it('should accept valid text and return extraction', async () => {
    // ...
  });

  it('should handle AI extraction failure gracefully', async () => {
    // ...
  });
});
Follow the existing test patterns in apps/api/tests/critical-flows.test.ts for mocking Supabase and AI services.

⚠️ COMMON PITFALLS TO AVOID
DON'T use console.log — Use log.info/debug/warn/error from ../utils/logger.js
DON'T forget .js in imports — TypeScript with ESM requires file extensions
DON'T hardcode any credentials — Use process.env.VARIABLE
DON'T skip Zod validation — Every new route needs input validation
DON'T break existing tests — Run npm test after every change
DON'T create overly large files — ingest.ts is already 516 lines. If adding too much, extract to a helper file
DON'T use Prisma for queries — Use the supabase client from ../supabase.js
DON'T forget rate limiting — AI-heavy routes should use aiLimiter, write routes should use writeLimiter
📁 FILES MAP
apps/api/src/
├── index.ts                    # Express app setup, middleware, health checks
├── supabase.ts                 # Supabase client (import { supabase } from here)
├── openai.ts                   # OpenAI client (import { openai, isAIEnabled } from here)
├── rag.ts                      # RAG embedding function
├── utils/
│   └── logger.ts               # Pino logger (import { log } from here)
├── services/
│   ├── aiExtractor.ts          # AI extraction with confidence scores ← EXISTING
│   ├── documentParser.ts       # Word doc parser ← CREATE (B2)
│   ├── excelParser.ts          # Excel/CSV parser ← CREATE (B3)
│   ├── langExtractClient.ts    # Python service client ← CREATE (B4)
│   ├── webScraper.ts           # URL scraper ← CREATE (B5)
│   └── fileValidator.ts        # File validation ← EXISTING
├── routes/
│   ├── ingest.ts               # Document ingestion ← MODIFY (B1, B2, B3, B5)
│   ├── deals.ts                # Deal CRUD
│   ├── ai.ts                   # AI features
│   ├── memos.ts                # Memo builder
│   └── ...                     # Other routes
└── tests/
    ├── critical-flows.test.ts  # 29 critical flow tests
    ├── api-smoke.test.ts       # 36 smoke tests
    └── ...                     # Other tests (188 total)

apps/extractor/                 # ← CREATE (B4)
├── .venv/                      # Python virtual environment
├── server.py                   # Flask API for LangExtract
└── requirements.txt            # Python dependencies

apps/web/
├── deal-intake.html            # ← CREATE (B6)
├── js/
│   ├── auth.js                 # Authentication
│   ├── deal-intake.js          # ← CREATE (B6)
│   └── ...
└── vite.config.ts              # ← MODIFY (B6 — add deal-intake.html)
➡️ CONTINUE TO PART 2
After completing these tasks, proceed to DEVELOPER_TODO_PART2.md which contains:

Section	What It Covers	Time
C: PE-Firm Robustness	Audit trails, financial validation, encryption, DB optimization, data export	14 hours
D1: Email Parsing	Parse .eml files → auto-create deals with attachment processing	4 hours
D2: Auto-Research	Enhanced URL scraping — scrapes About/Team/Products pages, auto-enriches deals	5 hours
D3: Multi-Document Context	Cross-analyze 5-20 docs per deal, detect conflicts, fill gaps, AI synthesis	6 hours
Total (Part 1 + Part 2): ~51 hours across 6 weeks

Last Updated: February 13, 2026
Contact: Ganesh Jagtap