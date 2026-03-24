# PE OS — Gemini Embedding 2 Integration Roadmap

**Date:** March 18, 2026
**Author:** Ganesh + Claude (Session 42)
**Status:** Planning
**Priority:** High — Core AI Infrastructure Upgrade

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Gemini Embedding 2 — What's New](#3-gemini-embedding-2--whats-new)
4. [Phase 1: Core Model Upgrade](#4-phase-1-core-model-upgrade--better-rag-accuracy)
5. [Phase 2: Enhanced Deal Chat Intelligence](#5-phase-2-enhanced-deal-chat-intelligence)
6. [Phase 3: Cross-Deal Portfolio Search](#6-phase-3-cross-deal-portfolio-search)
7. [Phase 4: Semantic Red Flag Auto-Detection](#7-phase-4-semantic-red-flag-auto-detection)
8. [Phase 5: Smart Document Classification](#8-phase-5-smart-document-classification)
9. [Phase 6: Document Similarity & Deduplication](#9-phase-6-document-similarity--deduplication)
10. [Phase 7: Multimodal Search (Charts, Images, Scans)](#10-phase-7-multimodal-search-charts-images-scans)
11. [Phase 8: Deal Similarity & Comp Matching](#11-phase-8-deal-similarity--comp-matching)
12. [Phase 9: Audio Transcript Search (Future)](#12-phase-9-audio-transcript-search-future)
13. [Database Migration Plan](#13-database-migration-plan)
14. [Gradual Re-Embedding Strategy](#14-gradual-re-embedding-strategy)
15. [Risk Assessment & Rollback Plan](#15-risk-assessment--rollback-plan)
16. [Implementation Timeline](#16-implementation-timeline)
17. [Success Metrics](#17-success-metrics)

---

## 1. Executive Summary

PE OS currently uses Google's `text-embedding-004` (768 dimensions, text-only) for its RAG pipeline — powering deal chat document search and meeting prep. Google has launched **Gemini Embedding 2** (`gemini-embedding-2-preview`), a next-generation embedding model with significantly improved capabilities.

**Why upgrade now:**
- 2x higher dimensional embeddings (1536 vs 768) = more accurate financial document search
- 8 task-specific embedding types = optimized vectors for search, indexing, QA, classification, fact verification
- Multimodal support (text + images + PDFs + audio + video) = search inside charts and scanned documents
- Matryoshka MRL = flexible dimension sizing for cost/accuracy tradeoffs
- 100+ language support = international deal documents

**This roadmap outlines 9 phases**, starting with the core model upgrade (immediate) and building toward advanced features like multimodal search and deal similarity matching.

---

## 2. Current State Analysis

### 2.1 Current Embedding Architecture

| Component | Current Implementation |
|---|---|
| **Model** | `text-embedding-004` via `@langchain/google-genai` |
| **Dimensions** | 768 (fixed) |
| **Task types** | None (generic embeddings) |
| **Modalities** | Text only |
| **Core file** | `apps/api/src/rag.ts` |
| **Storage** | Supabase PostgreSQL — `DocumentChunk` table, embedding as TEXT (JSON array) |
| **Search** | Supabase RPC `search_document_chunks` — cosine similarity |
| **Chunking** | 500 tokens max, 50-token overlap, sentence-aware splitting |

### 2.2 Current RAG Consumers

| Feature | File | How It Uses RAG |
|---|---|---|
| **Deal Chat Agent** | `apps/api/src/services/agents/dealChatAgent/tools.ts` | `searchDocumentChunks(query, dealId, 8, 0.4)` — returns top 8 chunks for LLM context |
| **Meeting Prep** | `apps/api/src/services/agents/meetingPrep/index.ts` | `searchDocumentChunks(topic, dealId, 5, 0.4)` — finds relevant doc sections for meeting brief |
| **Document Ingestion** | `apps/api/src/routes/ingest-upload.ts` (+ text, url, email) | `embedDocument(docId, dealId, text)` — background embedding after upload |

### 2.3 Current Limitations

1. **Generic embeddings** — No differentiation between "this is a document being indexed" vs "this is a search query" vs "this is a question". All get the same treatment.
2. **768 dimensions** — Financial terms like "EBITDA margin" and "gross margin" are semantically very close but functionally different. 768 dims can't capture these nuances well.
3. **Text-only** — Charts, graphs, scanned PDFs, and images in CIMs are invisible to search. Only extracted text is embedded.
4. **No cross-deal search** — Every search is scoped to a single `dealId`. No portfolio-wide document intelligence.
5. **No proactive analysis** — Embeddings are only used reactively (user asks a question). No automatic scanning for risks or patterns.

---

## 3. Gemini Embedding 2 — What's New

### 3.1 Model Specifications

| Feature | text-embedding-004 (Current) | gemini-embedding-2-preview (New) |
|---|---|---|
| **Dimensions** | 768 (fixed) | 128 — 3,072 (Matryoshka MRL) |
| **Default dimensions** | 768 | 3,072 |
| **Recommended dims** | N/A | 768, 1,536, or 3,072 |
| **Task types** | None | 8 specialized types |
| **Modalities** | Text only | Text + Images + Audio + Video + PDFs |
| **Input limit** | ~8K tokens | 8,192 tokens |
| **Languages** | Limited | 100+ |
| **Batch API** | N/A | 50% cheaper for bulk operations |

### 3.2 Task Types Available

| Task Type | Best Used For | PE OS Application |
|---|---|---|
| `RETRIEVAL_DOCUMENT` | Indexing documents for later search | Embedding CIM chunks, financial models, DD reports |
| `RETRIEVAL_QUERY` | Search queries | Deal chat questions, meeting prep topic search |
| `QUESTION_ANSWERING` | Finding docs that answer a question | "What's the customer concentration?" type queries |
| `FACT_VERIFICATION` | Finding evidence for/against claims | Red flag detection, cross-doc verification |
| `CLASSIFICATION` | Categorizing text by labels | Auto-classify uploaded documents (CIM, Model, Legal, etc.) |
| `CLUSTERING` | Grouping similar texts | Deal similarity, document deduplication |
| `SEMANTIC_SIMILARITY` | Comparing text similarity | Finding duplicate documents, version detection |
| `CODE_RETRIEVAL_QUERY` | Code search | Not applicable to PE OS |

### 3.3 Matryoshka MRL (Matryoshka Representation Learning)

Matryoshka embeddings are "nested" — the first N dimensions of a 3072-dim vector are a valid N-dimensional embedding. This means:
- **768 dims**: Good for storage-efficient, fast search (same as current)
- **1,536 dims**: 2x accuracy improvement over current, good balance (recommended)
- **3,072 dims**: Maximum precision for critical comparisons

**Important:** Dimensions below 3,072 require L2 normalization before storage and comparison.

### 3.4 Multimodal Input Constraints

| Modality | Limits |
|---|---|
| Text | Up to 8,192 tokens |
| Images | Max 6 per request; PNG/JPEG |
| Audio | Max 80 seconds; MP3/WAV |
| Video | Max 128 seconds; MP4/MOV |
| PDFs | Max 6 pages per request |

---

## 4. Phase 1: Core Model Upgrade — Better RAG Accuracy

**Priority:** IMMEDIATE
**Effort:** 4-6 hours
**Impact:** HIGH — All existing RAG features get better

### 4.1 Upgrade Embedding Model

- 4.1.1 Replace `text-embedding-004` with `gemini-embedding-2-preview` in `rag.ts`
- 4.1.2 Set output dimensions to 1,536 (2x current accuracy, reasonable storage)
- 4.1.3 Add L2 normalization function (required for dims < 3,072)
- 4.1.4 Verify `@langchain/google-genai` v2.1.24 supports the new model name and `taskType` parameter

### 4.2 Add Task-Specific Embedding Types

- 4.2.1 Create `getDocEmbeddingModel()` — singleton with `taskType: 'RETRIEVAL_DOCUMENT'` for indexing
- 4.2.2 Create `getQueryEmbeddingModel()` — singleton with `taskType: 'RETRIEVAL_QUERY'` for search
- 4.2.3 Create `getLegacyEmbeddingModel()` — v1 `text-embedding-004` for searching old chunks during migration
- 4.2.4 Update `embedDocument()` to use doc embedding model + L2 normalize + store model metadata
- 4.2.5 Update `searchDocumentChunks()` to use query embedding model

### 4.3 Dual-Search Strategy (Migration Period)

Old (768-dim) and new (1536-dim) embeddings are **incompatible** — cannot compare vectors from different models. During the gradual migration:

- 4.3.1 New uploads embed with v2 model immediately
- 4.3.2 Search queries embed with both v1 and v2 models
- 4.3.3 Search v2 chunks first (filtered by `embeddingModel` column)
- 4.3.4 Check if any v1 chunks remain for the deal (fast `head: true` count)
- 4.3.5 If v1 chunks exist, also search with v1 query embedding
- 4.3.6 Merge results by similarity score, deduplicate by chunk ID, return top N
- 4.3.7 Post-migration: v1 count returns 0, v1 path never executes (zero overhead)

### 4.4 Configurable Thresholds

- 4.4.1 Add `RAG_SEARCH_THRESHOLD` env variable (default 0.45, down from current 0.5)
- 4.4.2 Embedding 2 produces different similarity score distributions — start lower, tune empirically
- 4.4.3 Add `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` env variables for flexibility

### 4.5 Files to Modify

| File | Changes |
|---|---|
| `apps/api/src/rag.ts` | Model upgrade, dual singletons, L2 normalization, dual search, metadata |
| `apps/api/.env.example` | Add `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `RAG_SEARCH_THRESHOLD` |
| `apps/api/src/services/llm.ts` | Update embedding provider comment |

### 4.6 Verification

- [ ] Upload a new document → check `DocumentChunk.embeddingModel = 'gemini-embedding-2-preview'`
- [ ] Deal chat search returns results with mixed old/new chunks
- [ ] TypeScript build passes (`npx tsc --noEmit`)
- [ ] Same deal chat query returns more relevant results than before

---

## 5. Phase 2: Enhanced Deal Chat Intelligence

**Priority:** HIGH
**Effort:** 2-3 hours
**Impact:** HIGH — Users get noticeably better answers
**Depends on:** Phase 1

### 5.1 Question-Answering Task Type for Deal Chat

- 5.1.1 Add optional `taskType` parameter to `searchDocumentChunks()` function
- 5.1.2 Deal chat agent passes `taskType: 'QUESTION_ANSWERING'` instead of default `RETRIEVAL_QUERY`
- 5.1.3 `QUESTION_ANSWERING` is optimized for finding documents that answer a specific question (vs generic retrieval)
- 5.1.4 Create `getQAEmbeddingModel()` singleton with `taskType: 'QUESTION_ANSWERING'`

### 5.2 Improved Chunk Strategy for Financial Docs

- 5.2.1 Increase default chunk size from 500 to 1,000 tokens (Embedding 2 supports 8,192 token input)
- 5.2.2 Increase overlap from 50 to 100 tokens for better context continuity
- 5.2.3 Larger chunks = each chunk contains more complete financial context (full paragraphs about EBITDA, revenue, etc.)
- 5.2.4 Fewer total chunks per document = less storage, faster search

### 5.3 Context-Aware RAG Building

- 5.3.1 Update `buildRAGContext()` to include similarity scores in context for LLM
- 5.3.2 Add chunk position metadata (beginning/middle/end of document) for better LLM reasoning
- 5.3.3 Prioritize high-similarity chunks in context ordering

### 5.4 Files to Modify

| File | Changes |
|---|---|
| `apps/api/src/rag.ts` | `taskType` param on `searchDocumentChunks()`, chunk size increase |
| `apps/api/src/services/agents/dealChatAgent/tools.ts` | Pass `taskType: 'QUESTION_ANSWERING'` |

### 5.5 Verification

- [ ] Deal chat: "What is the EBITDA margin?" returns specific financial section (not vague paragraphs)
- [ ] Deal chat: "What are the key risks?" returns risk sections from CIM
- [ ] Compare accuracy on 3-5 known queries before/after upgrade

---

## 6. Phase 3: Cross-Deal Portfolio Search

**Priority:** HIGH
**Effort:** 4-5 hours
**Impact:** VERY HIGH — New feature for PE firms, major differentiator
**Depends on:** Phase 1

### 6.1 Portfolio-Wide Document Search API

- 6.1.1 New endpoint: `GET /api/portfolio/search?q=<query>&limit=20`
- 6.1.2 Search across ALL deals' document chunks (not scoped to single dealId)
- 6.1.3 Filter by organization (org-scoped, no cross-org leakage)
- 6.1.4 Return results grouped by deal with deal metadata (name, stage, industry)
- 6.1.5 Add new Supabase RPC `search_all_document_chunks` without `filter_deal_id`

### 6.2 Search Filters & Facets

- 6.2.1 Filter by deal stage (Pipeline, DD, IC Review, etc.)
- 6.2.2 Filter by industry
- 6.2.3 Filter by date range (documents uploaded within X days)
- 6.2.4 Filter by document type (CIM, Financial Model, Legal DD, etc.)

### 6.3 Use Cases for PE Firms

- 6.3.1 "Find all deals mentioning SaaS recurring revenue" — across 50+ deal documents
- 6.3.2 "Show customer concentration risks across portfolio" — proactive risk surfacing
- 6.3.3 "Which deals have management team bios?" — DD completeness check
- 6.3.4 "Find mentions of regulatory changes" — compliance across portfolio

### 6.4 Portfolio Chat Agent Integration

- 6.4.1 Add `search_portfolio_documents` tool to existing Portfolio Chat Agent
- 6.4.2 Agent can now answer questions like "Which of our pipeline deals have the best margins?"
- 6.4.3 Combines structured deal data (from DB) with unstructured document intelligence (from RAG)

### 6.5 Frontend: Portfolio Search UI

- 6.5.1 New search bar on dashboard (or dedicated search page)
- 6.5.2 Results shown as cards with deal name, document name, relevant snippet, similarity score
- 6.5.3 Click result → navigates to deal page with document highlighted
- 6.5.4 Filter chips for stage, industry, document type

### 6.6 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/routes/portfolio-search.ts` | NEW — portfolio search endpoint |
| `apps/api/src/rag.ts` | Add `searchAllDocumentChunks()` function |
| `apps/api/src/routes/ai-portfolio.ts` | Add search tool to Portfolio Chat Agent |
| `apps/web/js/portfolio-search.js` | NEW — frontend search UI |
| `apps/web/dashboard.html` | Add search bar component |

### 6.7 Verification

- [ ] Search "revenue growth" returns results from multiple deals
- [ ] Results are properly org-scoped (no cross-org data)
- [ ] Portfolio chat: "Which deals have EBITDA above $10M?" uses document search + deal data

---

## 7. Phase 4: Semantic Red Flag Auto-Detection

**Priority:** HIGH
**Effort:** 5-6 hours
**Impact:** VERY HIGH — Proactive risk alerting, major PE value-add
**Depends on:** Phase 1

### 7.1 Red Flag Pattern Library

- 7.1.1 Define 30+ red flag patterns as text strings, organized by category:

  **Financial Red Flags:**
  - 7.1.1.1 "Customer concentration exceeding 20% of revenue from single customer"
  - 7.1.1.2 "Declining revenue trend over consecutive periods"
  - 7.1.1.3 "Negative or declining EBITDA margins"
  - 7.1.1.4 "Working capital deficiency or negative working capital"
  - 7.1.1.5 "Significant off-balance sheet liabilities"
  - 7.1.1.6 "Revenue recognition policy changes or aggressive accounting"
  - 7.1.1.7 "Related party transactions"
  - 7.1.1.8 "Material weakness in internal controls"

  **Legal & Compliance Red Flags:**
  - 7.1.1.9 "Pending or threatened litigation"
  - 7.1.1.10 "Regulatory compliance violations or investigations"
  - 7.1.1.11 "Environmental liability or contamination issues"
  - 7.1.1.12 "Intellectual property disputes or infringement claims"
  - 7.1.1.13 "Change of control provisions in key contracts"

  **Operational Red Flags:**
  - 7.1.1.14 "Key person dependency — business relies on founder or single executive"
  - 7.1.1.15 "High employee turnover in management team"
  - 7.1.1.16 "Single supplier dependency for critical inputs"
  - 7.1.1.17 "Technology platform end-of-life or legacy system risk"
  - 7.1.1.18 "Cybersecurity incidents or data breach history"

  **Market Red Flags:**
  - 7.1.1.19 "Declining total addressable market or shrinking industry"
  - 7.1.1.20 "New regulatory framework threatening business model"
  - 7.1.1.21 "Emerging competitive threats from well-funded entrants"
  - 7.1.1.22 "Commodity pricing pressure or margin compression"

### 7.2 Pre-Compute Red Flag Embeddings

- 7.2.1 Embed all 30+ red flag patterns using `FACT_VERIFICATION` task type on startup
- 7.2.2 Cache these embeddings in memory (they never change)
- 7.2.3 Store pattern embeddings in a dedicated `RedFlagPattern` table for persistence

### 7.3 Automatic Scan Pipeline

- 7.3.1 After every document upload + embedding completion → trigger red flag scan
- 7.3.2 Compare each document chunk embedding against all red flag pattern embeddings
- 7.3.3 If similarity > threshold (e.g., 0.7) → create a `DealRedFlag` record
- 7.3.4 Store: dealId, documentId, chunkId, patternId, similarity score, flagged text snippet, severity

### 7.4 Red Flag API Endpoints

- 7.4.1 `GET /api/deals/:dealId/red-flags` — all red flags for a deal
- 7.4.2 `GET /api/portfolio/red-flags` — all red flags across portfolio (dashboard view)
- 7.4.3 `POST /api/deals/:dealId/red-flags/:id/dismiss` — dismiss a false positive
- 7.4.4 `POST /api/deals/:dealId/red-flags/:id/acknowledge` — acknowledge as real risk

### 7.5 Frontend: Red Flag Dashboard Widget

- 7.5.1 Deal page: Red flag alert section with severity badges (Critical / Warning / Info)
- 7.5.2 Dashboard: Portfolio-wide red flag summary card
- 7.5.3 Click a red flag → shows the document section that triggered it
- 7.5.4 Dismiss/acknowledge actions with audit trail

### 7.6 Integration with Existing Red Flag Analysis

- 7.6.1 Current `apps/api/src/services/analysis/redFlags.ts` detects red flags from extracted financials (numbers-based)
- 7.6.2 New semantic red flags complement this — detect risks from document text, not just numbers
- 7.6.3 Merge both sources in the deal page red flags section
- 7.6.4 Label as "Financial Red Flag" vs "Document Red Flag" for clarity

### 7.7 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/services/redFlagScanner.ts` | NEW — pattern library, embedding, scan pipeline |
| `apps/api/src/routes/red-flags.ts` | NEW — CRUD endpoints for red flags |
| `apps/api/src/routes/ingest-upload.ts` | Trigger red flag scan after embedding |
| `apps/web/js/red-flags.js` | NEW — frontend red flag UI components |
| `apps/web/deal.html` | Add red flag alert section |
| `apps/web/dashboard.html` | Add portfolio red flag summary widget |

### 7.8 Verification

- [ ] Upload a CIM mentioning "customer concentration of 40%" → auto-detects red flag
- [ ] Upload a legal DD report mentioning "pending litigation" → auto-detects red flag
- [ ] Dashboard shows aggregated red flags across all deals
- [ ] Dismiss a false positive → it no longer appears in the list

---

## 8. Phase 5: Smart Document Classification

**Priority:** MEDIUM
**Effort:** 3-4 hours
**Impact:** MEDIUM — Better auto-organization in VDR
**Depends on:** Phase 1

### 8.1 Classification via Embedding Similarity

- 8.1.1 Define document category embeddings using `CLASSIFICATION` task type:
  - "Confidential Information Memorandum (CIM) — company overview, investment highlights, financial summary"
  - "Financial Model — projections, assumptions, DCF, LBO model, sensitivity analysis"
  - "Legal Due Diligence Report — corporate structure, contracts, litigation, regulatory"
  - "Management Presentation — pitch deck, business plan, strategy overview"
  - "Quality of Earnings Report — adjusted EBITDA, normalization, accounting analysis"
  - "Data Room Index — document checklist, data room contents list"
  - "Environmental Report — ESG, environmental compliance, sustainability"
  - "Insurance Summary — policy overview, coverage analysis"
  - "Tax Due Diligence — tax structure, returns, exposures"
  - "Commercial Due Diligence — market study, competitive landscape, customer analysis"

- 8.1.2 Pre-compute and cache category embeddings on app startup

### 8.2 Auto-Classify on Upload

- 8.2.1 After document text extraction, embed a representative sample (first 2000 tokens)
- 8.2.2 Compare against all category embeddings using cosine similarity
- 8.2.3 Assign the highest-similarity category if score > 0.6
- 8.2.4 If score < 0.6, mark as "Uncategorized" for manual review
- 8.2.5 Store classification result on Document record: `autoCategory`, `categoryConfidence`

### 8.3 Cost Comparison

| Method | Cost per Document | Speed |
|---|---|---|
| GPT-4o classification (current) | ~$0.01-0.03 | 2-5 seconds |
| Embedding similarity (new) | ~$0.0001 | <100ms |

**100x cheaper and 20-50x faster.**

### 8.4 VDR Auto-Filing

- 8.4.1 Use auto-classification to suggest VDR folder placement
- 8.4.2 Map categories to default VDR folders (Financial → "Financial Information", Legal → "Legal")
- 8.4.3 Show suggestion to user: "This looks like a Quality of Earnings report — file in Financial Information?"
- 8.4.4 User can accept or override

### 8.5 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/services/documentClassifier.ts` | NEW — embedding-based classification |
| `apps/api/src/routes/ingest-upload.ts` | Call classifier after text extraction |
| `apps/web/src/components/FileTable.tsx` | Show auto-classification badge on files |

### 8.6 Verification

- [ ] Upload a CIM → auto-classified as "CIM" with confidence > 0.7
- [ ] Upload a financial model → auto-classified as "Financial Model"
- [ ] Upload a random non-deal document → classified as "Uncategorized"

---

## 9. Phase 6: Document Similarity & Deduplication

**Priority:** MEDIUM
**Effort:** 3-4 hours
**Impact:** MEDIUM — Prevents duplicates in VDR, detects document versions
**Depends on:** Phase 1

### 9.1 Document-Level Embeddings

- 9.1.1 After chunking and embedding a document, compute a **document-level embedding** by averaging all chunk embeddings
- 9.1.2 Store as `docEmbedding` on the Document record
- 9.1.3 Use `SEMANTIC_SIMILARITY` task type for document-level comparisons

### 9.2 Duplicate Detection

- 9.2.1 After embedding a new document, compare its doc-level embedding against all existing documents in the deal
- 9.2.2 If similarity > 0.85 → flag as potential duplicate
- 9.2.3 If similarity between 0.70-0.85 → flag as potential updated version
- 9.2.4 Show alert to user: "This document is 87% similar to 'CIM_v2.pdf' uploaded on March 5"

### 9.3 Version Tracking

- 9.3.1 When a high-similarity document is uploaded, offer to link as a new version
- 9.3.2 Store `previousVersionId` on Document record
- 9.3.3 VDR shows version chain: v1 → v2 → v3 with dates and who uploaded each

### 9.4 Cross-Deal Similarity (Bonus)

- 9.4.1 Compare doc-level embeddings across deals in the same org
- 9.4.2 Detect when the same CIM or financial model appears in multiple deals
- 9.4.3 Use case: "This CIM was also uploaded to Deal X — are these the same company?"

### 9.5 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/rag.ts` | Add `computeDocEmbedding()`, `findSimilarDocuments()` |
| `apps/api/src/routes/documents-upload.ts` | Trigger similarity check after embedding |
| `apps/web/src/components/FileTable.tsx` | Show duplicate/version alerts |

### 9.6 Verification

- [ ] Upload same PDF twice → flagged as duplicate (>0.85 similarity)
- [ ] Upload slightly modified version → flagged as "updated version" (0.70-0.85)
- [ ] Upload completely different document → no flag

---

## 10. Phase 7: Multimodal Search (Charts, Images, Scans)

**Priority:** MEDIUM-HIGH
**Effort:** 6-8 hours
**Impact:** HIGH — Unlocks search inside visual content
**Depends on:** Phase 1

### 10.1 Image Page Embedding for PDFs

- 10.1.1 When processing a PDF, convert each page to an image (PNG)
- 10.1.2 Embed each page image using Gemini Embedding 2's multimodal input
- 10.1.3 Store image embeddings alongside text chunk embeddings in `DocumentChunk`
- 10.1.4 Add `chunkType` field: 'text' | 'image' | 'page'

### 10.2 Chart & Table Detection

- 10.2.1 During PDF processing, identify pages that are primarily charts/tables/graphs
- 10.2.2 These pages often lose critical information during text extraction
- 10.2.3 Embed the page image directly — the model understands visual financial data
- 10.2.4 Example: Revenue trend bar chart → embedded as image → searchable by "revenue trend"

### 10.3 Scanned CIM Support

- 10.3.1 Many PE CIMs are scanned PDFs (image-based, not text-selectable)
- 10.3.2 Current pipeline: OCR → text extraction → embedding (loses formatting, misreads numbers)
- 10.3.3 New pipeline: Embed page images directly → higher accuracy for scanned docs
- 10.3.4 Fallback: If image embedding fails, fall back to OCR → text embedding

### 10.4 Search Results with Visual Preview

- 10.4.1 When a search result comes from an image chunk, show thumbnail preview
- 10.4.2 User can see the actual chart/table that matched their query
- 10.4.3 Deal chat can reference: "Based on the revenue chart on page 14..."

### 10.5 Multimodal Input Constraints

- 10.5.1 Max 6 images per embedding request → batch processing for multi-page PDFs
- 10.5.2 Images must be PNG/JPEG format
- 10.5.3 Max 6 PDF pages per request → process in batches of 6
- 10.5.4 Rate limiting: respect Gemini API limits (1,500 requests/min)

### 10.6 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/services/multimodalEmbedder.ts` | NEW — page-to-image conversion, image embedding |
| `apps/api/src/rag.ts` | Support `chunkType` in storage and search |
| `apps/api/src/routes/ingest-upload.ts` | Trigger multimodal embedding for PDFs |
| `apps/web/src/components/InsightsPanel.tsx` | Show image previews in search results |

### 10.7 Verification

- [ ] Upload a CIM with charts → chart pages embedded as images
- [ ] Deal chat: "Show me the revenue trend" → returns the chart page
- [ ] Scanned PDF → image embedding works without OCR step

---

## 11. Phase 8: Deal Similarity & Comp Matching

**Priority:** LOW-MEDIUM
**Effort:** 4-5 hours
**Impact:** HIGH — Portfolio intelligence and comp analysis
**Depends on:** Phase 6 (document-level embeddings)

### 11.1 Deal-Level Embedding

- 11.1.1 Compute a **deal-level embedding** by averaging all document embeddings for a deal
- 11.1.2 Use `CLUSTERING` task type for deal-level vectors
- 11.1.3 Store as `dealEmbedding` on the Deal record
- 11.1.4 Update whenever a new document is embedded for the deal

### 11.2 Similar Deal Finder

- 11.2.1 When viewing a deal, show "Similar Deals" section
- 11.2.2 Compare deal embedding against all other deals in the org
- 11.2.3 Return top 5 most similar deals with similarity scores
- 11.2.4 "Similar" = similar business models, industries, financials based on document content

### 11.3 Comp Analysis Support

- 11.3.1 When building a comp set for valuation, suggest deals from portfolio with similar profiles
- 11.3.2 "These 3 deals in your portfolio have similar characteristics — they traded at 8-12x EBITDA"
- 11.3.3 Combines document-based similarity with structured financial data

### 11.4 New Deal Intelligence

- 11.4.1 When a new CIM is uploaded, auto-find similar past deals
- 11.4.2 "You evaluated a similar company (Acme Corp) 6 months ago — here's that deal for reference"
- 11.4.3 Surfaces past learnings and outcomes for comparable deals

### 11.5 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/services/dealSimilarity.ts` | NEW — deal embedding computation, similarity search |
| `apps/api/src/routes/deals.ts` | Add `GET /deals/:id/similar` endpoint |
| `apps/web/deal.js` | Add "Similar Deals" section on deal page |

### 11.6 Verification

- [ ] Two SaaS deals with similar CIMs → appear as "similar" to each other
- [ ] A manufacturing deal → NOT similar to a SaaS deal
- [ ] New CIM upload → surfaces relevant past deals

---

## 12. Phase 9: Audio Transcript Search (Future)

**Priority:** LOW
**Effort:** 6-8 hours
**Impact:** MEDIUM — Meeting intelligence
**Depends on:** Phase 1, Phase 7 (multimodal infrastructure)

### 12.1 Meeting Audio Embedding

- 12.1.1 Upload meeting recordings (MP3/WAV, max 80 seconds per chunk)
- 12.1.2 Split long recordings into 60-second segments with 10-second overlap
- 12.1.3 Embed each audio segment using Gemini Embedding 2's audio modality
- 12.1.4 Store alongside document chunks with `chunkType: 'audio'`

### 12.2 Cross-Modal Meeting Search

- 12.2.1 "What did management say about churn?" → searches meeting audio + CIM text + DD reports
- 12.2.2 Returns both text chunks and audio timestamps
- 12.2.3 Unified embedding space means text and audio results are directly comparable

### 12.3 Meeting Transcript Generation

- 12.3.1 Use Gemini to transcribe audio → store as text alongside audio embedding
- 12.3.2 Both audio embedding (for similarity) and text transcript (for display) available
- 12.3.3 Meeting prep agent can reference past meeting discussions

### 12.4 Files to Create/Modify

| File | Changes |
|---|---|
| `apps/api/src/services/audioEmbedder.ts` | NEW — audio chunking, embedding |
| `apps/api/src/routes/meetings.ts` | NEW — meeting recording upload, search |
| `apps/web/js/meetings.js` | NEW — meeting audio player, transcript view |

### 12.5 Note

This phase is future-looking. The multimodal embedding model supports audio, but the infrastructure for audio upload, storage, and playback needs to be built from scratch. Consider only after Phases 1-7 are complete.

---

## 13. Database Migration Plan

### 13.1 Schema Changes (Run in Supabase)

```sql
-- Phase 1: Core columns
ALTER TABLE "DocumentChunk"
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT DEFAULT 'text-embedding-004',
  ADD COLUMN IF NOT EXISTS "embeddingDimensions" INTEGER DEFAULT 768;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_chunk_embedding_model
  ON "DocumentChunk" ("embeddingModel");

-- Phase 6: Document-level embeddings
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "docEmbedding" TEXT DEFAULT NULL;

-- Phase 7: Multimodal chunk types
ALTER TABLE "DocumentChunk"
  ADD COLUMN IF NOT EXISTS "chunkType" TEXT DEFAULT 'text';

-- Phase 4: Red flag tables
CREATE TABLE IF NOT EXISTS "RedFlagPattern" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  pattern TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  embedding TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DealRedFlag" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId" UUID NOT NULL REFERENCES "Deal"(id),
  "documentId" UUID REFERENCES "Document"(id),
  "chunkId" UUID REFERENCES "DocumentChunk"(id),
  "patternId" UUID REFERENCES "RedFlagPattern"(id),
  similarity FLOAT,
  snippet TEXT,
  severity TEXT DEFAULT 'warning',
  status TEXT DEFAULT 'active',
  "dismissedBy" UUID REFERENCES "User"(id),
  "dismissedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- Phase 8: Deal-level embeddings
ALTER TABLE "Deal"
  ADD COLUMN IF NOT EXISTS "dealEmbedding" TEXT DEFAULT NULL;
```

### 13.2 New Supabase RPC

```sql
-- Phase 1: Model-filtered search
CREATE OR REPLACE FUNCTION search_document_chunks_v2(
  query_embedding TEXT,
  match_threshold FLOAT,
  match_count INT,
  filter_deal_id UUID,
  filter_embedding_model TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  "documentId" UUID,
  "dealId" UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
  -- Same cosine similarity as search_document_chunks
  -- but with: AND ("embeddingModel" = filter_embedding_model OR filter_embedding_model IS NULL)
$$ LANGUAGE sql;

-- Phase 3: Cross-deal search
CREATE OR REPLACE FUNCTION search_all_document_chunks(
  query_embedding TEXT,
  match_threshold FLOAT,
  match_count INT,
  filter_org_id UUID,
  filter_embedding_model TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  "documentId" UUID,
  "dealId" UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB,
  "dealName" TEXT
) AS $$
  -- Cross-deal search scoped to org
$$ LANGUAGE sql;
```

---

## 14. Gradual Re-Embedding Strategy

### 14.1 Migration Service

New file: `apps/api/src/services/embeddingMigration.ts`

```
migrateEmbeddings(options):
  - batchSize: 10 (documents per batch)
  - delayMs: 2000 (rate limit safety between batches)
  - dealId: optional (migrate single deal first)
  - dryRun: optional (count only, don't re-embed)
```

### 14.2 Migration API

```
POST /api/admin/migrate-embeddings
  Auth: ADMIN role required
  Body: { batchSize?, dealId?, dryRun? }
  Returns: { total, migrated, failed, skipped }
```

### 14.3 Migration Sequence

1. Deploy code changes (Phase 1) → new uploads use v2 immediately
2. Migrate one test deal → verify quality improvement
3. Migrate all deals in batches → monitor progress via logs
4. Verify all chunks have `embeddingModel = 'gemini-embedding-2-preview'`
5. Remove v1 search path (Phase 1 cleanup)

### 14.4 Rate Limiting

- Gemini API: ~1,500 requests/minute for most tiers
- Batch size 10 docs x ~10 chunks each = ~100 embedding calls per batch
- 2-second delay between batches = ~50 batches/min = safe margin
- Estimated total migration time: ~5 minutes per 100 documents

---

## 15. Risk Assessment & Rollback Plan

### 15.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@langchain/google-genai` doesn't support new model | Low | High | Use native `@google/generative-ai` SDK directly |
| Embedding 2 preview has quality regressions | Low | Medium | Rollback to v1 model via env var |
| 1536-dim storage doubles DB size | Medium | Low | Monitor Supabase usage; can reduce to 768 if needed |
| API rate limits during migration | Medium | Low | Batch + delay approach handles this |
| Similarity score distributions differ from v1 | High | Medium | Start with lower thresholds, tune empirically |

### 15.2 Rollback Plan

1. **Instant rollback:** Set `EMBEDDING_MODEL=text-embedding-004` and `EMBEDDING_DIMENSIONS=768` in env
2. **Partial rollback:** Dual-search means mixed v1/v2 chunks always work together
3. **Full rollback:** Re-run migration with v1 model to re-embed all documents
4. **No data loss:** Migration always deletes old chunks before inserting new ones for each document

---

## 16. Implementation Timeline

### Recommended Sequence

| Phase | Feature | Effort | Priority | Depends On |
|---|---|---|---|---|
| **Phase 1** | Core Model Upgrade | 4-6 hrs | IMMEDIATE | None |
| **Phase 2** | Enhanced Deal Chat | 2-3 hrs | HIGH | Phase 1 |
| **Phase 3** | Cross-Deal Portfolio Search | 4-5 hrs | HIGH | Phase 1 |
| **Phase 4** | Semantic Red Flag Detection | 5-6 hrs | HIGH | Phase 1 |
| **Phase 5** | Smart Document Classification | 3-4 hrs | MEDIUM | Phase 1 |
| **Phase 6** | Document Similarity & Dedup | 3-4 hrs | MEDIUM | Phase 1 |
| **Phase 7** | Multimodal Search | 6-8 hrs | MEDIUM-HIGH | Phase 1 |
| **Phase 8** | Deal Similarity & Comps | 4-5 hrs | LOW-MEDIUM | Phase 6 |
| **Phase 9** | Audio Transcript Search | 6-8 hrs | LOW | Phase 7 |

### Sprint Breakdown

**Sprint 1 (This Week):** Phase 1 + Phase 2
- Core model upgrade + enhanced deal chat = immediate accuracy improvement

**Sprint 2 (Next Week):** Phase 3 + Phase 4
- Cross-deal search + red flag detection = biggest product differentiators

**Sprint 3:** Phase 5 + Phase 6
- Document classification + similarity = VDR intelligence

**Sprint 4:** Phase 7
- Multimodal search = chart/image search capability

**Future:** Phase 8 + Phase 9
- Deal similarity + audio = advanced portfolio intelligence

---

## 17. Success Metrics

### 17.1 Quantitative Metrics

| Metric | Current Baseline | Target (Post-Upgrade) |
|---|---|---|
| Deal chat relevance (top-3 accuracy) | ~60% | >80% |
| Search latency (p95) | ~500ms | <600ms (slight increase from larger dims) |
| Embedding cost per document | ~$0.001 | ~$0.001 (same tier) |
| Document classification accuracy | N/A (manual) | >85% auto-classification |
| Red flags auto-detected per deal | 0 (manual only) | 5-15 per CIM |
| Cross-deal search availability | No | Yes |

### 17.2 Qualitative Metrics

- Deal team spends less time manually searching through CIMs
- Red flags surface before IC meetings (not during)
- Document organization in VDR happens automatically
- Portfolio-level insights available without manual aggregation
- Founders can demo "AI-powered document intelligence" to investors

---

**End of Roadmap Document**

*This roadmap will be updated as phases are completed and new requirements emerge.*
