# Memo Builder Full Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the memo builder end-to-end: auto-generate PE-quality IC memo sections from deal data, AI chat agent that reads/writes sections with hybrid confirm/auto-apply, and live Chart.js charts.

**Architecture:** Two AI systems — (1) an orchestrated generation pipeline for initial memo creation (parallel section generation via GPT-4o) and (2) a LangGraph ReAct chat agent with 10 closure-bound tools for conversational section editing. Shared `buildMemoContext()` gathers deal metadata, financials, documents, and activity.

**Tech Stack:** Express/TypeScript API, LangGraph ReAct agent, GPT-4o, Chart.js, Supabase PostgreSQL, Vanilla JS frontend.

**Spec:** `docs/superpowers/specs/2026-04-01-memo-builder-wiring-design.md`

---

## File Structure

### New Files (Backend)

| File | Responsibility |
|------|---------------|
| `apps/api/src/services/agents/memoAgent/context.ts` | `buildMemoContext()` — gathers all deal data for memo generation |
| `apps/api/src/services/agents/memoAgent/prompts.ts` | Section-specific generation prompts + system prompt constants |
| `apps/api/src/services/agents/memoAgent/pipeline.ts` | `generateAllSections()`, `generateSection()` — orchestrated pipeline |
| `apps/api/src/services/agents/memoAgent/tools.ts` | 10 closure-bound tools for ReAct chat agent |
| `apps/api/src/services/agents/memoAgent/index.ts` | `runMemoChatAgent()` — ReAct agent entry point |

### Modified Files (Backend)

| File | Changes |
|------|---------|
| `apps/api/src/routes/memos.ts` | Enhance POST to support `autoGenerate: true`, add `POST /:id/generate-all` |
| `apps/api/src/routes/memos-chat.ts` | Replace raw GPT-4o call with ReAct agent, accept `activeSectionId`, return structured `MemoChatResponse` |
| `apps/api/src/routes/memos-sections.ts` | Add `POST /:id/sections/:sectionId/apply` endpoint |

### Modified Files (Frontend)

| File | Changes |
|------|---------|
| `apps/web/memo-builder.js` | Auto-generate flow on create, active section tracking, undo stack |
| `apps/web/memo-api.js` | New API functions: `generateAllSectionsAPI`, `applySectionActionAPI` |
| `apps/web/memo-chat.js` | Handle structured `MemoChatResponse` with confirm/apply/undo UX |
| `apps/web/memo-sections.js` | Chart.js rendering via `renderChart()`, live chart updates |

---

## Phase 1: Memo Context Builder + Section Prompts

### Task 1: Build Memo Context Gatherer

**Files:**
- Create: `apps/api/src/services/agents/memoAgent/context.ts`

- [ ] **Step 1: Create the context.ts file with buildMemoContext()**

```typescript
// apps/api/src/services/agents/memoAgent/context.ts
import { supabase } from '../../../supabase.js';
import { searchDocumentChunks, isRAGEnabled } from '../../../rag.js';
import { log } from '../../../utils/logger.js';

export interface MemoContext {
  deal: {
    id: string;
    name: string;
    stage: string | null;
    industry: string | null;
    revenue: number | null;
    ebitda: number | null;
    dealSize: number | null;
    irrProjected: number | null;
    mom: number | null;
    description: string | null;
    source: string | null;
    status: string | null;
  };
  company: {
    name: string | null;
    description: string | null;
    industry: string | null;
  } | null;
  financials: {
    statements: any[];
    hasIncomeStatement: boolean;
    hasBalanceSheet: boolean;
    hasCashFlow: boolean;
  };
  documents: {
    chunks: string[];
    docNames: string[];
  };
  activity: any[];
  team: {
    leadPartner: string | null;
    analyst: string | null;
  };
  dataAvailability: {
    hasFinancials: boolean;
    hasDocuments: boolean;
    hasDetailedDocs: boolean;
    hasCIM: boolean;
  };
}

export async function buildMemoContext(dealId: string, orgId: string): Promise<MemoContext> {
  log.info('Building memo context', { dealId });

  // Parallel fetch all data sources — each wrapped to prevent one failure crashing all
  const [dealResult, financialsResult, docsResult, activityResult, teamResult] = await Promise.all([
    // 1. Deal + Company
    supabase
      .from('Deal')
      .select('id, name, stage, industry, revenue, ebitda, dealSize, irrProjected, mom, description, source, status, company:Company(name, description, industry)')
      .eq('id', dealId)
      .single()
      .then(r => r)
      .catch(() => ({ data: null, error: 'failed' })),

    // 2. Financial Statements
    supabase
      .from('FinancialStatement')
      .select('statementType, period, extractedData, confidence, extractionSource')
      .eq('dealId', dealId)
      .order('period', { ascending: false })
      .then(r => r)
      .catch(() => ({ data: null, error: 'failed' })),

    // 3. Documents
    supabase
      .from('Document')
      .select('id, name, type, extractedText')
      .eq('dealId', dealId)
      .not('extractedText', 'is', null)
      .then(r => r)
      .catch(() => ({ data: null, error: 'failed' })),

    // 4. Activity
    supabase
      .from('Activity')
      .select('type, title, description, createdAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false })
      .limit(10)
      .then(r => r)
      .catch(() => ({ data: null, error: 'failed' })),

    // 5. Team
    supabase
      .from('DealTeamMember')
      .select('role, user:User(name)')
      .eq('dealId', dealId)
      .then(r => r)
      .catch(() => ({ data: null, error: 'failed' })),
  ]);

  const deal = dealResult.data;
  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }

  const statements = financialsResult.data || [];
  const docs = docsResult.data || [];
  const activities = activityResult.data || [];
  const teamMembers = teamResult.data || [];

  // Build document context — use RAG if available, fallback to keyword extraction
  let docChunks: string[] = [];
  const docNames: string[] = docs.map((d: any) => d.name);

  if (isRAGEnabled() && docs.length > 0) {
    try {
      const ragResults = await searchDocumentChunks('investment memo financial analysis company overview', dealId, 20, 0.3);
      docChunks = ragResults.map((r: any) => r.content);
    } catch {
      log.warn('RAG search failed for memo context, using extractedText fallback');
    }
  }

  // Fallback: use first 3000 chars of each document's extracted text
  if (docChunks.length === 0 && docs.length > 0) {
    docChunks = docs.map((d: any) => {
      const text = d.extractedText || '';
      return `### ${d.name}\n${text.slice(0, 3000)}`;
    });
  }

  // Check for CIM-like documents
  const hasCIM = docs.some((d: any) =>
    d.name.toLowerCase().includes('cim') ||
    d.name.toLowerCase().includes('confidential information') ||
    d.name.toLowerCase().includes('teaser') ||
    (d.extractedText && d.extractedText.length > 10000)
  );

  // Extract team info
  const lead = teamMembers.find((m: any) => m.role === 'LEAD');
  const analyst = teamMembers.find((m: any) => m.role === 'MEMBER');

  return {
    deal: {
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      industry: deal.industry,
      revenue: deal.revenue,
      ebitda: deal.ebitda,
      dealSize: deal.dealSize,
      irrProjected: deal.irrProjected,
      mom: deal.mom,
      description: deal.description,
      source: deal.source,
      status: deal.status,
    },
    company: deal.company ? {
      name: (deal.company as any).name,
      description: (deal.company as any).description,
      industry: (deal.company as any).industry,
    } : null,
    financials: {
      statements,
      hasIncomeStatement: statements.some((s: any) => s.statementType === 'INCOME_STATEMENT'),
      hasBalanceSheet: statements.some((s: any) => s.statementType === 'BALANCE_SHEET'),
      hasCashFlow: statements.some((s: any) => s.statementType === 'CASH_FLOW'),
    },
    documents: {
      chunks: docChunks,
      docNames,
    },
    activity: activities,
    team: {
      leadPartner: lead ? (lead.user as any)?.name : null,
      analyst: analyst ? (analyst.user as any)?.name : null,
    },
    dataAvailability: {
      hasFinancials: statements.length > 0,
      hasDocuments: docs.length > 0,
      hasDetailedDocs: docChunks.length > 0,
      hasCIM,
    },
  };
}

/** Format context as a string for LLM consumption */
export function formatContextForLLM(ctx: MemoContext): string {
  const parts: string[] = [];

  // Deal overview
  parts.push(`## Deal: ${ctx.deal.name}`);
  parts.push(`Industry: ${ctx.deal.industry || 'N/A'} | Stage: ${ctx.deal.stage || 'N/A'} | Status: ${ctx.deal.status || 'N/A'}`);
  if (ctx.deal.revenue) parts.push(`Revenue: $${ctx.deal.revenue}M`);
  if (ctx.deal.ebitda) parts.push(`EBITDA: $${ctx.deal.ebitda}M`);
  if (ctx.deal.dealSize) parts.push(`Deal Size: $${ctx.deal.dealSize}M`);
  if (ctx.deal.irrProjected) parts.push(`Projected IRR: ${ctx.deal.irrProjected}%`);
  if (ctx.deal.mom) parts.push(`MoM: ${ctx.deal.mom}x`);
  if (ctx.deal.description) parts.push(`Description: ${ctx.deal.description}`);

  // Company
  if (ctx.company) {
    parts.push(`\n## Company: ${ctx.company.name || 'N/A'}`);
    if (ctx.company.description) parts.push(ctx.company.description);
  }

  // Team
  if (ctx.team.leadPartner || ctx.team.analyst) {
    parts.push(`\n## Deal Team`);
    if (ctx.team.leadPartner) parts.push(`Lead Partner: ${ctx.team.leadPartner}`);
    if (ctx.team.analyst) parts.push(`Analyst: ${ctx.team.analyst}`);
  }

  // Financial statements summary
  if (ctx.financials.statements.length > 0) {
    parts.push(`\n## Financial Data (${ctx.financials.statements.length} statements)`);
    const byType: Record<string, any[]> = {};
    for (const s of ctx.financials.statements) {
      byType[s.statementType] = byType[s.statementType] || [];
      byType[s.statementType].push(s);
    }
    for (const [type, stmts] of Object.entries(byType)) {
      parts.push(`\n### ${type} (${stmts.length} periods)`);
      for (const s of stmts.slice(0, 5)) {
        const data = Array.isArray(s.extractedData) ? s.extractedData : [];
        const items = data.map((i: any) => `${i.label}: ${i.value}`).join(', ');
        parts.push(`  ${s.period}: ${items || 'No line items'}`);
      }
    }
  }

  // Document excerpts
  if (ctx.documents.chunks.length > 0) {
    parts.push(`\n## Document Excerpts (${ctx.documents.docNames.length} documents)`);
    parts.push(`Sources: ${ctx.documents.docNames.join(', ')}`);
    // Include up to 8000 chars of document context
    let charCount = 0;
    for (const chunk of ctx.documents.chunks) {
      if (charCount + chunk.length > 8000) break;
      parts.push(chunk);
      charCount += chunk.length;
    }
  }

  // Data availability flags
  parts.push(`\n## Data Availability`);
  parts.push(`Financials: ${ctx.dataAvailability.hasFinancials ? 'YES' : 'NO'}`);
  parts.push(`Documents: ${ctx.dataAvailability.hasDocuments ? 'YES' : 'NO'}`);
  parts.push(`Detailed docs (CIM/teaser): ${ctx.dataAvailability.hasCIM ? 'YES' : 'NO'}`);

  return parts.join('\n');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/memoAgent/context.ts
git commit -m "feat(memo): add buildMemoContext for gathering deal data"
```

---

### Task 2: Create Section Generation Prompts

**Files:**
- Create: `apps/api/src/services/agents/memoAgent/prompts.ts`

- [ ] **Step 1: Create prompts.ts with all section prompts**

```typescript
// apps/api/src/services/agents/memoAgent/prompts.ts

export const MEMO_SYSTEM_PROMPT = `You are a senior Private Equity investment analyst writing an Investment Committee memo. You write with precision, use industry-standard PE terminology, and cite sources when available.

FORMATTING RULES:
- Financial figures in $M unless stated otherwise (e.g., "$120.5M")
- Percentages to one decimal (e.g., "15.2%")
- Use fiscal year labels (FY21A, FY22A, FY23E, FY24P — A=actual, E=estimated, P=projected)
- Bold key metrics inline (e.g., "revenue grew **15.2%** to **$167.0M**")
- Use bullet points for key takeaways
- Cite document sources as [Source: Document Name] when referencing specific data
- If data is not available, state "Data not available" — never fabricate numbers

TONE: Professional, analytical, concise. Suitable for investment committee review.`;

export const MEMO_CHAT_SYSTEM_PROMPT = `You are a PE investment analyst AI embedded in an IC memo editor. You help write, refine, and improve investment committee memos.

You have tools to:
- Read the current memo sections and deal data
- Search uploaded documents for specific information
- Rewrite sections (auto-applies for tone/style changes)
- Add content, tables, or charts to sections (asks user to confirm first)
- Add new sections to the memo

RULES:
- For tone/style rewrites: use rewrite_section (auto-applies, no confirmation needed)
- For new content, tables, charts: use the appropriate tool (will ask user to confirm)
- Always cite sources: [Source: Document Name]
- Financial figures in $M, percentages to 1 decimal, fiscal year labels (FY21A, FY22A, etc.)
- Never hallucinate numbers — if data isn't available, say so
- When generating tables, return structured tableData JSON
- When generating charts, return chartConfig JSON with banker blue palette (#003366, #004488, #0066AA, #3399CC, #66BBDD, accent #E8B931)
- The user has a selected "active section" — edits default to this section unless they specify otherwise`;

export type SectionType =
  | 'EXECUTIVE_SUMMARY'
  | 'COMPANY_OVERVIEW'
  | 'FINANCIAL_PERFORMANCE'
  | 'QUALITY_OF_EARNINGS'
  | 'MARKET_DYNAMICS'
  | 'COMPETITIVE_LANDSCAPE'
  | 'MANAGEMENT_ASSESSMENT'
  | 'OPERATIONAL_DEEP_DIVE'
  | 'RISK_ASSESSMENT'
  | 'VALUE_CREATION_PLAN'
  | 'DEAL_STRUCTURE'
  | 'EXIT_ANALYSIS';

interface SectionPromptConfig {
  title: string;
  prompt: string;
  requiresFinancials: boolean;
  requiresDocuments: boolean;
  includeTableData: boolean;
  includeChartConfig: boolean;
}

export const SECTION_PROMPTS: Record<SectionType, SectionPromptConfig> = {
  EXECUTIVE_SUMMARY: {
    title: 'Executive Summary',
    prompt: `Write the Executive Summary for this investment memo. Include:
- One-paragraph investment thesis (why this is attractive)
- Key financial highlights (revenue, EBITDA, growth rate, margins)
- Proposed transaction (deal size, structure, valuation multiple)
- Key risks and mitigants (2-3 bullet points)
- Recommendation (proceed to next stage / pass / needs more diligence)

Keep it to 200-300 words. This is the first thing the IC reads — make it compelling but balanced.`,
    requiresFinancials: false,
    requiresDocuments: false,
    includeTableData: false,
    includeChartConfig: false,
  },

  COMPANY_OVERVIEW: {
    title: 'Company Overview',
    prompt: `Write the Company Overview section. Include:
- Business description (what they do, products/services, value proposition)
- History and founding story (if available from documents)
- Headquarters and geographic footprint
- Employee count and organizational structure (if available)
- Key customers and end markets
- Business model (recurring vs. one-time, SaaS vs. services, etc.)

Use document sources for specific details. If information is not available, note "[Data needed: ...]".`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  FINANCIAL_PERFORMANCE: {
    title: 'Financial Performance',
    prompt: `Write the Financial Performance section. Include:
1. A narrative paragraph (3-4 sentences) summarizing revenue and EBITDA trajectory
2. A financial summary table with columns for each available fiscal year

The table should include these rows (where data is available):
- Total Revenue (with Growth % sub-row)
- Gross Profit (with Margin % sub-row)
- EBITDA (with Margin % sub-row)
- Net Income (if available)

Also generate a chart config for a dual-axis bar+line chart showing Revenue (bars) and EBITDA Margin % (line).

Return your response as JSON:
{
  "content": "Narrative paragraph here...",
  "tableData": {
    "headers": ["($ in Millions)", "FY21A", "FY22A", "FY23E", "FY24P"],
    "rows": [
      {"label": "Total Revenue", "values": ["$120.5", "$145.2", "$167.0", "$192.0"], "bold": true},
      {"label": "Growth %", "values": ["—", "20.5%", "15.0%", "15.0%"], "isSubMetric": true}
    ],
    "footnote": "Source: Management Presentation",
    "highlightColumn": 3
  },
  "chartConfig": {
    "type": "bar",
    "title": "Revenue & EBITDA Margin Trend",
    "data": {
      "labels": ["FY21A", "FY22A", "FY23E", "FY24P"],
      "datasets": [
        {"label": "Revenue ($M)", "data": [120.5, 145.2, 167.0, 192.0], "backgroundColor": "#003366"},
        {"label": "EBITDA Margin %", "data": [28.0, 30.0, 32.0, 33.0], "borderColor": "#E8B931", "type": "line", "yAxisID": "y1"}
      ]
    },
    "options": {"dualAxis": true, "format": "currency"}
  }
}

If financial statement data is not available, write a placeholder narrative stating what data is needed and omit the table/chart.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: true,
    includeChartConfig: true,
  },

  QUALITY_OF_EARNINGS: {
    title: 'Quality of Earnings',
    prompt: `Write the Quality of Earnings section. Include:
- Reported vs. adjusted EBITDA (identify non-recurring items)
- Revenue quality (recurring %, customer concentration, contract visibility)
- Working capital trends and normalization
- Any accounting policy concerns

If detailed financial data is available, include an EBITDA bridge/waterfall showing:
Reported EBITDA → +/- Adjustments → Adjusted EBITDA

Return JSON with "content" and optionally "tableData" for the adjustments table.
If financial data is limited, provide a framework of what QoE diligence should cover.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  MARKET_DYNAMICS: {
    title: 'Market Dynamics',
    prompt: `Write the Market Dynamics section. Include:
- Total Addressable Market (TAM) and Serviceable Addressable Market (SAM)
- Market growth rate and key growth drivers
- Industry tailwinds and headwinds
- Regulatory environment (if relevant)
- Technology trends impacting the sector

If document data is available, cite specific market size figures and sources.
If not, provide industry-level analysis based on the company's sector.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  COMPETITIVE_LANDSCAPE: {
    title: 'Competitive Landscape',
    prompt: `Write the Competitive Landscape section. Include:
- Key competitors (3-5) with brief descriptions
- Company's competitive positioning and differentiation
- Barriers to entry / competitive moats
- Market share estimates (if available)

If sufficient data is available, include a competitive comparison table:
{
  "tableData": {
    "headers": ["Company", "Revenue", "Focus", "Key Differentiator"],
    "rows": [...]
  }
}

Return JSON with "content" and optionally "tableData".`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  MANAGEMENT_ASSESSMENT: {
    title: 'Management Assessment',
    prompt: `Write the Management Assessment section. Include:
- CEO/Founder background and track record
- Key management team members and strengths
- Organizational gaps or key person risks
- Management's vision and strategic plan
- Retention considerations post-acquisition

Use document sources for specific bios and details. Note areas where additional management diligence is needed.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  OPERATIONAL_DEEP_DIVE: {
    title: 'Operational Deep Dive',
    prompt: `Write the Operational Deep Dive section. Include:
- Unit economics (CAC, LTV, payback period — if SaaS/subscription)
- Customer metrics (count, concentration, churn/retention, NRR)
- Operational KPIs specific to the industry
- Technology infrastructure and technical debt
- Scalability assessment

If financial data is available, include a customer concentration chart (doughnut) showing top customers as % of revenue.

Return JSON with "content" and optionally "chartConfig".`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: true,
  },

  RISK_ASSESSMENT: {
    title: 'Risk Assessment',
    prompt: `Write the Risk Assessment section. Identify 5-8 key risks in a structured format.

Return JSON:
{
  "content": "Brief intro paragraph about overall risk profile...",
  "tableData": {
    "headers": ["Risk Factor", "Severity", "Likelihood", "Mitigation"],
    "rows": [
      {"label": "Customer Concentration", "values": ["High", "Medium", "Diversification strategy + multi-year contracts"], "bold": false},
      ...
    ]
  }
}

Risk categories to consider: market/competitive, financial, operational, management/key person, regulatory, integration, technology.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  VALUE_CREATION_PLAN: {
    title: 'Value Creation Plan',
    prompt: `Write the Value Creation Plan section. Include:
- 100-day plan priorities (3-5 immediate actions)
- Revenue growth levers (organic + inorganic)
- Margin improvement opportunities
- Potential bolt-on acquisitions
- Technology/product roadmap investments
- Timeline for value creation milestones

Structure as a combination of narrative and bullet-pointed action items.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  DEAL_STRUCTURE: {
    title: 'Deal Structure',
    prompt: `Write the Deal Structure section. Include:
- Enterprise Value and valuation basis (EV/EBITDA multiple)
- Sources & Uses table
- Debt/equity split and financing terms
- Key transaction terms (reps, warranties, indemnification)
- Management rollover expectations
- Conditions precedent

Return JSON with "content" and a Sources & Uses table:
{
  "content": "Narrative...",
  "tableData": {
    "headers": ["Sources", "$M", "Uses", "$M"],
    "rows": [
      {"label": "Senior Debt", "values": ["$250.0", "Enterprise Value", "$500.0"], "bold": false},
      {"label": "Equity (Fund IV)", "values": ["$250.0", "Fees & Expenses", "$15.0"], "bold": false},
      {"label": "Total Sources", "values": ["$500.0", "Total Uses", "$515.0"], "bold": true}
    ]
  }
}`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: true,
    includeChartConfig: false,
  },

  EXIT_ANALYSIS: {
    title: 'Exit Analysis',
    prompt: `Write the Exit Analysis section. Include:
- Base/bull/bear case scenarios with IRR and MoM for each
- Assumed exit timeline (3-5 years)
- Exit multiples and basis for assumptions
- Potential exit routes (strategic sale, IPO, secondary)

Return JSON with "content" and a sensitivity heatmap table:
{
  "content": "Narrative...",
  "tableData": {
    "headers": ["Exit Multiple →", "8.0x", "10.0x", "12.0x", "14.0x"],
    "rows": [
      {"label": "Bear Case", "values": ["12%", "18%", "22%", "26%"], "bold": false},
      {"label": "Base Case", "values": ["18%", "24%", "28%", "32%"], "bold": true},
      {"label": "Bull Case", "values": ["24%", "30%", "35%", "39%"], "bold": false}
    ],
    "footnote": "IRR based on 4-year hold, 20% management rollover"
  },
  "chartConfig": {
    "type": "bar",
    "title": "Returns by Scenario",
    "data": {
      "labels": ["Bear", "Base", "Bull"],
      "datasets": [
        {"label": "IRR %", "data": [18, 24, 30], "backgroundColor": ["#66BBDD", "#003366", "#004488"]},
        {"label": "MoM", "data": [1.8, 2.5, 3.2], "backgroundColor": ["#66BBDD", "#003366", "#004488"], "hidden": true}
      ]
    },
    "options": {"format": "percentage"}
  }
}

If deal metrics (IRR, MoM, deal size) are not available, provide a framework with placeholder assumptions.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: true,
    includeChartConfig: true,
  },
};

/** Get the prompt config for a section type */
export function getSectionPrompt(sectionType: string): SectionPromptConfig | null {
  return SECTION_PROMPTS[sectionType as SectionType] || null;
}

/** Default section order for Comprehensive IC Memo template */
export const COMPREHENSIVE_IC_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'QUALITY_OF_EARNINGS',
  'MARKET_DYNAMICS',
  'COMPETITIVE_LANDSCAPE',
  'MANAGEMENT_ASSESSMENT',
  'OPERATIONAL_DEEP_DIVE',
  'RISK_ASSESSMENT',
  'VALUE_CREATION_PLAN',
  'DEAL_STRUCTURE',
  'EXIT_ANALYSIS',
];

/** Quick IC memo (6 sections) */
export const STANDARD_IC_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'MARKET_DYNAMICS',
  'RISK_ASSESSMENT',
  'DEAL_STRUCTURE',
];

/** Search Fund thesis (9 sections) */
export const SEARCH_FUND_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'MARKET_DYNAMICS',
  'COMPETITIVE_LANDSCAPE',
  'MANAGEMENT_ASSESSMENT',
  'RISK_ASSESSMENT',
  'VALUE_CREATION_PLAN',
  'EXIT_ANALYSIS',
];

/** Deal screening note (5 sections) */
export const SCREENING_NOTE_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'MARKET_DYNAMICS',
  'RISK_ASSESSMENT',
];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/memoAgent/prompts.ts
git commit -m "feat(memo): add PE section prompts and template definitions"
```

---

### Task 3: Create Generation Pipeline

**Files:**
- Create: `apps/api/src/services/agents/memoAgent/pipeline.ts`

- [ ] **Step 1: Create pipeline.ts with generateSection and generateAllSections**

```typescript
// apps/api/src/services/agents/memoAgent/pipeline.ts
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { buildMemoContext, formatContextForLLM, MemoContext } from './context.js';
import { MEMO_SYSTEM_PROMPT, SECTION_PROMPTS, SectionType, COMPREHENSIVE_IC_SECTIONS } from './prompts.js';
import { log } from '../../../utils/logger.js';

export interface GeneratedSection {
  type: string;
  title: string;
  content: string;
  tableData?: any;
  chartConfig?: any;
  aiGenerated: boolean;
  aiModel: string;
}

/**
 * Generate a single section using the deal context
 */
export async function generateSection(
  sectionType: SectionType,
  context: MemoContext,
  customPrompt?: string,
): Promise<GeneratedSection> {
  const config = SECTION_PROMPTS[sectionType];
  if (!config) {
    throw new Error(`Unknown section type: ${sectionType}`);
  }

  // Skip sections that need data we don't have (return placeholder)
  if (config.requiresFinancials && !context.dataAvailability.hasFinancials) {
    if (sectionType === 'FINANCIAL_PERFORMANCE' || sectionType === 'QUALITY_OF_EARNINGS') {
      return {
        type: sectionType,
        title: config.title,
        content: `<p><em>[Financial data not yet available. Upload financial documents or extract financial statements to auto-generate this section.]</em></p>`,
        aiGenerated: false,
        aiModel: 'placeholder',
      };
    }
  }

  const model = getChatModel(0.7, 2000);
  const contextStr = formatContextForLLM(context);

  const prompt = customPrompt || config.prompt;
  const wantsJSON = config.includeTableData || config.includeChartConfig;

  const userPrompt = `${prompt}

DEAL CONTEXT:
${contextStr}

${wantsJSON ? 'IMPORTANT: Return your response as valid JSON with "content" (HTML string), and optionally "tableData" and "chartConfig" fields as specified above. The content field should use <p>, <ul>, <li>, <strong> HTML tags for formatting.' : 'Format your response as HTML using <p>, <ul>, <li>, <strong> tags. Do not wrap in a code block.'}`;

  const messages = [
    new SystemMessage(MEMO_SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ];

  try {
    const result = await model.invoke(messages);
    const text = typeof result.content === 'string' ? result.content : '';

    // Try to parse as JSON if we expect structured data
    if (wantsJSON) {
      try {
        // Strip markdown code fences if present
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          type: sectionType,
          title: config.title,
          content: parsed.content || text,
          tableData: parsed.tableData || undefined,
          chartConfig: parsed.chartConfig || undefined,
          aiGenerated: true,
          aiModel: 'gpt-4o',
        };
      } catch {
        // JSON parse failed — use raw text as content
        log.warn('Failed to parse section JSON, using raw text', { sectionType });
      }
    }

    return {
      type: sectionType,
      title: config.title,
      content: text,
      aiGenerated: true,
      aiModel: 'gpt-4o',
    };
  } catch (error: any) {
    log.error('Section generation failed', { sectionType, error: error.message });
    return {
      type: sectionType,
      title: config.title,
      content: `<p><em>[AI generation failed for this section: ${error.message}. Click regenerate to try again.]</em></p>`,
      aiGenerated: false,
      aiModel: 'error',
    };
  }
}

/**
 * Generate all sections for a memo in parallel
 */
export async function generateAllSections(
  dealId: string,
  orgId: string,
  sectionTypes?: SectionType[],
): Promise<{ sections: GeneratedSection[]; context: MemoContext }> {
  if (!isLLMAvailable()) {
    throw new Error('AI service unavailable — no LLM API key configured');
  }

  const types = sectionTypes || COMPREHENSIVE_IC_SECTIONS;

  log.info('Generating memo sections', { dealId, sectionCount: types.length });

  // Build context once, share across all sections
  const context = await buildMemoContext(dealId, orgId);

  // Generate all sections in parallel
  const sections = await Promise.all(
    types.map((type, index) =>
      generateSection(type, context).then(section => ({
        ...section,
        sortOrder: index + 1,
      }))
    )
  );

  log.info('Memo generation complete', {
    dealId,
    total: sections.length,
    generated: sections.filter(s => s.aiGenerated).length,
    failed: sections.filter(s => s.aiModel === 'error').length,
  });

  return { sections, context };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/memoAgent/pipeline.ts
git commit -m "feat(memo): add parallel section generation pipeline"
```

---

## Phase 2: Memo Chat ReAct Agent

### Task 4: Create Closure-Bound Tools for Memo Agent

**Files:**
- Create: `apps/api/src/services/agents/memoAgent/tools.ts`

- [ ] **Step 1: Create tools.ts with getMemoAgentTools factory**

```typescript
// apps/api/src/services/agents/memoAgent/tools.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { supabase } from '../../../supabase.js';
import { searchDocumentChunks, isRAGEnabled } from '../../../rag.js';
import { log } from '../../../utils/logger.js';

/** Create all memo chat tools with memoId/dealId/orgId baked in via closures */
export function getMemoAgentTools(memoId: string, dealId: string, orgId: string) {

  const getMemoSectionsTool = tool(
    async () => {
      try {
        const { data: sections } = await supabase
          .from('MemoSection')
          .select('id, type, title, content, sortOrder, aiGenerated')
          .eq('memoId', memoId)
          .order('sortOrder', { ascending: true });

        if (!sections || sections.length === 0) return 'No sections in this memo yet.';

        return sections.map((s: any) => {
          const preview = (s.content || '').replace(/<[^>]*>/g, '').slice(0, 150);
          return `[${s.sortOrder}] **${s.title}** (${s.type}, id: ${s.id})${s.aiGenerated ? ' [AI]' : ''}\n  ${preview}...`;
        }).join('\n\n');
      } catch (error) {
        log.error('getMemoSections tool error', error);
        return 'Error reading memo sections.';
      }
    },
    {
      name: 'get_memo_sections',
      description: 'Read all sections in the current memo with their titles, types, and content previews.',
      schema: z.object({}),
    }
  );

  const getActiveSectionTool = tool(
    async ({ sectionId }) => {
      try {
        const { data: section } = await supabase
          .from('MemoSection')
          .select('id, type, title, content, tableData, chartConfig, citations')
          .eq('id', sectionId)
          .eq('memoId', memoId)
          .single();

        if (!section) return 'Section not found.';

        const content = (section.content || '').replace(/<[^>]*>/g, '');
        const hasTable = !!section.tableData;
        const hasChart = !!section.chartConfig;

        return `**${section.title}** (${section.type})\n\nContent:\n${content}\n\nHas table: ${hasTable}\nHas chart: ${hasChart}`;
      } catch (error) {
        log.error('getActiveSection tool error', error);
        return 'Error reading section.';
      }
    },
    {
      name: 'get_active_section',
      description: 'Read the full content of a specific memo section including table data and chart config.',
      schema: z.object({
        sectionId: z.string().describe('The section ID to read'),
      }),
    }
  );

  const getDealFinancialsTool = tool(
    async () => {
      try {
        const { data: statements } = await supabase
          .from('FinancialStatement')
          .select('statementType, period, extractedData, confidence')
          .eq('dealId', dealId)
          .order('period', { ascending: false });

        if (!statements || statements.length === 0) return 'No financial statements available for this deal.';

        const summary: string[] = [`Found ${statements.length} financial statements:`];
        const byType: Record<string, any[]> = {};
        for (const s of statements) {
          byType[s.statementType] = byType[s.statementType] || [];
          byType[s.statementType].push(s);
        }
        for (const [type, stmts] of Object.entries(byType)) {
          summary.push(`\n**${type}** (${stmts.length} periods):`);
          for (const s of stmts.slice(0, 5)) {
            const data = Array.isArray(s.extractedData) ? s.extractedData : [];
            const revenue = data.find((i: any) => i.label?.toLowerCase().includes('revenue'));
            const ebitda = data.find((i: any) => i.label?.toLowerCase().includes('ebitda'));
            summary.push(`  - ${s.period}: ${data.length} line items, confidence ${s.confidence}%`);
            if (revenue) summary.push(`    Revenue: $${revenue.value}M`);
            if (ebitda) summary.push(`    EBITDA: $${ebitda.value}M`);
          }
        }
        return summary.join('\n');
      } catch (error) {
        log.error('getDealFinancials tool error', error);
        return 'Error fetching financial data.';
      }
    },
    {
      name: 'get_deal_financials',
      description: 'Fetch extracted financial statements (income statement, balance sheet, cash flow) for the deal.',
      schema: z.object({}),
    }
  );

  const searchDocumentsTool = tool(
    async ({ query }) => {
      try {
        if (isRAGEnabled()) {
          const results = await searchDocumentChunks(query, dealId, 8, 0.4);
          if (results.length > 0) {
            return results.map((r: any) => r.content).join('\n\n---\n\n');
          }
        }
        // Fallback to text search
        const { data: docs } = await supabase
          .from('Document')
          .select('name, extractedText')
          .eq('dealId', dealId)
          .not('extractedText', 'is', null);

        if (!docs || docs.length === 0) return 'No documents found for this deal.';

        const queryLower = query.toLowerCase();
        const relevant = docs.filter((d: any) =>
          d.extractedText?.toLowerCase().includes(queryLower) ||
          d.name.toLowerCase().includes(queryLower)
        );

        if (relevant.length === 0) return 'No relevant content found in documents.';

        return relevant.map((d: any) => {
          const text = d.extractedText || '';
          const idx = text.toLowerCase().indexOf(queryLower);
          const start = Math.max(0, idx - 200);
          const end = Math.min(text.length, idx + query.length + 500);
          return `### ${d.name}\n${text.slice(start, end)}`;
        }).join('\n\n');
      } catch (error) {
        log.error('searchDocuments tool error', error);
        return 'Error searching documents.';
      }
    },
    {
      name: 'search_documents',
      description: 'Search through uploaded deal documents for specific information.',
      schema: z.object({
        query: z.string().describe('What to search for in the documents'),
      }),
    }
  );

  const rewriteSectionTool = tool(
    async ({ sectionId, instruction }) => {
      try {
        const { data: section } = await supabase
          .from('MemoSection')
          .select('id, title, content')
          .eq('id', sectionId)
          .eq('memoId', memoId)
          .single();

        if (!section) return JSON.stringify({ action: 'error', message: 'Section not found.' });

        return JSON.stringify({
          action: 'applied',
          sectionId,
          instruction,
          currentContent: (section.content || '').replace(/<[^>]*>/g, '').slice(0, 500),
        });
      } catch (error) {
        log.error('rewriteSection tool error', error);
        return JSON.stringify({ action: 'error', message: 'Failed to rewrite section.' });
      }
    },
    {
      name: 'rewrite_section',
      description: 'Rewrite an existing section for tone, style, or conciseness. Auto-applies without confirmation. Use for: "make it more formal", "shorten this", "use bullet points".',
      schema: z.object({
        sectionId: z.string().describe('Section ID to rewrite'),
        instruction: z.string().describe('How to rewrite (e.g., "more formal tone", "add bullet points", "make concise")'),
      }),
    }
  );

  const addToSectionTool = tool(
    async ({ sectionId, description }) => {
      return JSON.stringify({
        action: 'confirm',
        sectionId,
        description,
        insertPosition: 'append',
      });
    },
    {
      name: 'add_to_section',
      description: 'Add new content (paragraph, analysis, breakdown) to an existing section. Requires user confirmation before applying.',
      schema: z.object({
        sectionId: z.string().describe('Section ID to add content to'),
        description: z.string().describe('What content to add (e.g., "EBITDA bridge analysis", "customer concentration breakdown")'),
      }),
    }
  );

  const replaceSectionTool = tool(
    async ({ sectionId, description }) => {
      return JSON.stringify({
        action: 'confirm',
        sectionId,
        description,
        insertPosition: 'replace',
      });
    },
    {
      name: 'replace_section',
      description: 'Completely replace a section with new content. Requires user confirmation. Use for major rewrites or complete restructuring.',
      schema: z.object({
        sectionId: z.string().describe('Section ID to replace'),
        description: z.string().describe('What the new content should cover'),
      }),
    }
  );

  const generateTableTool = tool(
    async ({ sectionId, tableDescription }) => {
      return JSON.stringify({
        action: 'confirm',
        sectionId,
        tableDescription,
        type: 'table',
      });
    },
    {
      name: 'generate_table',
      description: 'Generate a structured data table (financial summary, comps table, risk matrix, sources & uses). Requires user confirmation.',
      schema: z.object({
        sectionId: z.string().describe('Section ID to add the table to'),
        tableDescription: z.string().describe('What table to create (e.g., "EBITDA bridge from FY22 to FY23", "comparable companies EV/EBITDA")'),
      }),
    }
  );

  const generateChartTool = tool(
    async ({ sectionId, chartDescription }) => {
      return JSON.stringify({
        action: 'confirm',
        sectionId,
        chartDescription,
        type: 'chart',
      });
    },
    {
      name: 'generate_chart',
      description: 'Generate a Chart.js chart (revenue trend, margin waterfall, returns sensitivity, customer concentration pie). Requires user confirmation.',
      schema: z.object({
        sectionId: z.string().describe('Section ID to add the chart to'),
        chartDescription: z.string().describe('What chart to create (e.g., "revenue and EBITDA margin trend", "customer concentration donut")'),
      }),
    }
  );

  const addSectionTool = tool(
    async ({ sectionType, title }) => {
      return JSON.stringify({
        action: 'confirm',
        sectionType,
        title,
        type: 'new_section',
      });
    },
    {
      name: 'add_section',
      description: 'Add a new section to the memo. Requires user confirmation.',
      schema: z.object({
        sectionType: z.string().describe('Section type (e.g., EXECUTIVE_SUMMARY, COMPETITIVE_LANDSCAPE)'),
        title: z.string().describe('Section title'),
      }),
    }
  );

  return [
    getMemoSectionsTool,
    getActiveSectionTool,
    getDealFinancialsTool,
    searchDocumentsTool,
    rewriteSectionTool,
    addToSectionTool,
    replaceSectionTool,
    generateTableTool,
    generateChartTool,
    addSectionTool,
  ];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/memoAgent/tools.ts
git commit -m "feat(memo): add 10 closure-bound tools for memo chat agent"
```

---

### Task 5: Create Memo Chat Agent Entry Point

**Files:**
- Create: `apps/api/src/services/agents/memoAgent/index.ts`

- [ ] **Step 1: Create index.ts with runMemoChatAgent**

```typescript
// apps/api/src/services/agents/memoAgent/index.ts
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { getMemoAgentTools } from './tools.js';
import { MEMO_CHAT_SYSTEM_PROMPT } from './prompts.js';
import { classifyAIError } from '../../../utils/aiErrors.js';
import { log } from '../../../utils/logger.js';

export { buildMemoContext, formatContextForLLM } from './context.js';
export { generateAllSections, generateSection } from './pipeline.js';
export { COMPREHENSIVE_IC_SECTIONS, STANDARD_IC_SECTIONS, SEARCH_FUND_SECTIONS, SCREENING_NOTE_SECTIONS } from './prompts.js';
export type { GeneratedSection } from './pipeline.js';
export type { MemoContext } from './context.js';

export interface MemoChatInput {
  memoId: string;
  dealId: string;
  orgId: string;
  message: string;
  activeSectionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface MemoChatResponse {
  message: string;
  model: string;
  action?: 'applied' | 'confirm' | 'info';
  sectionId?: string;
  preview?: string;
  tableData?: any;
  chartConfig?: any;
  insertPosition?: 'append' | 'prepend' | 'replace';
  type?: 'table' | 'chart' | 'new_section';
}

export async function runMemoChatAgent(input: MemoChatInput): Promise<MemoChatResponse> {
  if (!isLLMAvailable()) {
    return { message: 'AI service unavailable. Please configure an API key.', model: 'fallback' };
  }

  try {
    const model = getChatModel(0.7, 2000);
    const tools = getMemoAgentTools(input.memoId, input.dealId, input.orgId);

    const agent = createReactAgent({ llm: model, tools });

    // Build messages
    const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
      new SystemMessage(MEMO_CHAT_SYSTEM_PROMPT),
    ];

    if (input.activeSectionId) {
      messages.push(new SystemMessage(`The user's currently active/selected section ID is: ${input.activeSectionId}. Default edits to this section unless they specify otherwise.`));
    }

    // Add history (last 8 messages)
    if (input.history) {
      for (const msg of input.history.slice(-8)) {
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else {
          messages.push(new AIMessage(msg.content));
        }
      }
    }

    messages.push(new HumanMessage(input.message));

    log.debug('Running memo chat agent', { memoId: input.memoId, messageCount: messages.length });

    const result = await agent.invoke({ messages });

    // Extract the final AI response
    const aiMessages = result.messages.filter(
      (m: any) => m._getType?.() === 'ai' || m.constructor?.name === 'AIMessage'
    );
    const lastAI = aiMessages[aiMessages.length - 1];
    const responseText = typeof lastAI?.content === 'string'
      ? lastAI.content
      : 'I was unable to generate a response.';

    // Check tool messages for structured actions (confirm/applied)
    const toolMessages = result.messages.filter(
      (m: any) => m._getType?.() === 'tool' || m.constructor?.name === 'ToolMessage'
    );

    let action: MemoChatResponse['action'] = 'info';
    let sectionId: string | undefined;
    let preview: string | undefined;
    let tableData: any;
    let chartConfig: any;
    let insertPosition: MemoChatResponse['insertPosition'];
    let type: MemoChatResponse['type'];

    for (const tm of toolMessages) {
      try {
        const content = typeof tm.content === 'string' ? tm.content : '';
        if (!content.startsWith('{')) continue;
        const parsed = JSON.parse(content);

        if (parsed.action === 'applied' || parsed.action === 'confirm') {
          action = parsed.action;
          sectionId = parsed.sectionId;
          preview = parsed.description || parsed.currentContent;
          tableData = parsed.tableData;
          chartConfig = parsed.chartConfig;
          insertPosition = parsed.insertPosition;
          type = parsed.type;
        }
      } catch {
        // Not JSON — skip
      }
    }

    log.debug('Memo chat agent completed', {
      responseLength: responseText.length,
      action,
      toolCalls: toolMessages.length,
    });

    return {
      message: responseText,
      model: 'gpt-4o (ReAct agent)',
      action,
      sectionId,
      preview,
      tableData,
      chartConfig,
      insertPosition,
      type,
    };
  } catch (error: any) {
    log.error('Memo chat agent error', { message: error.message, stack: error.stack?.slice(0, 500) });
    return {
      message: classifyAIError(error.message || 'Unknown error'),
      model: 'error',
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/agents/memoAgent/index.ts
git commit -m "feat(memo): add ReAct chat agent for memo editing"
```

---

## Phase 3: API Route Enhancements

### Task 6: Enhance Memo Create Route with Auto-Generate

**Files:**
- Modify: `apps/api/src/routes/memos.ts`

- [ ] **Step 1: Add autoGenerate support to POST /memos**

At the top of `memos.ts`, add the import (after existing imports around line 10):

```typescript
import { generateAllSections, COMPREHENSIVE_IC_SECTIONS, STANDARD_IC_SECTIONS, SEARCH_FUND_SECTIONS, SCREENING_NOTE_SECTIONS } from '../services/agents/memoAgent/index.js';
import { isLLMAvailable } from '../services/llm.js';
```

Update the `createMemoSchema` (around line 23) to add new fields:

```typescript
const createMemoSchema = z.object({
  dealId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  projectName: z.string().min(1).max(200).optional(),
  type: z.enum(['IC_MEMO', 'TEASER', 'SUMMARY', 'CUSTOM']).optional().default('IC_MEMO'),
  templateId: z.string().uuid().optional(),
  autoGenerate: z.boolean().optional().default(false),
  templatePreset: z.enum(['comprehensive', 'standard', 'search_fund', 'screening']).optional(),
});
```

After the memo is created and default sections are inserted (after the section insertion block around line 282), add auto-generation logic:

```typescript
    // Auto-generate section content if requested and AI is available
    let generationStatus = null;
    if (autoGenerate && dealId && isLLMAvailable()) {
      try {
        const presetMap: Record<string, typeof COMPREHENSIVE_IC_SECTIONS> = {
          comprehensive: COMPREHENSIVE_IC_SECTIONS,
          standard: STANDARD_IC_SECTIONS,
          search_fund: SEARCH_FUND_SECTIONS,
          screening: SCREENING_NOTE_SECTIONS,
        };
        const sectionTypes = templatePreset ? presetMap[templatePreset] : undefined;

        const { sections: generated } = await generateAllSections(dealId, orgId, sectionTypes);

        // Update each section with generated content
        let completed = 0;
        const errors: string[] = [];
        for (const gen of generated) {
          // Find matching section in DB by type
          const { data: existingSection } = await supabase
            .from('MemoSection')
            .select('id')
            .eq('memoId', memo.id)
            .eq('type', gen.type)
            .single();

          if (existingSection) {
            const updateData: any = {
              content: gen.content,
              aiGenerated: gen.aiGenerated,
              aiModel: gen.aiModel,
              updatedAt: new Date().toISOString(),
            };
            if (gen.tableData) updateData.tableData = gen.tableData;
            if (gen.chartConfig) updateData.chartConfig = gen.chartConfig;

            await supabase
              .from('MemoSection')
              .update(updateData)
              .eq('id', existingSection.id);
            completed++;
          } else if (gen.aiGenerated) {
            // Section type not in template — create it
            await supabase
              .from('MemoSection')
              .insert({
                memoId: memo.id,
                type: gen.type,
                title: gen.title,
                content: gen.content,
                aiGenerated: gen.aiGenerated,
                aiModel: gen.aiModel,
                tableData: gen.tableData || null,
                chartConfig: gen.chartConfig || null,
                sortOrder: (gen as any).sortOrder || completed + 1,
                status: 'DRAFT',
              });
            completed++;
          }
        }

        generationStatus = { completed, total: generated.length, errors };
      } catch (error: any) {
        log.error('Auto-generation failed', { memoId: memo.id, error: error.message });
        generationStatus = { completed: 0, total: 0, errors: [error.message] };
      }
    }
```

Update the final response to include generationStatus:

```typescript
    res.status(201).json({
      ...fullMemo,
      ...(generationStatus && { generationStatus }),
    });
```

- [ ] **Step 2: Add POST /:id/generate-all endpoint**

Add before the `export default router;` at the end of `memos.ts`:

```typescript
// POST /api/memos/:id/generate-all - Regenerate all sections
router.post('/:id/generate-all', async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const { data: memo } = await supabase
      .from('Memo')
      .select('id, dealId')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (!memo) return res.status(404).json({ error: 'Memo not found' });
    if (!memo.dealId) return res.status(400).json({ error: 'Memo has no associated deal' });

    if (!isLLMAvailable()) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    const { sections: generated } = await generateAllSections(memo.dealId, orgId);

    let completed = 0;
    for (const gen of generated) {
      const { data: existing } = await supabase
        .from('MemoSection')
        .select('id')
        .eq('memoId', id)
        .eq('type', gen.type)
        .single();

      const updateData: any = {
        content: gen.content,
        aiGenerated: gen.aiGenerated,
        aiModel: gen.aiModel,
        updatedAt: new Date().toISOString(),
      };
      if (gen.tableData) updateData.tableData = gen.tableData;
      if (gen.chartConfig) updateData.chartConfig = gen.chartConfig;

      if (existing) {
        await supabase.from('MemoSection').update(updateData).eq('id', existing.id);
      } else {
        await supabase.from('MemoSection').insert({
          memoId: id,
          type: gen.type,
          title: gen.title,
          sortOrder: (gen as any).sortOrder || completed + 1,
          status: 'DRAFT',
          ...updateData,
        });
      }
      completed++;
    }

    res.json({ success: true, completed, total: generated.length });
  } catch (error: any) {
    log.error('Generate-all failed', error);
    res.status(500).json({ error: classifyAIError(error.message || 'Failed to regenerate memo') });
  }
});
```

Also add at the top: `import { classifyAIError } from '../utils/aiErrors.js';`

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/memos.ts
git commit -m "feat(memo): auto-generate sections on memo create + generate-all endpoint"
```

---

### Task 7: Enhance Chat Route with ReAct Agent

**Files:**
- Modify: `apps/api/src/routes/memos-chat.ts`

- [ ] **Step 1: Replace raw GPT-4o chat with ReAct agent**

At the top of `memos-chat.ts`, add/replace imports:

```typescript
import { runMemoChatAgent } from '../services/agents/memoAgent/index.js';
import { isLLMAvailable } from '../services/llm.js';
import { classifyAIError } from '../utils/aiErrors.js';
```

Update the `chatMessageSchema` (around line 19) to include `activeSectionId`:

```typescript
const chatMessageSchema = z.object({
  content: z.string().min(1),
  activeSectionId: z.string().uuid().optional(),
});
```

Replace the POST `/:id/chat` handler (around lines 177-340) with:

```typescript
// POST /memos/:id/chat - Chat with AI about the memo (ReAct Agent)
router.post('/:id/chat', async (req, res) => {
  try {
    const { id: memoId } = req.params;
    const orgId = getOrgId(req);
    const userId = req.user?.id || null;
    const { content, activeSectionId } = chatMessageSchema.parse(req.body);

    // Verify memo exists and belongs to org
    const { data: memo } = await supabase
      .from('Memo')
      .select('id, dealId, title, projectName')
      .eq('id', memoId)
      .eq('organizationId', orgId)
      .single();

    if (!memo) return res.status(404).json({ error: 'Memo not found' });

    if (!isLLMAvailable()) {
      return res.status(503).json({ error: 'AI service unavailable' });
    }

    // Get or create conversation
    let conversationId: string;
    const { data: existingConv } = await supabase
      .from('MemoConversation')
      .select('id')
      .eq('memoId', memoId)
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(1)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
    } else {
      const { data: newConv } = await supabase
        .from('MemoConversation')
        .insert({ memoId, userId, title: 'AI Analyst Chat' })
        .select('id')
        .single();
      conversationId = newConv!.id;
    }

    // Save user message
    await supabase.from('MemoChatMessage').insert({
      conversationId,
      role: 'user',
      content,
    });

    // Get conversation history
    const { data: historyMessages } = await supabase
      .from('MemoChatMessage')
      .select('role, content')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true })
      .limit(16);

    const history = (historyMessages || [])
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Run ReAct agent
    const result = await runMemoChatAgent({
      memoId,
      dealId: memo.dealId,
      orgId,
      message: content,
      activeSectionId,
      history,
    });

    // Save AI response
    await supabase.from('MemoChatMessage').insert({
      conversationId,
      role: 'assistant',
      content: result.message,
      metadata: {
        model: result.model,
        action: result.action,
        sectionId: result.sectionId,
      },
    });

    // Update conversation timestamp
    await supabase
      .from('MemoConversation')
      .update({ updatedAt: new Date().toISOString() })
      .eq('id', conversationId);

    res.json({
      id: conversationId,
      role: 'assistant',
      content: result.message,
      model: result.model,
      timestamp: new Date().toISOString(),
      // Structured action data for frontend
      action: result.action,
      sectionId: result.sectionId,
      preview: result.preview,
      tableData: result.tableData,
      chartConfig: result.chartConfig,
      insertPosition: result.insertPosition,
      type: result.type,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Memo chat error', error);
    res.status(500).json({ error: classifyAIError(error.message || 'Failed to process chat') });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/memos-chat.ts
git commit -m "feat(memo): replace raw GPT-4o chat with ReAct agent + structured responses"
```

---

### Task 8: Add Section Apply Endpoint

**Files:**
- Modify: `apps/api/src/routes/memos-sections.ts`

- [ ] **Step 1: Add POST /:id/sections/:sectionId/apply endpoint**

Add at the end of `memos-sections.ts`, before `export default router;`:

```typescript
// POST /memos/:id/sections/:sectionId/apply - Apply a confirmed chat action
const applySectionSchema = z.object({
  content: z.string().optional(),
  tableData: z.any().optional(),
  chartConfig: z.any().optional(),
  insertPosition: z.enum(['append', 'prepend', 'replace']).optional().default('replace'),
});

router.post('/:id/sections/:sectionId/apply', async (req, res) => {
  try {
    const { id: memoId, sectionId } = req.params;
    const orgId = getOrgId(req);
    const { content, tableData, chartConfig, insertPosition } = applySectionSchema.parse(req.body);

    // Verify memo ownership
    const { data: memo } = await supabase
      .from('Memo')
      .select('id')
      .eq('id', memoId)
      .eq('organizationId', orgId)
      .single();

    if (!memo) return res.status(404).json({ error: 'Memo not found' });

    // Get current section
    const { data: section } = await supabase
      .from('MemoSection')
      .select('id, content, tableData, chartConfig')
      .eq('id', sectionId)
      .eq('memoId', memoId)
      .single();

    if (!section) return res.status(404).json({ error: 'Section not found' });

    // Build update
    const updateData: any = { updatedAt: new Date().toISOString() };

    if (content) {
      if (insertPosition === 'append') {
        updateData.content = (section.content || '') + '\n' + content;
      } else if (insertPosition === 'prepend') {
        updateData.content = content + '\n' + (section.content || '');
      } else {
        updateData.content = content;
      }
    }
    if (tableData !== undefined) updateData.tableData = tableData;
    if (chartConfig !== undefined) updateData.chartConfig = chartConfig;

    const { data: updated, error } = await supabase
      .from('MemoSection')
      .update(updateData)
      .eq('id', sectionId)
      .select('id, type, title, content, tableData, chartConfig, sortOrder')
      .single();

    if (error) throw error;

    // Return previous state for undo
    res.json({
      section: updated,
      previousContent: section.content,
      previousTableData: section.tableData,
      previousChartConfig: section.chartConfig,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    log.error('Apply section error', error);
    res.status(500).json({ error: 'Failed to apply section update' });
  }
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/memos-sections.ts
git commit -m "feat(memo): add section apply endpoint for chat confirm actions"
```

---

## Phase 4: Frontend — Auto-Generate + Active Section

### Task 9: Update memo-api.js with New API Functions

**Files:**
- Modify: `apps/web/memo-api.js`

- [ ] **Step 1: Add generateAllSectionsAPI and applySectionActionAPI functions**

Add at the end of `memo-api.js` (before any closing braces):

```javascript
/**
 * Generate all sections for an existing memo
 * POST /api/memos/:id/generate-all
 */
async function generateAllSectionsAPI(memoId) {
    if (!memoId || memoId.startsWith('demo-')) return null;
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${memoId}/generate-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) return await response.json();
        const err = await response.json().catch(() => ({}));
        console.error('[Memo] Generate-all failed:', err);
        return null;
    } catch (error) {
        console.error('[Memo] Generate-all error:', error);
        return null;
    }
}

/**
 * Apply a confirmed chat action to a section
 * POST /api/memos/:id/sections/:sectionId/apply
 */
async function applySectionActionAPI(memoId, sectionId, data) {
    if (!memoId || memoId.startsWith('demo-')) return null;
    try {
        const response = await PEAuth.authFetch(`${API_BASE_URL}/memos/${memoId}/sections/${sectionId}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (response.ok) return await response.json();
        console.error('[Memo] Apply section failed:', response.status);
        return null;
    } catch (error) {
        console.error('[Memo] Apply section error:', error);
        return null;
    }
}
```

Also update the `createMemoAPI` function (around line 16-49) to pass `autoGenerate` and `templatePreset`:

Find the body of the fetch call in `createMemoAPI` and ensure the body includes the new fields:

```javascript
body: JSON.stringify({
    dealId: options.dealId,
    title: options.title || 'Investment Committee Memo',
    projectName: options.projectName || options.title || 'New Project',
    type: options.type || 'IC_MEMO',
    templateId: options.templateId,
    autoGenerate: options.autoGenerate !== undefined ? options.autoGenerate : !!options.dealId,
    templatePreset: options.templatePreset || 'comprehensive',
}),
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/memo-api.js
git commit -m "feat(memo): add generateAll and applySection API functions"
```

---

### Task 10: Update memo-builder.js for Auto-Generate Flow + Active Section

**Files:**
- Modify: `apps/web/memo-builder.js`

- [ ] **Step 1: Add generation loading overlay and active section tracking**

In the state object (around line 148), add:

```javascript
    undoStack: [],             // For undo on auto-applied changes (max 5)
    isGenerating: false,       // True during auto-generation
```

Find the initialization code where a new memo is created (around lines 181-227 in the `if (isNew && dealId)` block). Replace the create call to pass `autoGenerate: true`:

```javascript
if (isNew && dealId) {
    state.isGenerating = true;
    showGeneratingOverlay();
    const created = await createMemoAPI({
        dealId,
        title: projectName || 'Investment Committee Memo',
        projectName: projectName || 'New Project',
        templateId,
        autoGenerate: true,
        templatePreset: templatePreset || 'comprehensive',
    });
    state.isGenerating = false;
    hideGeneratingOverlay();
    if (created) {
        await loadMemoFromAPI(created.id);
        updateURLWithMemoId(created.id);
    }
}
```

Add the overlay functions at the bottom of `memo-builder.js`:

```javascript
function showGeneratingOverlay() {
    const main = document.querySelector('.memo-workspace') || document.querySelector('main');
    if (!main) return;
    const overlay = document.createElement('div');
    overlay.id = 'generating-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl p-8 shadow-2xl max-w-md text-center">
            <div class="animate-spin rounded-full h-12 w-12 border-4 border-[#003366] border-t-transparent mx-auto mb-4"></div>
            <h3 class="text-lg font-semibold text-[#003366] mb-2">Generating Investment Memo</h3>
            <p class="text-sm text-gray-500" id="gen-status">Analyzing deal data and documents...</p>
        </div>
    `;
    document.body.appendChild(overlay);
}

function hideGeneratingOverlay() {
    const overlay = document.getElementById('generating-overlay');
    if (overlay) overlay.remove();
}

// Active section tracking
function setActiveSection(sectionId) {
    state.activeSection = sectionId;
    // Update sidebar highlighting
    document.querySelectorAll('.section-item').forEach(el => {
        el.classList.toggle('bg-blue-50', el.dataset.sectionId === sectionId);
        el.classList.toggle('border-l-2', el.dataset.sectionId === sectionId);
        el.classList.toggle('border-[#003366]', el.dataset.sectionId === sectionId);
    });
    // Update chat input placeholder
    const section = state.sections.find(s => s.id === sectionId);
    const chatInput = document.getElementById('chat-input') || document.querySelector('textarea[placeholder*="Ask"]');
    if (chatInput && section) {
        chatInput.placeholder = `Ask about ${section.title}...`;
    }
}

// Undo stack management
function pushUndo(sectionId, previousContent, previousTableData, previousChartConfig) {
    state.undoStack.push({ sectionId, previousContent, previousTableData, previousChartConfig, timestamp: Date.now() });
    if (state.undoStack.length > 5) state.undoStack.shift();
}

function popUndo() {
    return state.undoStack.pop();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/memo-builder.js
git commit -m "feat(memo): auto-generate overlay, active section tracking, undo stack"
```

---

### Task 11: Update memo-chat.js for Structured Responses + Confirm/Apply UX

**Files:**
- Modify: `apps/web/memo-chat.js`

- [ ] **Step 1: Handle MemoChatResponse action types**

Find the `sendMessage()` function (around line 147). Replace the response handling block (after `sendChatMessageAPI` returns) with:

```javascript
        const apiResponse = await sendChatMessageAPI(content);
        removeTypingIndicator();

        if (apiResponse) {
            // Render the AI message
            const aiMessage = { role: 'assistant', content: apiResponse.content || apiResponse.message };
            state.messages.push(aiMessage);

            // Handle structured actions
            if (apiResponse.action === 'applied') {
                // Auto-applied change (rewrite) — update section and show toast
                renderAIMessage(apiResponse.content || apiResponse.message);
                if (apiResponse.sectionId) {
                    const section = state.sections.find(s => s.id === apiResponse.sectionId);
                    if (section) {
                        pushUndo(section.id, section.content, section.tableData, section.chartConfig);
                        // Refresh section from API
                        await refreshSection(apiResponse.sectionId);
                        showUndoToast('Section updated');
                    }
                }
            } else if (apiResponse.action === 'confirm') {
                // Needs confirmation — show preview with Apply/Discard buttons
                renderConfirmMessage(apiResponse);
            } else {
                // Info only — just show the message
                renderAIMessage(apiResponse.content || apiResponse.message);
            }
        } else {
            // Fallback to simulated response
            const fallback = generateAIResponse(content);
            state.messages.push({ role: 'assistant', content: fallback });
            renderAIMessage(fallback);
        }
```

Add the confirm message renderer and action handlers:

```javascript
function renderConfirmMessage(response) {
    const chatContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex gap-3 max-w-[85%]';

    const preview = response.preview || response.content || '';
    const typeLabel = response.type === 'table' ? 'table' :
                      response.type === 'chart' ? 'chart' :
                      response.type === 'new_section' ? 'new section' : 'content';

    messageDiv.innerHTML = `
        <div class="size-8 rounded-full bg-[#003366] shrink-0 flex items-center justify-center">
            <span class="material-symbols-rounded text-white text-sm">smart_toy</span>
        </div>
        <div class="flex flex-col gap-2">
            <span class="text-xs font-medium text-gray-500">AI Analyst</span>
            <div class="bg-white border border-gray-200 rounded-2xl rounded-tl-none p-4 shadow-sm">
                <p class="text-sm text-gray-800 mb-3">${escapeHtml(response.content || response.message || '')}</p>
                <div class="bg-gray-50 rounded-lg p-3 mb-3 text-xs text-gray-600 border">
                    <span class="font-medium">Proposed ${typeLabel}:</span> ${escapeHtml(preview).slice(0, 200)}${preview.length > 200 ? '...' : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="applyConfirmedAction('${response.sectionId}', ${JSON.stringify(response).replace(/'/g, "\\'")})"
                        class="px-3 py-1.5 text-xs font-medium text-white rounded-lg" style="background-color: #003366">
                        Apply
                    </button>
                    <button onclick="this.closest('.flex.gap-3').querySelector('.bg-gray-50').remove(); this.parentElement.innerHTML = '<span class=\\'text-xs text-gray-400\\'>Discarded</span>'"
                        class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                        Discard
                    </button>
                </div>
            </div>
        </div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function applyConfirmedAction(sectionId, response) {
    if (!state.memo?.id || !sectionId) return;

    const result = await applySectionActionAPI(state.memo.id, sectionId, {
        content: response.preview,
        tableData: response.tableData,
        chartConfig: response.chartConfig,
        insertPosition: response.insertPosition || 'replace',
    });

    if (result) {
        // Save undo state
        pushUndo(sectionId, result.previousContent, result.previousTableData, result.previousChartConfig);
        // Refresh the section in UI
        await refreshSection(sectionId);
        showUndoToast('Section updated');
    }
}

// Make applyConfirmedAction available globally for onclick handlers
window.applyConfirmedAction = applyConfirmedAction;

async function refreshSection(sectionId) {
    // Re-fetch memo to get updated section
    if (state.memo?.id) {
        await loadMemoFromAPI(state.memo.id);
        renderSections();
        renderSidebar();
    }
}

function showUndoToast(message) {
    const existing = document.getElementById('undo-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'undo-toast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#003366] text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-50 text-sm';
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button onclick="handleUndo()" class="underline font-medium hover:text-blue-200">Undo</button>
    `;
    document.body.appendChild(toast);

    setTimeout(() => { toast.remove(); }, 30000);
}

window.handleUndo = async function() {
    const undo = popUndo();
    if (!undo || !state.memo?.id) return;

    await applySectionActionAPI(state.memo.id, undo.sectionId, {
        content: undo.previousContent,
        tableData: undo.previousTableData,
        chartConfig: undo.previousChartConfig,
        insertPosition: 'replace',
    });

    await refreshSection(undo.sectionId);
    const toast = document.getElementById('undo-toast');
    if (toast) toast.remove();
    if (typeof showNotification === 'function') {
        showNotification('Undo', 'Section reverted', 'success');
    }
};
```

Also update `sendChatMessageAPI` call to pass `activeSectionId`:

```javascript
// In sendMessage(), update the API call:
const apiResponse = await sendChatMessageAPI(content, state.activeSection);
```

And update the `sendChatMessageAPI` function in `memo-api.js` to accept and pass `activeSectionId`:

```javascript
async function sendChatMessageAPI(content, activeSectionId) {
    // ... existing code ...
    body: JSON.stringify({
        content,
        activeSectionId: activeSectionId || undefined,
    }),
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/memo-chat.js apps/web/memo-api.js
git commit -m "feat(memo): confirm/apply UX, undo toast, active section in chat"
```

---

## Phase 5: Chart.js Rendering

### Task 12: Add Chart.js Rendering to Sections

**Files:**
- Modify: `apps/web/memo-sections.js`

- [ ] **Step 1: Add renderChart function and update section rendering**

Add the chart rendering function at the top of `memo-sections.js` (after existing functions):

```javascript
// Banker blue palette for all charts
const CHART_PALETTE = {
    primary: '#003366',
    secondary: '#004488',
    tertiary: '#0066AA',
    quaternary: '#3399CC',
    light: '#66BBDD',
    accent: '#E8B931',
    bg: ['#003366', '#004488', '#0066AA', '#3399CC', '#66BBDD', '#E8B931'],
};

/**
 * Render a Chart.js chart from a chartConfig object
 * @param {string} containerId - DOM element ID to render into
 * @param {object} config - Chart config from AI
 * @returns {Chart|null} Chart instance
 */
function renderChart(containerId, config) {
    if (!config || !config.data) return null;

    const container = document.getElementById(containerId);
    if (!container) return null;

    // Create canvas
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'my-4';

    if (config.title) {
        const titleEl = document.createElement('p');
        titleEl.className = 'text-sm font-semibold text-gray-700 mb-2 text-center';
        titleEl.textContent = config.title;
        wrapper.appendChild(titleEl);
    }

    const canvas = document.createElement('canvas');
    canvas.style.maxHeight = '300px';
    wrapper.appendChild(canvas);

    if (config.options?.footnote) {
        const footnote = document.createElement('p');
        footnote.className = 'text-xs text-gray-400 italic mt-1 text-center';
        footnote.textContent = config.options.footnote;
        wrapper.appendChild(footnote);
    }

    container.appendChild(wrapper);

    // Apply palette to datasets that don't have explicit colors
    const datasets = (config.data.datasets || []).map((ds, i) => {
        const defaults = {
            backgroundColor: ds.backgroundColor || CHART_PALETTE.bg[i % CHART_PALETTE.bg.length],
            borderColor: ds.borderColor || CHART_PALETTE.bg[i % CHART_PALETTE.bg.length],
            borderWidth: ds.borderWidth || (ds.type === 'line' ? 2 : 0),
            tension: ds.tension || 0.3,
        };
        return { ...defaults, ...ds };
    });

    // Build Chart.js config
    const chartType = config.options?.horizontal ? 'bar' : (config.type || 'bar');
    const chartConfig = {
        type: chartType,
        data: {
            labels: config.data.labels || [],
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: config.options?.horizontal ? 'y' : 'x',
            plugins: {
                legend: {
                    display: datasets.length > 1,
                    position: 'bottom',
                    labels: { font: { family: 'Inter', size: 11 }, color: '#666' },
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const fmt = config.options?.format;
                            const val = ctx.parsed.y ?? ctx.parsed.x ?? ctx.raw;
                            if (fmt === 'currency') return `${ctx.dataset.label}: $${val}M`;
                            if (fmt === 'percentage') return `${ctx.dataset.label}: ${val}%`;
                            if (fmt === 'multiple') return `${ctx.dataset.label}: ${val}x`;
                            return `${ctx.dataset.label}: ${val}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { family: 'Inter', size: 11 }, color: '#666' },
                    stacked: config.options?.stacked || false,
                },
                y: {
                    grid: { color: '#f0f0f0' },
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#666',
                        callback: function(value) {
                            const fmt = config.options?.format;
                            if (fmt === 'currency') return '$' + value + 'M';
                            if (fmt === 'percentage') return value + '%';
                            if (fmt === 'multiple') return value + 'x';
                            return value;
                        }
                    },
                    stacked: config.options?.stacked || false,
                },
            },
        },
    };

    // Dual axis support
    if (config.options?.dualAxis) {
        chartConfig.options.scales.y1 = {
            position: 'right',
            grid: { display: false },
            ticks: {
                font: { family: 'Inter', size: 11 },
                color: CHART_PALETTE.accent,
                callback: (v) => v + '%',
            },
        };
    }

    try {
        return new Chart(canvas, chartConfig);
    } catch (error) {
        console.error('[Memo] Chart render error:', error);
        container.innerHTML = '<p class="text-xs text-red-400 text-center">Chart rendering failed</p>';
        return null;
    }
}
```

Now update the `renderSection` function to call `renderChart` when `chartConfig` exists. Find where charts are rendered (around lines 30-46 in the existing code) and replace with:

```javascript
// After the table rendering block, add chart rendering:
const chartContainerId = `chart-${section.id}`;
const chartHtml = section.chartConfig ? `<div id="${chartContainerId}" class="my-4"></div>` : '';
```

Include `chartHtml` in the section's HTML template. Then after `renderSections()` calls are done, add a post-render hook:

```javascript
function renderChartsForAllSections() {
    for (const section of state.sections) {
        if (section.chartConfig) {
            const containerId = `chart-${section.id}`;
            renderChart(containerId, section.chartConfig);
        }
    }
}
```

Call `renderChartsForAllSections()` at the end of `renderSections()`.

- [ ] **Step 2: Verify Chart.js is loaded in memo-builder.html**

Check that `memo-builder.html` includes Chart.js. If not, add before closing `</body>`:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/memo-sections.js apps/web/memo-builder.html
git commit -m "feat(memo): Chart.js rendering with banker blue palette"
```

---

## Phase 6: Integration Testing

### Task 13: End-to-End Test

- [ ] **Step 1: Verify TypeScript compiles with all changes**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Test memo generation pipeline locally**

```bash
cd apps/api && node --import tsx -e "
import { generateAllSections } from './src/services/agents/memoAgent/index.js';

async function test() {
  console.log('Testing memo generation...');
  const { sections, context } = await generateAllSections(
    'fbe388f4-73e4-4954-9b8b-b7979ba12f0e', // Use a real dealId from your DB
    'test-org'
  );
  console.log('Generated', sections.length, 'sections');
  for (const s of sections) {
    console.log(' ', s.type, ':', s.aiGenerated ? 'AI' : 'placeholder', '-', s.content.slice(0, 80));
  }
}
test();
"
```

Expected: 12 sections generated (some may be placeholders if deal has no financial data)

- [ ] **Step 3: Test memo chat agent locally**

```bash
cd apps/api && node --import tsx -e "
import { runMemoChatAgent } from './src/services/agents/memoAgent/index.js';

async function test() {
  const result = await runMemoChatAgent({
    memoId: 'test-memo',
    dealId: 'fbe388f4-73e4-4954-9b8b-b7979ba12f0e',
    orgId: 'test-org',
    message: 'Rewrite the executive summary in a more formal tone',
    activeSectionId: 'test-section',
  });
  console.log('Model:', result.model);
  console.log('Action:', result.action);
  console.log('Response:', result.message.slice(0, 200));
}
test();
"
```

Expected: Response with `model: 'gpt-4o (ReAct agent)'` and some action

- [ ] **Step 4: Start dev servers and test in browser**

```bash
# Terminal 1
cd apps/api && npm run dev

# Terminal 2
cd apps/web && npm run dev
```

Test flow:
1. Navigate to a deal page
2. Click "Create Memo" (or go to `/memo-builder?dealId=xxx&new=true`)
3. Verify generation overlay appears
4. Verify sections populate with real AI-generated content
5. Click a section in sidebar → verify it becomes active
6. Type in AI chat "Make this more formal" → verify rewrite auto-applies
7. Type "Add an EBITDA bridge table" → verify confirm buttons appear
8. Click Apply → verify section updates with table
9. Click Undo → verify section reverts
10. Click Export to PDF → verify charts render in PDF

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(memo): full memo builder wiring — generation pipeline, ReAct agent, Chart.js"
```

---

## Summary

| Phase | Tasks | Key Deliverable |
|-------|-------|----------------|
| **1. Context + Prompts** | Tasks 1-3 | `buildMemoContext()`, 12 section prompts, `generateAllSections()` pipeline |
| **2. Chat Agent** | Tasks 4-5 | 10 closure-bound tools, `runMemoChatAgent()` ReAct agent |
| **3. API Routes** | Tasks 6-8 | Auto-generate on create, ReAct chat endpoint, section apply endpoint |
| **4. Frontend** | Tasks 9-11 | API functions, generation overlay, confirm/apply UX, undo toasts |
| **5. Charts** | Task 12 | Chart.js rendering with banker blue palette |
| **6. Testing** | Task 13 | End-to-end verification |
