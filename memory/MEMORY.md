# PE OS Project Memory

## Deployment Architecture
- **Frontend**: Vanilla JS + HTML (mostly), React only for VDR (vdr.tsx). Deployed on **Vercel**
- **Backend**: Express.js → compiled to `apps/api/dist/` → Vercel Serverless Function via `api/index.ts`
- **Vercel timeout**: 60s max (set in vercel.json). No persistent background jobs possible.
- **Database**: Supabase PostgreSQL (camelCase column naming, UUID PKs, TIMESTAMPTZ)
- **Auth + Storage**: Supabase
- **AI**: OpenAI GPT-4o (main) + Gemini (embeddings)

## Database Migration Pattern
**CRITICAL**: Prisma migrations are NOT used in production. The Prisma init migration is SQLite-format.
- New tables go in `apps/api/*.sql` files (e.g., `memo-schema.sql`, `contacts-migration.sql`)
- User runs them manually in Supabase SQL Editor
- Prisma schema (`schema.prisma`) is updated for TypeScript types only
- Always use `IF NOT EXISTS` and DO blocks for safe re-runs

## Financial Extraction Pipeline (feature/financial-extraction branch)
- **No Azure Doc Intelligence** yet — GPT-4o only for now. Code structured for Azure to slot in later.
- **No async background jobs** — two synchronous API calls: fast pass (<10s) + deep pass (~30-50s)
- **Storage**: JSONB for lineItems in FinancialStatement table (V1 decision)
- **No Python extractor** — pure Node.js pipeline
- **FinancialStatement table**: created via `financial-statement-migration.sql` (already run in Supabase)
- **Services**: `financialClassifier.ts`, `financialExtractionOrchestrator.ts`, `financialValidator.ts`, `visionExtractor.ts`, `azureDocIntelligence.ts`, `excelFinancialExtractor.ts`
- **Routes**: `apps/api/src/routes/financials.ts` — registered in `app.ts` with auth middleware

## deal.html / deal.js — Critical CSS Gotchas
- **`glass-panel` CSS**: `background: rgba(255,255,255,0.8)` — INVISIBLE on white `bg-surface-card` (#FFFFFF) background. Never use glass-panel for sections that need to be visible on the left panel.
- **Tailwind opacity modifiers on custom colors**: `bg-primary/[0.05]`, `border-primary/20` etc. — produce near-transparent results with `primary: #003366`. Use solid colors instead.
- **`btn-primary` class**: Does NOT exist in the codebase. Use explicit Tailwind classes or inline styles for buttons.
- **Financial Statements section**: Uses pure inline CSS (no Tailwind) to avoid all opacity/rendering issues. Toggle uses `element.style.display` not `classList.toggle('hidden')`.
- **Key Risks card**: Uses `flex flex-col max-height:320px` with `flex-1 min-h-0 overflow-y-auto` inner list — same pattern as Activity Feed.

## Key File Paths
- API entry: `apps/api/src/index.ts` (PORT 3001)
- App config + routes: `apps/api/src/app.ts`
- DB client: `apps/api/src/db.ts` (Prisma singleton)
- Supabase client: `apps/api/src/supabase.ts`
- OpenAI client: `apps/api/src/openai.ts`
- Services: `apps/api/src/services/`
- Routes: `apps/api/src/routes/`
- Prisma schema: `apps/api/prisma/schema.prisma`
- Vercel config: `vercel.json`
- Financial dashboard JS: `apps/web/js/financials.js`
- Deal page: `apps/web/deal.html` + `apps/web/deal.js`

## Existing Financial Services
- `aiExtractor.ts` — fast top-line extraction (GPT-4o), returns ExtractedDealData with confidence scores
- `financialValidator.ts` — sanity checks (margins, ranges, cross-checks)
- `excelParser.ts` — Excel parsing
- `multiDocAnalyzer.ts` — multi-document conflict resolution
- `excelFinancialExtractor.ts` — Excel → CSV text for GPT-4o classifier

## Auto-Extract on Upload
- `deal.js uploadFile()`: After upload, if file is `.xlsx/.xls/.csv` OR doc type is `FINANCIALS`/`CIM`, auto-calls `handleExtract(doc.id)` after 1.5s delay
- `financials.js handleExtract(documentId?)`: Accepts optional documentId; passes it in POST body

## User Preferences
- Always ask for plan approval before making changes
- Update PROGRESS.md (with timestamp) + commit after completing features
- PROGRESS.md is a detailed changelog/diary — keep ALL previous entries, only append new ones
- Concise communication, no emojis
- Short follow-up questions when clarification needed
- PROGRESS.md format: `## Session N — Month DD, YYYY` + `### Feature — ~HH:MM AM/PM IST`
