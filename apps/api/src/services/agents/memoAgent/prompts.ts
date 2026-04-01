// Memo Agent — Section Prompts and Template Definitions
// PE-quality prompts for Investment Committee memo generation

export const MEMO_SYSTEM_PROMPT = `You are a senior private equity analyst at a top-tier PE firm with 10+ years of experience writing Investment Committee (IC) memos. Your memos are rigorous, data-driven, and actionable.

## Formatting Rules
- Financial figures: always in $M (e.g., "$42.3M revenue", "$8.1M EBITDA")
- Percentages: one decimal place (e.g., "18.4% EBITDA margin")
- Fiscal year labels: use "FY2022", "FY2023", etc. (not "Year 1", "Year 2")
- Growth rates: "YoY" for year-over-year, "CAGR" for compound annual
- Multiples: one decimal place with "x" suffix (e.g., "7.5x EV/EBITDA")
- Negative values: use parentheses — ($2.1M) — not minus sign
- HTML formatting: use <strong> for key metrics, <em> for emphasis, <ul>/<li> for lists, <table> for structured data
- Section headers: use <h3> tags
- Highlight critical findings in <strong> tags
- Use <span class="highlight-positive"> for positive signals and <span class="highlight-negative"> for risks
- Never fabricate data. If data is missing or unavailable, write "[Data needed: description of what is required]"
- Write in third-person professional tone ("The Company", "Management", "The Target")
- Cite source documents when referencing specific figures (e.g., "(per FY2023 CIM)")`;

export const MEMO_CHAT_SYSTEM_PROMPT = `You are an AI assistant embedded in a PE deal management platform, helping analysts build Investment Committee memos. You have access to the following tools:

- **get_deal_info**: Retrieve deal metadata, status, and basic information
- **get_financial_statements**: Fetch extracted financial data (income statement, balance sheet, cash flow)
- **search_documents**: Search VDR documents for specific information
- **get_analysis**: Retrieve PE analysis results (QoE, ratios, red flags, benchmarks)
- **update_memo_section**: Write or update a specific memo section
- **get_memo_sections**: Retrieve the current state of all memo sections
- **add_memo_comment**: Add a comment or annotation to a section

## Behavior Rules

### Confirm before acting (hybrid mode):
- Before calling **update_memo_section** with substantial new content, briefly describe what you will write and ask for confirmation
- Before **deleting** or **replacing** existing section content, always confirm
- For minor edits (fixing typos, updating a single figure), auto-apply without confirmation

### Auto-apply without asking:
- Fetching data (get_deal_info, get_financial_statements, search_documents, get_analysis)
- Reading current memo state (get_memo_sections)
- Adding comments (add_memo_comment)

## Response Style
- Be concise in your chat responses — save the detail for the memo sections themselves
- When you write memo content, use proper PE memo language (see formatting rules)
- Banker Blue palette: primary #003366, accent #004488, highlight #E8F0F8
- When data is missing, proactively suggest what documents or inputs are needed
- If asked to "draft" or "write" a section, proceed with drafting (confirm first for long sections)
- Always tell the user what you did after completing an action`;

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

export interface SectionPromptConfig {
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
    prompt: `Write a concise Executive Summary for this Investment Committee memo. The summary should be 3-5 paragraphs covering:

1. **Transaction Overview**: Brief description of the company, deal type (buyout/growth/add-on), proposed entry valuation, and ownership structure post-close
2. **Investment Thesis**: The 2-3 core reasons this is an attractive investment opportunity (lead with the strongest signal)
3. **Key Financial Metrics**: LTM revenue, LTM EBITDA, EBITDA margin, revenue growth rate, and proposed entry multiple
4. **Critical Risks**: The 1-2 most significant risks and how they are mitigated
5. **Recommendation**: Clear BUY / PASS / CONDITIONAL recommendation with one-line rationale

Format as HTML with <strong> tags on key metrics. Use "[Data needed: ...]" for any missing figures. Do not exceed 400 words.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: false,
    includeChartConfig: false,
  },

  COMPANY_OVERVIEW: {
    title: 'Company Overview',
    prompt: `Write a Company Overview section for this IC memo. Cover:

1. **Business Description**: What the company does, its primary products/services, and core value proposition (2-3 sentences)
2. **History & Milestones**: Key inflection points — founding year, major pivots, acquisitions, leadership changes
3. **Revenue Model**: How the company generates revenue (subscription, transactional, project-based, etc.), pricing structure, and revenue mix by segment/product
4. **Customer Profile**: Who buys from the company, concentration (top 10 customers as % of revenue), typical contract length, and retention/churn rates
5. **Geographic Footprint**: Where the company operates, revenue by geography if applicable
6. **Headcount & Org Structure**: Total employees, key hires, and any notable organizational gaps

Format with <h3> subheadings for each area. Use "[Data needed: ...]" for missing information. Write in third-person ("The Company", "Management").`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  FINANCIAL_PERFORMANCE: {
    title: 'Financial Performance',
    prompt: `Write a Financial Performance section and return a JSON response with the following structure:

{
  "content": "<HTML string with the narrative analysis>",
  "tableData": {
    "headers": ["Metric", "FY2021", "FY2022", "FY2023", "LTM"],
    "rows": [
      ["Revenue ($M)", "...", "...", "...", "..."],
      ["Revenue Growth (%)", "...", "...", "...", "..."],
      ["Gross Profit ($M)", "...", "...", "...", "..."],
      ["Gross Margin (%)", "...", "...", "...", "..."],
      ["EBITDA ($M)", "...", "...", "...", "..."],
      ["EBITDA Margin (%)", "...", "...", "...", "..."],
      ["Net Income ($M)", "...", "...", "...", "..."],
      ["CapEx ($M)", "...", "...", "...", "..."],
      ["Free Cash Flow ($M)", "...", "...", "...", "..."]
    ]
  },
  "chartConfig": {
    "type": "bar",
    "title": "Revenue & EBITDA Trend",
    "xAxis": ["FY2021", "FY2022", "FY2023", "LTM"],
    "datasets": [
      {
        "label": "Revenue ($M)",
        "type": "bar",
        "data": [],
        "yAxisID": "y"
      },
      {
        "label": "EBITDA Margin (%)",
        "type": "line",
        "data": [],
        "yAxisID": "y1"
      }
    ],
    "yAxes": {
      "y": { "label": "$ Millions", "position": "left" },
      "y1": { "label": "Margin %", "position": "right" }
    }
  }
}

The content HTML should cover:
- Revenue trajectory and growth drivers (organic vs. acquired)
- Margin profile and key drivers of margin expansion/compression
- EBITDA quality — any one-time items, add-backs, or non-recurring adjustments
- Cash flow conversion (FCF as % of EBITDA)
- Working capital dynamics and CapEx intensity
- Any seasonality or cyclicality patterns

Use "[Data needed: ...]" for missing figures. Always use $M and FY labels.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: true,
    includeChartConfig: true,
  },

  QUALITY_OF_EARNINGS: {
    title: 'Quality of Earnings',
    prompt: `Write a Quality of Earnings (QoE) section for this IC memo. This is a critical diligence section — be rigorous and skeptical.

Cover:
1. **Revenue Quality**: Recurring vs. non-recurring revenue breakdown, customer concentration risk, contract terms and renewal rates, any pull-forward revenue or channel stuffing concerns
2. **EBITDA Add-backs Analysis**: List each proposed add-back, its dollar value, and your assessment of its legitimacy. Flag any aggressive add-backs.
3. **Adjusted EBITDA Bridge**: Walk from reported EBITDA to adjusted EBITDA, showing each add-back line item
4. **Accounting Policies**: Revenue recognition method, any recent changes in accounting treatment, deferred revenue trends
5. **Working Capital Normalization**: Identify any working capital manipulation (e.g., stretching payables, accelerating collections pre-close)
6. **QoE Score**: Provide an overall quality score — High / Medium / Low — with one-sentence rationale

Format with <h3> subheadings. Flag any concerns in <span class="highlight-negative"> tags. Use "[Data needed: ...]" for missing data. Never fabricate add-back amounts.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  MARKET_DYNAMICS: {
    title: 'Market Dynamics',
    prompt: `Write a Market Dynamics section for this IC memo. Cover:

1. **Total Addressable Market (TAM)**: Market size in $B, growth rate (CAGR), and source. If market data is unavailable, note "[Data needed: market research report or industry sizing]"
2. **Market Segmentation**: How the market is segmented (by geography, vertical, customer size, etc.) and the company's target segment(s)
3. **Growth Drivers**: The 3-5 primary structural tailwinds driving market expansion (e.g., regulatory changes, technology adoption, demographic shifts)
4. **Market Headwinds**: Any structural challenges or cyclical headwinds the market faces
5. **Market Maturity**: Is this an early/growth/mature/declining market? What stage of the S-curve?
6. **Pricing Dynamics**: Pricing power in the market, commodity vs. differentiated pricing, inflation pass-through ability
7. **Regulatory Environment**: Key regulations affecting the market, pending regulatory changes, compliance costs

Use data from the deal documents where available. Use "[Data needed: ...]" for missing market data. Format with <h3> subheadings and <ul>/<li> for lists of drivers/headwinds.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  COMPETITIVE_LANDSCAPE: {
    title: 'Competitive Landscape',
    prompt: `Write a Competitive Landscape section for this IC memo. Cover:

1. **Competitive Set**: Identify the 4-6 most relevant direct competitors. For each, note: company name, approximate revenue/size, ownership (public/PE-backed/private), and primary competitive differentiator
2. **Market Share**: The company's estimated market share and how it compares to key competitors
3. **Competitive Advantages (Moat Analysis)**:
   - Switching costs (how sticky are customers?)
   - Network effects (does value increase with scale?)
   - Proprietary technology or IP
   - Brand and reputation
   - Cost advantages (scale, location, process)
   - Regulatory moats (licenses, certifications)
4. **Competitive Threats**: Emerging competitors, threat of substitution, new entrant risk
5. **Positioning**: How the company is positioned (cost leader / differentiator / niche specialist) and whether that positioning is defensible
6. **Win/Loss Dynamics**: Any data on competitive win rates, reasons for losses, switching trends

Format with <h3> subheadings. Use <strong> on the company's key moats. Use "[Data needed: ...]" for missing competitive data.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  MANAGEMENT_ASSESSMENT: {
    title: 'Management Assessment',
    prompt: `Write a Management Assessment section for this IC memo. This section evaluates the leadership team's ability to execute the value creation plan.

Cover:
1. **Leadership Team Overview**: CEO, CFO, COO, and other C-suite. For each key executive: name, tenure at company, relevant prior experience, and any notable gaps in background
2. **Track Record**: Management's historical execution — have they hit their own projections? Any prior exits or value creation events?
3. **Management Depth**: Bench strength below C-suite. Are key functions well-staffed? Any single points of failure?
4. **Cultural Assessment**: What is the company culture? Is it performance-driven? Any culture concerns surfaced in diligence?
5. **Rollover & Alignment**: What percentage of proceeds is management rolling over? Are incentives aligned with PE ownership goals?
6. **Key Man Risk**: Identify any individuals whose departure would be materially damaging and mitigation plan
7. **PE Experience**: Has management worked with PE sponsors before? Any concerns about PE ownership dynamics?
8. **Assessment Rating**: Strong / Adequate / Concerns — with one-sentence rationale

Format with <h3> subheadings. Highlight concerns in <span class="highlight-negative">. Use "[Data needed: ...]" for missing management information.`,
    requiresFinancials: false,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  OPERATIONAL_DEEP_DIVE: {
    title: 'Operational Deep Dive',
    prompt: `Write an Operational Deep Dive section for this IC memo. Cover the operational engine of the business in detail.

Cover:
1. **Business Model Mechanics**: Step-by-step description of how the company delivers its product/service (supply chain, production, delivery, support)
2. **Unit Economics**: Key unit-level metrics — CAC, LTV, LTV/CAC ratio, payback period, average contract value, churn rate
3. **Capacity & Scalability**: Current utilization rates, capacity constraints, ability to scale without proportional cost increases
4. **Technology & Systems**: Core technology stack, ERP/CRM systems, proprietary vs. third-party tech, tech debt concerns
5. **Supplier & Vendor Risk**: Key suppliers, concentration risk, any sole-source dependencies
6. **Operational KPIs**: The 4-6 most important operational metrics the company tracks and their trend
7. **Quick Wins**: Operational improvements achievable within 12-18 months post-close (low-hanging fruit)
8. **Strategic Initiatives**: Longer-term operational transformations required to achieve the investment thesis

Use specific numbers where available. Use "[Data needed: ...]" for missing operational data. Format with <h3> subheadings and <ul>/<li> for lists.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: false,
    includeChartConfig: false,
  },

  RISK_ASSESSMENT: {
    title: 'Risk Assessment',
    prompt: `Write a Risk Assessment section and return a JSON response with the following structure:

{
  "content": "<HTML narrative overview of the risk profile>",
  "tableData": {
    "headers": ["Risk", "Category", "Severity", "Likelihood", "Mitigation"],
    "rows": [
      ["<risk name>", "<Financial|Operational|Market|Regulatory|Management|Macro>", "<High|Medium|Low>", "<High|Medium|Low>", "<mitigation strategy>"],
      ...
    ]
  }
}

Identify 8-12 key risks across these categories:
- **Financial Risks**: Leverage ratio, interest rate exposure, covenant risk, refinancing risk
- **Operational Risks**: Customer concentration, key man dependency, supply chain, technology
- **Market Risks**: Competitive disruption, market cyclicality, pricing pressure, end-market decline
- **Regulatory Risks**: Compliance costs, pending legislation, licensing requirements
- **Management Risks**: Leadership turnover, integration risk (if M&A), cultural mismatch
- **Macro Risks**: Inflation, recession sensitivity, FX exposure

For Severity and Likelihood, use: High / Medium / Low
The narrative content should summarize the overall risk profile and call out the 2-3 most critical risks.

Use "[Data needed: ...]" for risks that cannot be assessed without additional information. Never understate risks to make the deal look better.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  VALUE_CREATION_PLAN: {
    title: 'Value Creation Plan',
    prompt: `Write a Value Creation Plan section for this IC memo. This is the operational roadmap for generating returns.

Cover:
1. **Thesis Pillars**: The 3-4 primary value creation levers (e.g., revenue growth, margin expansion, multiple arbitrage, buy-and-build). For each:
   - Description of the initiative
   - Target financial impact (in $M EBITDA or revenue)
   - Timeline (Year 1 / Year 2-3 / Year 3-5)
   - Key milestones and dependencies
   - Who owns execution (management / sponsor / both)

2. **Revenue Initiatives**:
   - Organic growth (pricing, volume, new products)
   - New market expansion
   - M&A / add-on acquisition strategy (target profile, pipeline if known)

3. **Margin Improvement**:
   - Gross margin expansion opportunities
   - G&A leverage and cost rationalization
   - Procurement and supply chain savings

4. **EBITDA Bridge to Exit**: Walk from entry EBITDA to projected exit EBITDA, showing contribution of each initiative

5. **100-Day Plan Highlights**: The most critical actions in the first 100 days post-close

Format with <h3> subheadings. Use <strong> for dollar impact figures. Be realistic — flag initiatives as "Upside" vs. "Base Case" where appropriate. Use "[Data needed: ...]" for missing data.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: false,
    includeChartConfig: false,
  },

  DEAL_STRUCTURE: {
    title: 'Deal Structure',
    prompt: `Write a Deal Structure section and return a JSON response with the following structure:

{
  "content": "<HTML narrative covering deal terms, valuation rationale, and financing structure>",
  "tableData": {
    "headers": ["Sources", "Amount ($M)", "% of Total", "Uses", "Amount ($M)", "% of Total"],
    "rows": [
      ["Senior Debt", "...", "...", "Purchase Price", "...", "..."],
      ["Mezzanine / Sub Debt", "...", "...", "Transaction Fees", "...", "..."],
      ["Sponsor Equity", "...", "...", "Working Capital Adjustment", "...", "..."],
      ["Management Rollover", "...", "...", "", "", ""],
      ["Total Sources", "...", "100%", "Total Uses", "...", "100%"]
    ]
  }
}

The narrative content should cover:
1. **Valuation**: Entry EV, equity value, EBITDA multiple, revenue multiple, and how they compare to comparable transactions and public comps
2. **Financing Structure**: Senior debt (amount, turns of leverage, terms, lender), mezzanine/second lien (if applicable), equity check
3. **Pro Forma Leverage**: Entry leverage ratio (Debt/EBITDA), interest coverage ratio, and whether covenant headroom is adequate
4. **Key Deal Terms**: Any reps & warranties, earnouts, escrows, working capital peg, or other notable terms
5. **Valuation Justification**: Why the entry multiple is appropriate given growth profile, margin, and comparables

Use "[Data needed: ...]" for unknown financing terms. Never fabricate purchase price or debt amounts.`,
    requiresFinancials: true,
    requiresDocuments: true,
    includeTableData: true,
    includeChartConfig: false,
  },

  EXIT_ANALYSIS: {
    title: 'Exit Analysis',
    prompt: `Write an Exit Analysis section and return a JSON response with the following structure:

{
  "content": "<HTML narrative covering exit strategy, paths, and return analysis>",
  "tableData": {
    "headers": ["Exit Year", "Exit Multiple", "Exit EBITDA ($M)", "Exit EV ($M)", "Equity Value ($M)", "MOIC", "IRR"],
    "rows": [
      ["Year 3", "Bear (6.0x)", "...", "...", "...", "...", "..."],
      ["Year 3", "Base (7.5x)", "...", "...", "...", "...", "..."],
      ["Year 3", "Bull (9.0x)", "...", "...", "...", "...", "..."],
      ["Year 5", "Bear (6.0x)", "...", "...", "...", "...", "..."],
      ["Year 5", "Base (7.5x)", "...", "...", "...", "...", "..."],
      ["Year 5", "Bull (9.0x)", "...", "...", "...", "...", "..."]
    ]
  },
  "chartConfig": {
    "type": "bar",
    "title": "Returns Sensitivity — MOIC by Exit Scenario",
    "xAxis": ["Y3 Bear", "Y3 Base", "Y3 Bull", "Y5 Bear", "Y5 Base", "Y5 Bull"],
    "datasets": [
      {
        "label": "MOIC",
        "type": "bar",
        "data": [],
        "backgroundColor": ["#cc4444", "#003366", "#2a7a2a", "#cc4444", "#003366", "#2a7a2a"]
      }
    ],
    "yAxes": {
      "y": { "label": "MOIC (x)", "position": "left" }
    }
  }
}

The narrative content should cover:
1. **Exit Strategy**: Most likely exit path (strategic sale, secondary buyout, IPO) and rationale
2. **Potential Acquirers**: 4-6 strategic or financial buyers who would likely bid (with brief rationale for each)
3. **Exit Multiple Rationale**: Why the assumed exit multiple range is appropriate (current market comps, sector trends)
4. **Return Sensitivities**: Base case return summary (MOIC and IRR) and what drives returns (EBITDA growth vs. leverage vs. multiple expansion)
5. **Return Drivers Attribution**: % of returns from: (a) EBITDA growth, (b) multiple expansion, (c) debt paydown
6. **Downside Protection**: Minimum return in bear case and key downside protections

Use "[Data needed: entry equity check, debt schedule]" for missing LBO model inputs. IRR and MOIC calculations require full capital structure data.`,
    requiresFinancials: true,
    requiresDocuments: false,
    includeTableData: true,
    includeChartConfig: true,
  },
};

export function getSectionPrompt(sectionType: SectionType): SectionPromptConfig {
  return SECTION_PROMPTS[sectionType];
}

// Template presets — predefined section orderings for common memo types

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

export const STANDARD_IC_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'MARKET_DYNAMICS',
  'RISK_ASSESSMENT',
  'DEAL_STRUCTURE',
];

export const SEARCH_FUND_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'QUALITY_OF_EARNINGS',
  'MARKET_DYNAMICS',
  'MANAGEMENT_ASSESSMENT',
  'OPERATIONAL_DEEP_DIVE',
  'RISK_ASSESSMENT',
  'EXIT_ANALYSIS',
];

export const SCREENING_NOTE_SECTIONS: SectionType[] = [
  'EXECUTIVE_SUMMARY',
  'COMPANY_OVERVIEW',
  'FINANCIAL_PERFORMANCE',
  'MARKET_DYNAMICS',
  'RISK_ASSESSMENT',
];
