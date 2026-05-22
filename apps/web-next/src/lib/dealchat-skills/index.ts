// ---------------------------------------------------------------------------
// dealchat-skills — Phase 0/1
//
// Slash-command "skill" registry for the deal chat. Each skill exposes a
// `buildPrompt(deal)` that returns a single, self-contained question the
// existing LangChain ReAct agent (apps/api) can answer with its 14 tools.
//
// Prompts are intentionally verbose and explicit: section headers, citation
// requirements, "do not fabricate" guardrails. They mirror the quality bar
// set by `buildSuggestionPrompts` in deal-tabs-suggestions.tsx — and raise
// it. The agent's system prompt already enforces the Financial Data
// Protocol; these prompts repeat the key constraint so each skill is
// usable in isolation (and survives any future agent prompt churn).
//
// `requires` advertises optional preconditions for the menu UI to surface
// a hint when the current deal doesn't satisfy them ("needs financials").
// It does NOT block invocation — the user can always send the prompt.
// ---------------------------------------------------------------------------

import type { DealDetail } from "@/app/(app)/deals/[id]/components";

// Re-export the canonical type under the name the spec uses, so consumers
// can `import type { Deal } from "@/lib/dealchat-skills"` without having
// to know it lives next to the chat UI.
export type Deal = DealDetail;

export type SkillCategory = "memo" | "risk" | "research" | "analysis" | "visual";

export interface SkillRequirements {
  financials?: boolean;
  documents?: boolean;
  sector?: boolean;
}

export interface Skill {
  id: string;
  command: string;
  label: string;
  description: string;
  category: SkillCategory;
  requires?: SkillRequirements;
  buildPrompt: (deal: Deal) => string;
}

// ---------------------------------------------------------------------------
// Helpers — keep prompts DRY without sacrificing self-containment.
// ---------------------------------------------------------------------------

function nameOf(deal: Deal): string {
  return deal.companyName || deal.name || "this company";
}

function industryOf(deal: Deal): string | null {
  return deal.industry?.trim() ? deal.industry : null;
}

const CITATION_REMINDER =
  "Every numeric claim must cite its source (tool name + period, e.g., `get_deal_financials FY2024`). If a data point is not available from the tools, state that explicitly — DO NOT fabricate numbers, ranges, or document references.";

// Unit-handling reminder injected into every numeric skill. Financial values
// returned by `get_deal_financials` can be stored at any scale (K/M/B/raw);
// the row's `unit` field (or table header) is the source of truth. Assuming
// millions when the row is actually in thousands shipped six bug reports —
// A3, B2, B8, C1, C2 — so every numeric prompt now repeats this guardrail.
const UNIT_REMINDER =
  "When citing numerical values, ALWAYS use the unit that `get_deal_financials` returns (look for the `unit` field on each row or the table header — it may be K, M, or B). Do NOT assume millions. If a row's unit is `K`, render the value as `$6.9K`, not `$6.9M`. Preserve the row's currency too.";

// Unit-handling reminder specific to chart skills — the `generate_chart` tool
// renders the y-axis with whatever unit suffix the producer sets (default M),
// so emitting a chart without a `unit` field for raw-dollar values yields the
// $0.0M-on-every-tick bug. Every chart skill repeats this so each prompt is
// usable in isolation.
const CHART_UNIT_REMINDER = [
  "UNIT FIELD ON THE CHART SPEC (required):",
  "- Read the unitScale from `get_deal_financials` output (look for `[scale: ACTUALS]`, `[scale: THOUSANDS]`, `[scale: MILLIONS]`, `[scale: BILLIONS]` in the markdown).",
  "- When calling `generate_chart`, you MUST set the `unit` field to match: ACTUALS -> 'units', THOUSANDS -> 'K', MILLIONS -> 'M', BILLIONS -> 'B'. Do not omit it.",
  "- Skipping `unit` defaults the y-axis to millions; raw-dollar series then render as $0.0M on every tick.",
  "- For percentage / margin / growth-rate charts, set `unit: 'units'` (no currency suffix is applied — the axis is unitless).",
].join("\n");

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const icMemo: Skill = {
  id: "ic-memo",
  command: "/ic-memo",
  label: "Investment Committee memo",
  description: "Full IC-grade memo with thesis, financials, risks, and recommendation.",
  category: "memo",
  requires: { financials: true, documents: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal);
    const industryClause = industry ? ` in the ${industry} sector` : "";
    return [
      `Draft a full Investment Committee memo for ${name}${industryClause}. Minimum 600 words. Use the exact section headers below, in this order:`,
      "",
      "## Executive Summary",
      "A 4-6 sentence overview: what the company does, deal size/structure if known, headline financials, and a one-line recommendation.",
      "",
      "## Target Overview",
      `Business model, products/services, end markets, geographic footprint, and key customers. Pull what you can from \`search_documents\` and \`get_deal_documents\`. Cite the source document name for non-obvious claims.`,
      "",
      "## Investment Thesis",
      "Exactly three numbered pillars. Each pillar: a bolded one-line claim, followed by 2-3 supporting sentences with specific evidence (financial metric or document quote).",
      "",
      "## Financial Performance",
      `Use \`get_deal_financials\` to cite revenue, EBITDA, gross margin, and growth rate for the latest 2-3 periods. Format as a small markdown table. Call out any trend (acceleration/deceleration, margin expansion/compression) and tie it back to commentary in the documents (via \`search_documents\`).`,
      "",
      "## Key Risks",
      "List 4-6 risks. For EACH risk: a one-line description, the specific document or financial line that surfaced it (cite via `search_documents` result), and a proposed mitigant. Group risks as: Commercial / Financial / Operational / Legal-Regulatory.",
      "",
      "## Valuation Framing",
      "Use `compare_deals` if comparables exist. Provide an EV/EBITDA range, an EV/Revenue range, and the implied enterprise value at the midpoint. If no comps are available, say so and outline 3 reference points an analyst should source externally.",
      "",
      "## Recommended Next Steps",
      "A bulleted list of 5-8 concrete diligence actions, each tied to a specific gap identified above.",
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
      `If \`get_deal_financials\` returns nothing, write the Financial Performance section as "Financial extraction has not completed for this deal — required inputs: [list]." and continue with the rest of the memo.`,
    ].join("\n");
  },
};

const qoeFlags: Skill = {
  id: "qoe-flags",
  command: "/qoe-flags",
  label: "QoE red flags",
  description: "Quality of Earnings red flags grouped by category with severity.",
  category: "risk",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    return [
      `Identify Quality of Earnings (QoE) red flags for ${name}. Pull data from \`get_analysis_summary\` AND \`get_deal_financials\`. Cross-reference \`search_documents\` for any narrative that supports or contradicts the numbers.`,
      "",
      "Format as a bulleted list, grouped by these EXACT category headers (in this order):",
      "",
      "### Revenue Quality",
      "### EBITDA Adjustments",
      "### Working Capital",
      "### Cash Conversion",
      "### Accounting Hygiene",
      "",
      "For EACH bullet:",
      "- Start with a severity emoji prefix: 🔴 critical (deal-breaker or material misstatement risk), 🟡 diligence (needs confirmatory work), or 🟢 standard (note for the file).",
      "- State the flag in one sentence.",
      "- Cite the document basis (document name + section/page if available) OR the financial line item + period.",
      `- One-line "why it matters" rationale.`,
      "",
      "Example bullet:",
      "- 🔴 **Revenue growth outpaces AR growth by 40pp in FY24** — `get_deal_financials FY2023-FY2024` shows revenue +28%, AR +68%. Indicates potential channel-stuffing or extended payment terms. Confirm via aged AR detail.",
      "",
      `If a category has no flags, write "No flags identified in available data." under that header — do not invent issues.`,
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
    ].join("\n");
  },
};

const mgmtQa: Skill = {
  id: "mgmt-qa",
  command: "/mgmt-qa",
  label: "Management Q&A prep",
  description: "20 sector-aware management questions across four buckets.",
  category: "analysis",
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal);
    const industryClause = industry
      ? `Tailor every question to the ${industry} sector — generic questions are not useful here.`
      : "Use whatever sector signal you can extract from `search_documents` and `get_deal_documents` to keep questions specific. If sector is truly unknown, note that at the top and proceed with the best inference.";
    return [
      `Generate 20 management-call questions for ${name}. Exactly 5 questions per bucket, in this order:`,
      "",
      "## Strategy & Vision",
      "## Financial Performance & Drivers",
      "## Operational & Org",
      "## Market & Competitive",
      "",
      industryClause,
      "",
      `CRITICAL: Every question must reference something specific about THIS deal — a financial line item (cite \`get_deal_financials\`), a document insight (cite \`search_documents\`), or a known fact about ${name}. Examples of what NOT to do:`,
      `- ❌ "What is your growth strategy?"`,
      `- ✅ "Your FY24 revenue of $X grew 12% vs. a 28% three-year CAGR — what changed in FY24, and what's the recovery plan for FY25?"`,
      "",
      "Each question is numbered (1-5 within each bucket) and one paragraph, with the citation in backticks.",
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
    ].join("\n");
  },
};

const compBench: Skill = {
  id: "comp-bench",
  command: "/comp-bench",
  label: "Comparables benchmark",
  description: "Markdown comp table plus out/under/in-line commentary.",
  category: "analysis",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal);
    return [
      `Build a comparables benchmark for ${name}${industry ? ` (${industry})` : ""}. Use the \`compare_deals\` tool to pull a comp set.`,
      "",
      "## Comp Table",
      "Render a markdown table with these columns: Company | Revenue (latest period) | EBITDA Margin | Revenue Growth (YoY) | EV/EBITDA (if available). Include the target as the first row and bold its name.",
      "",
      "## Commentary",
      "Three paragraphs, in this order — each titled with a bolded lead-in:",
      "- **Where the target out-performs**: name 1-3 metrics where the target beats the comp median and quote both values.",
      "- **Where the target under-performs**: same, but the other direction.",
      "- **Where the target is in line**: highlight metrics within ~10% of the comp median.",
      "",
      `If \`compare_deals\` returns an empty set, state that no comparable deals were found in the firm's database, and suggest exactly 3 external search terms the analyst could use (industry + size band + geography) to source comps manually. Do not invent comparable companies.`,
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
    ].join("\n");
  },
};

const onePager: Skill = {
  id: "one-pager",
  command: "/one-pager",
  label: "One-pager brief",
  description: "Tight ~250-word brief: snapshot, thesis, financials, risks, asks.",
  category: "memo",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    return [
      `Produce a strict ~250-word one-pager for ${name}. Total length MUST be between 220 and 280 words. Use these exact section headers and formats:`,
      "",
      "## Snapshot",
      "Four KPIs as a single line each, formatted `**Metric:** value (period, source)`. Pull from `get_deal_financials` / `get_analysis_summary`. Pick the four most decision-relevant KPIs (typically: revenue, EBITDA margin, growth rate, cash conversion).",
      "",
      "## Thesis",
      "Exactly 3 bullets. Each ≤ 25 words. State the thesis pillar and one supporting metric or document fact.",
      "",
      "## Financial Highlights",
      "Exactly 5 bullets. Each ≤ 20 words. Numeric and cited.",
      "",
      "## Top 3 Risks",
      "Exactly 3 bullets. Each ≤ 20 words. Severity emoji prefix (🔴 / 🟡 / 🟢).",
      "",
      "## Asks",
      "Bulleted list of what the deal team needs to advance — data, intros, approvals. ≤ 5 items.",
      "",
      "No rambling. No intro paragraph. No closing sign-off.",
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
    ].join("\n");
  },
};

const ddChecklist: Skill = {
  id: "dd-checklist",
  command: "/dd-checklist",
  label: "Sector-specific DD checklist",
  description: "Concrete diligence items tailored to the deal's sector.",
  category: "analysis",
  requires: { sector: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal);
    if (!industry) {
      return [
        `A sector-specific DD checklist needs the deal's industry. ${name} has no industry on file.`,
        "",
        "First, ask the user: 'What sector should this checklist be tailored to?' and stop. Do not produce a generic checklist — that defeats the purpose of this command.",
      ].join("\n");
    }
    return [
      `Generate a due diligence checklist for ${name} tailored to the ${industry} sector. Use these four bucket headers in this order:`,
      "",
      "## Commercial",
      "## Financial",
      "## Legal & Regulatory",
      "## Tech & Operations",
      "",
      "Each bucket: approximately 8 concrete items as a checkbox list (`- [ ] ...`). CRITICAL — every item must be specific, not generic. Compare:",
      `- ❌ "Review revenue concentration."`,
      `- ✅ "Validate whether the $4.2M FY24 enterprise revenue includes the Q4 one-time true-up disclosed in the Aug-2025 board deck."`,
      "",
      `Use \`get_deal_financials\`, \`search_documents\`, and \`get_deal_documents\` to seed each item with a specific deal fact, document name, or financial line. If a bucket has fewer than 5 deal-specific items available, include the most relevant ${industry}-standard items to reach 8 — but flag them with "[sector-standard]" so the analyst knows they're not driven by deal data.`,
      "",
      CITATION_REMINDER,
      UNIT_REMINDER,
    ].join("\n");
  },
};

const newsScan: Skill = {
  id: "news-scan",
  command: "/news-scan",
  label: "News scan (target + domain)",
  description: "Top news about the target first; domain context only if target is quiet.",
  category: "research",
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal);
    return [
      // COST DISCIPLINE: each web_search costs 1 credit. Default to ONE
      // target query. Only run the SECOND domain query when the target
      // signal is too thin to fill the brief on its own. Never run a
      // domain query "just in case".
      `Surface news on ${name} with target-first relevance. The \`web_search\` tool costs credits per call — run AT MOST 2 calls.`,
      "",
      `QUERY 1 (target — always run): \`web_search({ query: "${name}${industry ? ` ${industry}` : ""}", topic: "news", max_results: 10 })\`. Including the industry in the query helps disambiguate same-name namesakes. NO recency filter — small/private companies may not have anything in a 90-day window; we want the top headlines whatever their date.`,
      "",
      industry
        ? `QUERY 2 (domain — ONLY run if QUERY 1 returned FEWER THAN 2 target-matched items after filtering): \`web_search({ query: "${industry} industry news", topic: "news", max_results: 6 })\`. This is a contextual top-up, NOT a parallel news source — domain items should NEVER outnumber target items in the final output. If QUERY 1 produced 2+ target hits, SKIP this query entirely.`
        : `QUERY 2 (domain): SKIP — this deal has no \`industry\` tag set. Note in your reply that the industry field is unset and recommend the user fill it in.`,
      "",
      "Filtering (apply BEFORE writing the output):",
      `- Target items MUST name ${name} directly in the title or snippet (not a same-name competitor or an unrelated entity that happens to share the name).`,
      "- DROP any result that is product documentation, evergreen marketing pages, Trustpilot/G2 reviews, directory listings, generic SEO content, or AI-generated comparison fluff.",
      "- Domain items are kept only if they describe a discrete, dated event (funding climate shift, M&A activity, regulatory change, pricing dynamic, demand inflection, competitive move).",
      "",
      "Output structure:",
      "",
      `## Top news for ${name}`,
      "(All target-matched items, most-recent first. Lead with the most material event — funding, acquisition, executive change, customer win, lawsuit — even if it's older than a typical 90-day news window.)",
      "",
      industry
        ? `## ${industry} — domain context`
        : "## Domain context",
      "(ONLY include this section if it ADDs to the brief beyond the target items. Cap at 3 items. If QUERY 2 wasn't run or returned nothing material, OMIT this section entirely — do NOT pad with industry items to make the output look longer.)",
      "",
      "For EVERY item:",
      "- One-sentence summary.",
      "- **Provide a clickable link.** Cite as `[Source — YYYY-MM-DD](URL)`. The URL is mandatory; never cite a source without its link.",
      `- One-line "so what" for the deal team.`,
      "",
      `If QUERY 1 returns NOTHING target-matched after filtering, write under the target header: "No direct press coverage surfaced for ${name} in the news index. For private/small companies this is expected." Do NOT fabricate target headlines to fill the gap. If QUERY 2 then surfaces useful domain items, include them as context — but make it explicit that the target itself has no recent press.`,
      "",
      `If both queries return nothing usable, write: "No material news identified in target or domain searches. Recommend the deal team check LinkedIn, Crunchbase, and industry newsletters directly." List the queries you ran so the analyst can verify.`,
      "",
      `If the \`web_search\` tool returns "Web search is not configured" or "Search failed: ..." on the first call, do NOT retry — say so explicitly and recommend a manual search. Do not fabricate headlines or URLs.`,
      "",
      CITATION_REMINDER,
    ].join("\n");
  },
};

const competitorScan: Skill = {
  id: "competitor-scan",
  command: "/competitor-scan",
  label: "Competitive landscape",
  description: "Top 5 competitors plus landscape commentary; requires web_search.",
  category: "research",
  requires: { sector: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    const industry = industryOf(deal) || "the target's";
    return [
      // COST DISCIPLINE: each web_search costs 1 credit. Default to ONE
      // query. Only escalate to a second if the first returned fewer than
      // 3 distinct competitors. Never run 3 just to fill the cap.
      `Map ${name}'s competitive landscape. The \`web_search\` tool costs credits per call — run ONE query first and only escalate if it returned fewer than 3 distinct competitors.`,
      "",
      `PRIMARY QUERY: \`web_search({ query: "best ${industry} companies competitors comparison", topic: "general", max_results: 10 })\` — comparison/listicle phrasing surfaces comp sets fastest.`,
      "",
      `ESCALATION (only if PRIMARY returned <3 distinct competitor names): one additional call with \`query: "${name} vs alternatives", topic: "general", max_results: 10\`. Do NOT escalate beyond this.`,
      "",
      "## Top 5 Competitors",
      "For EACH (list however many surface — don't pad with weak names):",
      "- **Name** (with linked source `[Source — YYYY-MM-DD](URL)`)",
      "- **Positioning**: one sentence on how they compete (price, segment, geography, tech).",
      "- **Scale**: revenue band or employee count, with the source cited if known.",
      "- **Recent strategic move**: most recent newsworthy action in the last 12 months (write \"not findable\" if you can't source one — don't fabricate).",
      "",
      "## Landscape Commentary",
      "Two paragraphs:",
      `1. **Structural dynamics** — fragmentation, consolidation, who's winning share and why. Tie back to specific competitors above.`,
      `2. **Where ${name} fits** — based on \`search_documents\` / \`get_deal_documents\`, position ${name} against the comp set: differentiators, gaps, the most threatening competitor and why.`,
      "",
      `If the \`web_search\` tool is unavailable, say so explicitly and recommend a manual search — do not fabricate competitors. If fewer than 5 credible competitors surface, list only what you have and propose 3 manual sources (G2 category page, Capterra alternatives, specific subreddit) the analyst can check.`,
      "",
      CITATION_REMINDER,
    ].join("\n");
  },
};

// ---------------------------------------------------------------------------
// Visual skills (Phase 3) — each invokes the `generate_chart` tool so the
// chart renders inline in the chat bubble. Prompts are explicit about
// which data source to read (get_deal_financials / compare_deals) and
// fall back to deal-record summary fields when extraction is empty so the
// analyst always gets a chart instead of a refusal.
// ---------------------------------------------------------------------------

// Bug guard (DMpro): the agent was reading "Found N financial statements
// (0 active, N pending review)" or single-period payloads as "empty" and
// refusing to render. The prompts below now say explicitly that ANY
// statement count > 0 — including 100% pending-review and including a
// single period — IS available data and the agent must call
// generate_chart instead of falling back to summary fields.
const chartRevenue: Skill = {
  id: "chart-revenue",
  command: "/chart-revenue",
  label: "Revenue trend chart",
  description: "Line/bar chart of revenue across all available periods.",
  category: "visual",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    return [
      `**MANDATORY: This is a chart command. You MUST call the \`generate_chart\` tool. Substituting a prose answer is a bug.** The only exception is the no-data block path at the bottom of this prompt.`,
      "",
      `Use \`get_deal_financials\` to retrieve revenue for ${name} across all available periods, then call \`generate_chart\` with a chart titled "Revenue trend" showing period on X and revenue on Y. Prefer a line chart when 2+ periods are available; use a single-bar chart when only one data point exists. Pass y-values at the SAME scale as the source row's unitScale (do not pre-convert) and set the spec's \`unit\` field to match — see the unit-field block below.`,
      "",
      "Render the chart with WHATEVER data is available — 1, 2, or 10 periods are all valid. The analyst wants the visual; do not skip the chart because the series is short.",
      "",
      `"Available data" rules (do NOT misread these as empty):`,
      `- If \`get_deal_financials\` returns any line that says "Found N financial statements" with N >= 1, the deal HAS extracted financials. Use them — even when the breakdown shows "0 active, N pending review" or "(pending merge review)". Pending-review statements are real, extracted data; they're just queued for a duplicate-resolution UI step.`,
      `- A single period is still data. Render a single-bar chart from it.`,
      `- Treat a monthly-only period set the same as an annual one. Chart the monthly points directly; do not require an FY rollup.`,
      "",
      `If \`get_deal_financials\` returns LITERALLY "No financial statements extracted for this deal yet." or "Error fetching financial data.", check the deal record's summary fields (revenue / cachedRevenue) for ${name}. If those have values, render a single-bar chart from them and label the chart caption as "Deal Record summary field — single LTM/snapshot value, not a time series".`,
      "",
      "Below the chart, write a 2-sentence commentary on the trend (direction, magnitude, any inflection). If only one data point was available, prefix the commentary with `Limited data (1 period)` so the analyst sees the caveat.",
      "",
      "**NO-DATA PATH (RED BANNER — ONLY IF ALL ELSE FAILS):** If both `get_deal_financials` AND the deal record yielded zero numeric revenue values, emit a fenced ```nodata block instead of prose:",
      "",
      "```nodata",
      `Cannot render revenue trend for ${name}: no extracted financial statements and no cached revenue on the deal record.`,
      "",
      "Next step: upload a P&L or financial statement, then re-run /chart-revenue.",
      "```",
      "",
      "Do NOT use prose for the no-data case. The ```nodata block renders as a red banner on the analyst's screen; a paragraph does not.",
      "",
      CHART_UNIT_REMINDER,
      "",
      CITATION_REMINDER,
    ].join("\n");
  },
};

const chartMargin: Skill = {
  id: "chart-margin",
  command: "/chart-margin",
  label: "Margin trajectory chart",
  description: "Chart of gross and EBITDA margins over time (or snapshot).",
  category: "visual",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    return [
      `**MANDATORY: This is a chart command. You MUST call the \`generate_chart\` tool. Substituting a prose answer is a bug.** The only exception is the no-data block path at the bottom.`,
      "",
      `Use \`get_deal_financials\` for ${name} to pull all available periods (target 6+, but use whatever is returned). Call \`generate_chart\` with a chart titled "Gross & EBITDA margins". When 2+ periods are available, render a line chart with TWO series (gross_margin, ebitda_margin) on the Y axis (%) and period on X. When only one period (or only a single computed snapshot) is available, render a bar chart with one bar per metric. Margins are PERCENTAGES — set the spec's \`unit\` field to \`"%"\` (not \`"units"\`) so the axis labels render as \`12.5%\` / \`-30.6%\` instead of \`$12.5\` / \`-$30.6\`. Pass y-values as the percent number itself (e.g., 12.5 for 12.5%, NOT 0.125).`,
      "",
      "Render the chart with WHATEVER data is available — 1, 2, or more periods are all valid. Do not skip the chart because the series is short.",
      "",
      `"Available data" rules (do NOT misread these as empty):`,
      `- If \`get_deal_financials\` returns any line that says "Found N financial statements" with N >= 1, the deal HAS extracted financials. Use them — even when the breakdown shows "0 active, N pending review" or "(pending merge review)".`,
      `- A single period is still data. Render a bar chart from it.`,
      `- Monthly periods count too — chart them directly.`,
      "",
      `If \`get_deal_financials\` returns LITERALLY "No financial statements extracted for this deal yet." or "Error fetching financial data.", check the deal record's summary fields (revenue / cachedRevenue, ebitda / cachedEbitda) for ${name}. If those exist, compute snapshot EBITDA margin (ebitda / revenue) and render a single-bar chart. Label the caption as "Deal Record summary field — single LTM/snapshot value, not a time series".`,
      "",
      "Below the chart, write a 2-3 sentence commentary on margin trajectory — flag any compression or expansion and tie it back to a specific period. If only one data point was available, prefix the commentary with `Limited data (1 period)`.",
      "",
      "**NO-DATA PATH (RED BANNER — ONLY IF ALL ELSE FAILS):** If both `get_deal_financials` AND the deal record yielded zero usable margin data, emit a fenced ```nodata block instead of prose:",
      "",
      "```nodata",
      `Cannot render margin trajectory for ${name}: no extracted financial statements and no cached revenue/EBITDA on the deal record.`,
      "",
      "Next step: upload a P&L, then re-run /chart-margin.",
      "```",
      "",
      "Do NOT use prose for the no-data case. The ```nodata block renders as a red banner; a paragraph does not.",
      "",
      CHART_UNIT_REMINDER,
      "",
      CITATION_REMINDER,
    ].join("\n");
  },
};

const chartCompMults: Skill = {
  id: "chart-comp-mults",
  command: "/chart-comp-mults",
  label: "Comparable EV/EBITDA chart",
  description: "Bar chart of EV/EBITDA across the comparable set (or target snapshot).",
  category: "visual",
  requires: { financials: true },
  buildPrompt: (deal) => {
    const name = nameOf(deal);
    return [
      `**MANDATORY: This is a chart command. You MUST call the \`generate_chart\` tool. Substituting a prose answer is a bug.** The only exception is the no-data block path at the bottom.`,
      "",
      `Use \`compare_deals\` to get comparable EV/EBITDA multiples for ${name} (if available). Call \`generate_chart\` with a bar chart titled "EV/EBITDA — comparable set" with company on X and multiple on Y. EV/EBITDA values are MULTIPLES (e.g., 8.5 = 8.5x) — set the spec's \`unit\` field to \`"x"\` (not \`"units"\`) so the y-axis renders \`8.5x\` instead of \`$8.5\`. Pass y-values as the multiple itself (e.g., 8.5 for 8.5x).`,
      "",
      "Render the chart with WHATEVER data is available — even 1 or 2 comparables (plus the target) is a valid visual.",
      "",
      `If \`compare_deals\` returns no comparables, render a chart from the target itself: use the deal record's revenue / cachedRevenue and ebitda / cachedEbitda for ${name} as a 2-bar chart ("Revenue" and "EBITDA"). Cached revenue / EBITDA are in ACTUAL DOLLARS — set the spec's \`unit\` field to \`"units"\` when emitting that fallback chart. Label the source as "Deal Record summary field — target only, no comparable set available".`,
      "",
      `Highlight the target company (${name}) by name in your commentary below the chart — call out whether it trades at a premium, discount, or in line with the comp median when comps exist, or note "Limited data (target only)" if no comps were available.`,
      "",
      "**NO-DATA PATH (RED BANNER — ONLY IF ALL ELSE FAILS):** If `compare_deals` returns nothing AND the deal record has no revenue/EBITDA values, emit a fenced ```nodata block instead of prose:",
      "",
      "```nodata",
      `Cannot render EV/EBITDA chart for ${name}: no comparable deals in the portfolio and no cached revenue/EBITDA on the deal record.`,
      "",
      "Next step: add comparable deals to the portfolio, or upload financials so the target snapshot can be charted.",
      "```",
      "",
      "Do NOT use prose for the no-data case. The ```nodata block renders as a red banner; a paragraph does not.",
      "",
      CHART_UNIT_REMINDER,
      "",
      CITATION_REMINDER,
    ].join("\n");
  },
};

// ---------------------------------------------------------------------------
// Registry + filter
// ---------------------------------------------------------------------------

export const SKILLS: Skill[] = [
  icMemo,
  qoeFlags,
  mgmtQa,
  compBench,
  onePager,
  ddChecklist,
  newsScan,
  competitorScan,
  chartRevenue,
  chartMargin,
  chartCompMults,
];

export function filterSkills(query: string): Skill[] {
  const q = query.trim().toLowerCase();
  if (!q) return SKILLS;
  return SKILLS.filter((s) => {
    // Match against the command WITHOUT the leading slash too — the menu
    // is rendered when the textarea starts with `/`, and the typical
    // caller slices that off before passing the query in. Matching both
    // forms makes filterSkills robust to either caller convention.
    const cmd = s.command.toLowerCase();
    const cmdNoSlash = cmd.startsWith("/") ? cmd.slice(1) : cmd;
    return (
      cmd.includes(q) ||
      cmdNoSlash.includes(q) ||
      s.label.toLowerCase().includes(q)
    );
  });
}

// ---------------------------------------------------------------------------
// Skill-command parser — used by the chat submit path to detect when the
// user typed a known command and may have appended free-form context after
// it. Returns the matched skill and any trailing text (trimmed). The match
// is anchored: the command must appear at the start of the input,
// followed by either end-of-string OR whitespace. This lets us safely
// distinguish `/ic-memo` from `/ic-memo-v2` (hypothetical future skill).
// ---------------------------------------------------------------------------

export function findSkillCommand(input: string): { skill: Skill; extra: string } | null {
  const trimmed = input.trimStart();
  for (const skill of SKILLS) {
    if (trimmed === skill.command) {
      return { skill, extra: "" };
    }
    if (
      trimmed.startsWith(skill.command + " ") ||
      trimmed.startsWith(skill.command + "\n") ||
      trimmed.startsWith(skill.command + "\t")
    ) {
      return { skill, extra: trimmed.slice(skill.command.length).trim() };
    }
  }
  return null;
}

/**
 * Expand a chat input that begins with a known skill command into the full
 * agent-facing prompt. If `extra` text follows the command, it's appended as
 * an "Additional context from analyst" block so the agent treats it as a
 * user steering signal on top of the skill's structured request.
 * Returns the raw input unchanged when no command matches.
 */
export function expandChatInput(input: string, deal: Deal | null): string {
  if (!deal) return input;
  const match = findSkillCommand(input);
  if (!match) return input;
  const base = match.skill.buildPrompt(deal);
  if (!match.extra) return base;
  return `${base}\n\n---\n**Additional context from the analyst:**\n${match.extra}`;
}

// ---------------------------------------------------------------------------
// Requirement check — used by the menu UI to show "needs financials" hints.
// Returns the list of unmet requirement labels (empty if all satisfied).
// ---------------------------------------------------------------------------

export function unmetRequirements(skill: Skill, deal: Deal | null): string[] {
  if (!skill.requires || !deal) return [];
  const unmet: string[] = [];
  const r = skill.requires;
  if (r.financials) {
    const hasFinancials =
      deal.cachedRevenue != null ||
      deal.cachedEbitda != null ||
      deal.revenue != null ||
      deal.ebitda != null;
    if (!hasFinancials) unmet.push("needs financials");
  }
  if (r.documents) {
    if (!deal.documents || deal.documents.length === 0) unmet.push("needs documents");
  }
  if (r.sector) {
    if (!deal.industry || !deal.industry.trim()) unmet.push("needs sector");
  }
  return unmet;
}
