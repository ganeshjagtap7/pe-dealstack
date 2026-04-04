# Real Investment Memo Builder — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Goal:** Connect the existing memo builder UI to real deal data, replacing the hardcoded "Project Apollo" demo.

## Problem

The "Open Memo Builder" button on deal pages passes `?id=${dealId}` but the memo builder expects `?dealId=${dealId}`. This causes the builder to attempt loading the deal ID as a memo ID, fail with 404, and fall back to hardcoded demo data ("Project Apollo"). Users see fake data and lose trust in the product.

## What Exists (Keep)

The memo builder is ~85% production-ready:

- **Frontend UI**: memo-builder.html, memo-builder.js, memo-api.js, memo-chat.js, memo-sections.js, memo-editor.js — all real, well-structured
- **Backend API**: memos.ts, memos-sections.ts, memos-chat.ts — full CRUD, org-scoped
- **LangGraph Agent**: memoAgent/ with 7 tools (get_memo_sections, get_active_section, get_deal_financials, search_documents, edit_section, insert_chart, insert_table)
- **Database Schema**: Memo, MemoSection, MemoConversation, MemoChatMessage tables (memo-schema.sql)

## Changes Required

### 1. Fix URL Parameter (analysis.js)

**Current:** `<a href="/memo-builder.html?id=${dealId}">`
**Fix:** `<a href="/memo-builder.html?dealId=${dealId}">`

### 2. Fix Initialization Logic (memo-builder.js)

Replace the current init that falls back to demo data:

```
URL params: ?dealId=X
  → GET /api/memos?dealId=X
  → If memos found: show memo picker (if multiple) or open directly (if one)
  → If no memos: POST /api/memos { dealId, autoGenerate: true }
  → Load memo into editor

URL params: ?id=X (memo ID)
  → GET /api/memos/X
  → Load memo into editor

URL params: none or ?demo=true
  → Load demo data (only for demo mode)
```

Never fall back to demo data on API errors. Show proper error states instead.

### 3. Remove Demo Data Default (memo-builder.js)

- Remove `DEMO_MEMO` constant (or keep only behind `?demo=true` flag)
- Remove fake collaborators (Sarah Chen, Michael Torres) — already done
- Remove hardcoded demo chat messages
- Show loading spinner while memo loads/generates
- Show error state if API fails (with retry button)

### 4. Memo List View (memo-builder.js)

When a deal has multiple memos, show a selection modal:
- List existing memos with title, type, status, last edited date
- "Create New Memo" button
- Auto-dismiss if only one memo exists

### 5. Database Migration

Add `organizationId` to Memo table (required for org-scoping to work):

```sql
ALTER TABLE "Memo" ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES "Organization"(id);
CREATE INDEX IF NOT EXISTS idx_memo_org ON "Memo"("organizationId");
```

### 6. Fix Broken Images (memo-sections.js)

Remove/fix broken image references like "Figure 1.2: Quarterly Revenue Growth" that reference non-existent images. Charts should be rendered via Chart.js (which the agent's `insert_chart` tool already supports), not static image tags.

### 7. Chat Integration

The chat already works with the LangGraph agent. Ensure:
- `search_documents` tool uses VDR document chunks for RAG
- `get_deal_financials` pulls all extracted financial statements
- `edit_section` applies changes and re-renders the section
- `insert_chart` renders via Chart.js in the document
- `insert_table` renders structured financial tables
- Fallback: if LLM unavailable, show clear "AI Offline" message (no simulated responses)

### 8. Auto-Generation Flow

When creating a new memo with `autoGenerate: true`:
1. Show loading state: "Generating memo from deal data..."
2. Backend fetches deal financials + documents
3. GPT-4o generates content for each section type (Executive Summary, Financial Performance, Market Dynamics, Risk Assessment, Deal Structure)
4. Frontend polls or waits for completion
5. Sections render progressively as they complete

### 9. Header Updates

- Project name: use `deal.name` instead of "Project Apollo"
- Status badge: real memo status (DRAFT/REVIEW/FINAL)
- Last edited: real timestamp from memo.updatedAt
- Breadcrumb: Dashboard > Deals > {Deal Name} > Memo

### 10. Proactive AI Chat

After memo generation completes, the AI analyst should automatically assess data completeness and proactively message the user about gaps. Flow:

1. After sections are generated, AI reviews what data was available vs missing
2. Posts a proactive welcome message like:
   - "I've generated your memo for {Deal Name} using {N} financial periods and {M} documents."
   - "Missing data that would strengthen the memo:" followed by a bulleted list (e.g., "Management projections — needed for Deal Structure section", "Comparable transactions — needed for valuation analysis")
   - "Would you like me to proceed with what we have, or do you want to upload more documents first?"
3. If key fields are empty on the deal (industry, dealSize, revenue), prompt: "I noticed the deal is missing {field}. Can you provide it?"
4. Prompt chips update dynamically based on what's missing

This makes the AI a helpful analyst, not just a command executor.

## Out of Scope (Future)

- PDF export implementation (button exists, library loaded — wire up later)
- Share functionality (stub alert is fine for now)
- Document citation linking (stub modal is fine)
- Compliance checking (UI-only is fine)
- Real-time collaboration

## Files Modified

| File | Change |
|------|--------|
| `apps/web/js/analysis.js` | Fix URL: `?id=` → `?dealId=` |
| `apps/web/memo-builder.js` | Remove demo default, add smart routing, memo picker |
| `apps/web/memo-chat.js` | Remove simulated AI fallback responses |
| `apps/web/memo-sections.js` | Fix broken image refs, use Chart.js only |
| `apps/api/memo-org-migration.sql` | Add organizationId column + index |

## Success Criteria

1. Clicking "Open Memo Builder" from a deal creates/opens a real memo with that deal's data
2. AI-generated sections contain actual financial data from the deal
3. Chat can answer questions using deal financials and VDR documents
4. No fake "Project Apollo" data visible in normal usage
5. Multiple memos per deal supported via memo list
6. Broken images replaced with Chart.js rendered charts or removed
