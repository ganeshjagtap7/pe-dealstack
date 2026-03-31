# Memo Builder — Full Wiring Design Spec

**Date:** April 1, 2026
**Status:** Draft
**Scope:** Wire up the memo builder end-to-end: auto-generate sections from deal data, AI chat that updates sections, rich Chart.js charts, hybrid confirm/auto-apply UX.

---

## 1. Problem Statement

The memo builder UI is polished but sections show demo/placeholder content. The AI chat responds but doesn't modify sections. Charts are static placeholder images. Users need a tool that:

- Creates a real, PE gold-standard Investment Committee memo from deal data
- Lets them refine sections via AI chat (rewrite tone, add analysis, insert tables/charts)
- Produces export-ready PDF memos with live charts and data tables

## 2. Architecture

Two AI systems working together:

### 2.1 Memo Generation Pipeline (Orchestrated)

Deterministic pipeline for initial memo creation and full regeneration. No agent loop — purpose-built for speed and reliability.

```
createMemo(dealId, templateId?)
  → buildMemoContext(dealId)           // gather all deal data
  → getSectionsForTemplate(templateId) // which sections to generate
  → Promise.all(sections.map(s =>      // parallel generation
      generateSection(s.type, context)
    ))
  → save all sections to DB
  → return complete memo
```

**Cost:** ~$0.02-0.04 per section, ~$0.25-0.50 for full 12-section memo.

### 2.2 Memo Chat Agent (ReAct)

LangGraph ReAct agent for conversational section editing. Has tools to read/write sections, generate charts, search documents.

**Hybrid confirm/auto-apply rules:**
- **Auto-apply:** Rewrites (tone, formatting, conciseness), minor text edits
- **Confirm first:** New content additions, table/chart insertions, full section replacements, new sections
- **Always confirm:** Destructive changes (delete content, major structural rewrites)

## 3. Data Gathering Layer

### 3.1 `buildMemoContext(dealId, orgId)`

Shared function used by both pipeline and chat agent. Lives at `services/agents/memoAgent/context.ts`.

```typescript
interface MemoContext {
  deal: {
    name, stage, industry, revenue, ebitda, dealSize,
    irrProjected, mom, description, source, status
  };
  company: { name, description, industry, location };
  financials: {
    statements: FinancialStatement[];  // all types, all periods
    metrics: { revenue, ebitda, margins, growth };
  };
  documents: {
    chunks: string[];     // top 20 RAG chunks (or extractedText fallback)
    docNames: string[];   // source document names for citations
  };
  activity: Activity[];   // last 10 deal activities
  team: { leadPartner?, analyst? };
}
```

**Graceful degradation:**
- Full CIM + financials → rich, detailed memo with specific numbers and citations
- Financials only → data-driven memo, lighter on qualitative analysis
- Metadata only → framework memo with placeholders marked "[Data needed: ...]"
- Each section prompt receives a `dataAvailability` flag so the AI knows what's reliable vs inferred

### 3.2 Data Sources

| Source | Query | Fallback |
|--------|-------|----------|
| Deal metadata | `Deal` + `Company` join | Required (fail if missing) |
| Financial statements | `FinancialStatement` where dealId, all types | Skip financial sections if none |
| Documents (RAG) | `searchDocumentChunks(query, dealId, 20)` | Fall back to `Document.extractedText` substring |
| Documents (no RAG) | `Document.extractedText` keyword search | Empty context |
| Activity | `Activity` where dealId, limit 10 | Empty array |
| Team | `DealTeamMember` with `User` join | null |

## 4. Section Templates

### 4.1 Default Comprehensive IC Memo (12 sections)

| # | Section Type | Title | Key Content | Primary Data |
|---|-------------|-------|-------------|--------------|
| 1 | EXECUTIVE_SUMMARY | Executive Summary | Deal thesis, key metrics, investment ask, recommendation | All (synthesized) |
| 2 | COMPANY_OVERVIEW | Company Overview | Business description, history, products/services, HQ, employees | Documents + deal metadata |
| 3 | FINANCIAL_PERFORMANCE | Financial Performance | Revenue/EBITDA/margin table (3-5yr), growth trends, narrative | FinancialStatements |
| 4 | QUALITY_OF_EARNINGS | Quality of Earnings | Adjusted EBITDA, one-time items, normalization adjustments | FinancialStatements + docs |
| 5 | MARKET_DYNAMICS | Market Dynamics | TAM/SAM, market growth rate, tailwinds/headwinds | Documents |
| 6 | COMPETITIVE_LANDSCAPE | Competitive Landscape | Key competitors, market share, differentiation, moats | Documents |
| 7 | MANAGEMENT_ASSESSMENT | Management Assessment | Team bios, strengths, gaps, key person risk, retention plan | Documents |
| 8 | OPERATIONAL_DEEP_DIVE | Operational Deep Dive | Unit economics, customer concentration, churn, ops KPIs | Documents + financials |
| 9 | RISK_ASSESSMENT | Risk Assessment | Key risks table (risk, severity, likelihood, mitigation) | All (synthesized) |
| 10 | VALUE_CREATION_PLAN | Value Creation Plan | 100-day plan, growth levers, margin improvement, bolt-ons | Documents + financials |
| 11 | DEAL_STRUCTURE | Deal Structure | EV, sources & uses table, debt/equity split, key terms | Deal metadata |
| 12 | EXIT_ANALYSIS | Exit Analysis | IRR sensitivity table (base/bull/bear), exit multiples, MoM, timeline | Deal metadata + financials |

### 4.2 Other Templates (pre-built)

| Template | Sections | Use Case |
|----------|----------|----------|
| **Standard IC Memo** | 1-3, 5, 9, 11 (6 sections) | Quick decision memos |
| **Search Fund Thesis** | 1-2, 3, 5-7, 9-10, 12 (9 sections) | Search fund acquisitions |
| **Deal Screening Note** | 1-3, 5, 9 (5 sections) | Initial deal evaluation |
| **Comprehensive IC Memo** | All 12 sections | Full committee package |

Users can always add/remove/reorder sections regardless of template.

### 4.3 Section Generation Prompts

Each section type has a dedicated prompt that:
1. Specifies the expected output structure (narrative + optional table/chart)
2. Lists which context data to use
3. Includes PE-specific formatting instructions ($ in millions, percentages to 1 decimal, fiscal year labels)
4. Tells the AI what to do when data is missing (state "Data not available" not hallucinate)
5. Requests citations where applicable (`[Source: Document Name, p.X]`)

Prompts stored as constants in `services/agents/memoAgent/prompts.ts`.

## 5. Chart System

### 5.1 Chart Types

| Chart Type | Sections Used In | Chart.js Type |
|-----------|-----------------|---------------|
| Revenue/EBITDA waterfall | Financial Performance, QoE | `bar` (stacked, custom colors) |
| Multi-year bar + line | Financial Performance | `bar` + `line` (dual axis) |
| Stacked bar | Revenue by segment, Sources & Uses | `bar` (stacked) |
| Horizontal bar | Comparable companies, Multiples | `bar` (horizontal) |
| Sensitivity heatmap | Exit Analysis, IRR scenarios | HTML table with color gradient |
| Pie/donut | Customer concentration, Revenue mix | `doughnut` |
| Line | Margin trends, Growth trajectory | `line` |

### 5.2 Chart Config Schema

```typescript
interface ChartConfig {
  type: 'bar' | 'line' | 'doughnut' | 'scatter' | 'heatmap';
  title: string;
  subtitle?: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
      type?: string;  // for mixed charts (bar + line)
      yAxisID?: string;
    }>;
  };
  options?: {
    dualAxis?: boolean;
    stacked?: boolean;
    horizontal?: boolean;
    format?: 'currency' | 'percentage' | 'multiple' | 'number';
    footnote?: string;
  };
}
```

### 5.3 Chart Rendering

- Frontend renders `chartConfig` with Chart.js in a `<canvas>` element inside the section
- Banker blue palette: `#003366`, `#004488`, `#0066AA`, `#3399CC`, `#66BBDD`, accent `#E8B931`
- Responsive: charts resize with the document panel
- PDF export: `canvas.toDataURL('image/png')` converts to static image for html2pdf.js
- Each chart has a caption (e.g., "Figure 1.2: Revenue Growth Trend") and optional footnote

### 5.4 AI Chart Generation

The AI returns `chartConfig` JSON as part of section generation. The section prompt for financial sections instructs GPT-4o to return:

```json
{
  "content": "Narrative text...",
  "tableData": { ... },
  "chartConfig": { "type": "bar", "title": "...", "data": { ... } }
}
```

The chat agent's `generate_chart` tool can also produce standalone charts on demand (e.g., "Add a waterfall chart for EBITDA bridge").

## 6. Memo Chat Agent

### 6.1 Agent Architecture

```
services/agents/memoAgent/
  ├── index.ts          // runMemoChatAgent() entry point
  ├── context.ts        // buildMemoContext()
  ├── tools.ts          // closure-bound tools
  ├── prompts.ts        // section generation prompts + system prompt
  └── pipeline.ts       // generateAllSections(), generateSection()
```

### 6.2 Agent Tools

All tools closure-bound with `memoId`, `dealId`, `orgId` (same pattern as dealChatAgent).

| Tool | Description | Returns |
|------|------------|---------|
| `get_memo_sections` | Read all current memo sections (titles + content summaries) | Section list |
| `get_active_section` | Read full content of the currently selected section | Section content + tableData + chartConfig |
| `get_deal_financials` | Fetch financial statements for the deal | Formatted financial data |
| `search_documents` | RAG search deal documents | Relevant text chunks with source names |
| `rewrite_section` | Rewrite section content (tone, style, conciseness) | `{ action: 'applied', sectionId, content }` |
| `add_to_section` | Add new paragraph/analysis to existing section | `{ action: 'confirm', sectionId, preview, insertPosition }` |
| `replace_section` | Full section content replacement | `{ action: 'confirm', sectionId, preview }` |
| `generate_table` | Create a structured data table | `{ action: 'confirm', sectionId, tableData, preview }` |
| `generate_chart` | Create a Chart.js chart config | `{ action: 'confirm', sectionId, chartConfig, preview }` |
| `add_section` | Add a new section to the memo | `{ action: 'confirm', sectionType, title, preview }` — on confirm, calls `POST /memos/:id/sections` |

### 6.3 System Prompt

```
You are a PE investment analyst AI embedded in an IC memo editor.
You help write, refine, and improve investment committee memos.

CONTEXT:
- You have access to the memo's sections, deal financials, and uploaded documents
- The user has selected a specific section (the "active section") — edits default to this section
- Use professional PE terminology and formatting

RULES:
- For tone/style rewrites: use rewrite_section (auto-applies)
- For new content, tables, charts: use the appropriate tool (will ask user to confirm)
- Always cite sources when referencing document data: [Source: Document Name]
- Financial figures in $M unless stated otherwise
- Never hallucinate numbers — if data isn't available, say so
- When generating tables, use structured tableData format
- When generating charts, use chartConfig format with banker blue palette
```

### 6.4 Chat Response Format

```typescript
interface MemoChatResponse {
  message: string;           // AI's text response
  action?: 'applied' | 'confirm' | 'info';
  sectionId?: string;        // which section was affected
  preview?: string;          // content preview (for confirm actions)
  tableData?: TableData;     // if table was generated
  chartConfig?: ChartConfig; // if chart was generated
  insertPosition?: 'append' | 'prepend' | 'replace';
}
```

## 7. API Changes

### 7.1 Enhanced Endpoints

**`POST /api/memos`** — Enhanced
- New body field: `autoGenerate: boolean` (default true when `dealId` provided)
- When `autoGenerate: true`: runs generation pipeline, returns memo with all sections populated
- Response includes a `generationStatus` field: `{ completed: number, total: number, errors: string[] }`

**`POST /api/memos/:id/sections/:sectionId/generate`** — Enhanced
- Uses `buildMemoContext()` for rich context (currently uses minimal context)
- Returns `{ content, tableData?, chartConfig? }` (currently returns content only)

**`POST /api/memos/:id/chat`** — Enhanced
- Switches from raw GPT-4o call to ReAct agent with tools
- Accepts `activeSectionId` in request body
- Returns `MemoChatResponse` (structured with action/preview/tableData/chartConfig)

### 7.2 New Endpoints

**`POST /api/memos/:id/generate-all`**
- Regenerates all sections for an existing memo
- Useful for "regenerate entire memo" action
- Returns streaming progress or polling-based status

**`POST /api/memos/:id/sections/:sectionId/apply`**
- Applies a confirmed chat action to a section
- Body: `{ content?, tableData?, chartConfig?, insertPosition? }`
- Called by frontend when user clicks "Apply" on a confirm action

## 8. Frontend Changes

### 8.1 Auto-Generate on Create

When navigating to `memo-builder.html?dealId=xxx&new=true`:

1. Call `POST /api/memos` with `{ dealId, autoGenerate: true, templateId? }`
2. Show loading overlay: "Generating Investment Committee Memo..."
3. Progress bar showing sections completing (poll or SSE)
4. Each section renders as it completes (progressive loading)
5. Once done, full memo is interactive

### 8.2 Chat → Section Updates

Wire up `MemoChatResponse.action` handling in `memo-chat.js`:

- `action: 'applied'` → update section in `state.memo.sections`, re-render section, show toast "Section updated" with Undo button (keeps previous content 30 seconds)
- `action: 'confirm'` → render preview in chat bubble with "Apply" / "Discard" buttons. "Apply" calls `POST /memos/:id/sections/:sectionId/apply`, updates state, re-renders.
- `action: 'info'` → just show the message (no section changes)

### 8.3 Active Section Tracking

- Clicking a section in sidebar or scrolling to a section sets `state.activeSectionId`
- Pass `activeSectionId` in every chat API call
- Prompt chips update dynamically based on active section type
- Chat input placeholder: "Ask about Financial Performance..." (reflects active section)

### 8.4 Chart Rendering

New function `renderChart(containerId, chartConfig)` in `memo-sections.js`:
- Creates `<canvas>` element in the section
- Instantiates Chart.js with config + banker blue theme defaults
- Adds caption and footnote below chart
- Stores Chart instance for cleanup/resize

### 8.5 Undo System

Simple in-memory undo (no persistence needed):
- Before any auto-applied change, save `{ sectionId, previousContent, previousTableData, previousChartConfig }` to `state.undoStack`
- Toast shows "Section updated — Undo" for 30 seconds
- Undo restores previous state and calls `PATCH /sections/:sectionId`
- Stack depth: 5 (oldest dropped when full)

## 9. File Structure

### New Files

```
apps/api/src/services/agents/memoAgent/
  ├── index.ts          // runMemoChatAgent()
  ├── context.ts        // buildMemoContext()
  ├── tools.ts          // 10 closure-bound tools
  ├── prompts.ts        // section prompts + system prompt
  └── pipeline.ts       // generateAllSections(), generateSection()
```

### Modified Files

```
apps/api/src/routes/memos.ts          // enhanced POST with autoGenerate
apps/api/src/routes/memos-chat.ts     // ReAct agent + structured responses
apps/api/src/routes/memos-sections.ts // new /apply endpoint
apps/web/memo-builder.js              // auto-generate flow, active section tracking
apps/web/memo-api.js                  // new API calls, structured response handling
apps/web/memo-chat.js                 // confirm/apply UX, undo toasts
apps/web/memo-sections.js             // Chart.js rendering, live chart updates
apps/web/memo-editor.js               // chart resize handling in PDF export
```

## 10. Success Criteria

1. Creating a memo for a deal with CIM + financials produces a complete, PE-quality IC memo with real data, tables, and charts
2. Creating a memo for a deal with only metadata produces a useful framework memo with clear "[Data needed]" markers
3. AI chat can rewrite section tone (auto-applies)
4. AI chat can add EBITDA bridge / comps table / charts (asks confirmation, then applies)
5. All charts render with Chart.js (banker blue palette) and export correctly to PDF
6. Section drag-drop reordering persists to DB
7. Zero TS errors, no regressions to existing features

## 11. Out of Scope

- Share/collaborate UI
- Version history
- Real file attachments in chat
- Memo list/discovery page
- Streaming/SSE for generation progress (use polling)
- Chart editing UI (charts are generated by AI, not manually editable)
