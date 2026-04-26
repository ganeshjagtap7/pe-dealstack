// Shared types + helpers for the global AI Assistant FAB/drawer.

export type ContextType = "deal" | "dashboard" | "contacts" | "deals" | "memo" | "general";

export interface ChatContext {
  type: ContextType;
  dealId?: string;
  dealName?: string;
}

export interface ChatMessage {
  role: "assistant" | "user";
  content: string;
}

export interface ChatResponse {
  response?: string;
  message?: string;
  reply?: string;
  content?: string;
  error?: string;
}

export interface SuggestedPrompt {
  icon: string;
  label: string;
  prompt: string;
}

// ── Context detection ────────────────────────────────────────────────────────

/** Detect chat context purely from pathname + already-known params/dealId. */
export function detectContext(
  pathname: string,
  params?: Record<string, string | string[] | undefined>,
): ChatContext {
  // /deals/[id] — deal detail page
  const dealMatch = pathname.match(/^\/deals\/([^/]+)$/);
  if (dealMatch && dealMatch[1] !== "new") {
    const id =
      typeof params?.id === "string"
        ? params.id
        : Array.isArray(params?.id)
          ? params.id[0]
          : dealMatch[1];
    return { type: "deal", dealId: id };
  }
  // Treat `/` as the portfolio dashboard so the assistant has useful context
  // even before the user navigates to /dashboard.
  if (pathname === "/" || pathname.startsWith("/dashboard")) return { type: "dashboard" };
  if (pathname.startsWith("/contacts")) return { type: "contacts" };
  if (pathname.startsWith("/memo-builder")) return { type: "memo" };
  if (pathname.startsWith("/deals")) return { type: "deals" };
  return { type: "general" };
}

// ── Context-derived UI strings ───────────────────────────────────────────────

export function getContextIcon(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return "work";
    case "dashboard": return "dashboard";
    case "contacts": return "groups";
    case "deals": return "filter_alt";
    case "memo": return "description";
    default: return "auto_awesome";
  }
}

export function getContextLabel(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return ctx.dealName || "Deal";
    case "dashboard": return "Portfolio";
    case "contacts": return "Contacts";
    case "deals": return "Deal Pipeline";
    case "memo": return "Memo";
    default: return "General";
  }
}

export function getPlaceholder(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal": return `Ask about ${ctx.dealName || "this deal"}...`;
    case "dashboard": return "Ask about your portfolio...";
    case "contacts": return "Ask about relationships...";
    case "deals": return "Ask about your deal pipeline...";
    case "memo": return "Ask about this memo...";
    default: return "Ask AI anything...";
  }
}

export function getWelcomeMessage(ctx: ChatContext): string {
  switch (ctx.type) {
    case "deal":
      return `I have full context on **${ctx.dealName || "this deal"}** — financials, documents, team, and activity. What would you like to know?`;
    case "dashboard":
      return "I can help you analyze your portfolio, spot trends, and surface insights across all your deals. What would you like to explore?";
    case "contacts":
      return "I can help with relationship insights, suggest follow-ups, and analyze your network. What do you need?";
    case "deals":
      return "I can help analyze your deal pipeline, compare deals, and identify patterns. What are you looking for?";
    case "memo":
      return "I can help draft, refine, and review your investment memo. What section do you want to work on?";
    default:
      return "Hi! I'm your AI assistant. Ask me anything about your deals, portfolio, or contacts.";
  }
}

// ── Per-context suggested prompt chips (3-4 each) ────────────────────────────

const PROMPTS_BY_CONTEXT: Record<ContextType, SuggestedPrompt[]> = {
  deal: [
    { icon: "warning", label: "Key risks & red flags", prompt: "What are the biggest risks and red flags for this deal? Pull specific data points from the documents." },
    { icon: "analytics", label: "Financial health check", prompt: "Analyze the financial health of this company. What do revenue, margins, and cash flow tell us?" },
    { icon: "lightbulb", label: "Investment thesis", prompt: "Write a 3-paragraph investment thesis covering: why it's attractive, value-creation levers, and key risks with mitigants." },
    { icon: "checklist", label: "DD questions", prompt: "Generate 10 targeted due diligence questions for management, organized by category (financial, operational, legal, commercial)." },
  ],
  dashboard: [
    { icon: "trending_up", label: "Top performers", prompt: "Which deals in my portfolio are performing best right now? Compare returns and growth across the active deals." },
    { icon: "warning", label: "Portfolio risks", prompt: "What are the biggest risks across my portfolio? Surface concentration risk, sector exposure, and underperformers." },
    { icon: "speed", label: "Pipeline velocity", prompt: "How is my deal pipeline moving? Show me stage conversion rates and where deals are stuck." },
    { icon: "summarize", label: "Weekly summary", prompt: "Give me a one-page summary of portfolio activity this week: new deals, stage changes, and notable updates." },
  ],
  deals: [
    { icon: "filter_alt", label: "Compare top deals", prompt: "Compare my top 5 active deals side-by-side on revenue, EBITDA, valuation, and stage." },
    { icon: "warning", label: "Stuck deals", prompt: "Which deals have been in the same stage for too long? Suggest next steps for each." },
    { icon: "search", label: "Deals by sector", prompt: "Group my pipeline by industry and show me where I'm most concentrated." },
    { icon: "schedule", label: "Upcoming actions", prompt: "What deal-related actions need attention this week? List by urgency." },
  ],
  contacts: [
    { icon: "person_add", label: "Suggest follow-ups", prompt: "Which contacts should I follow up with this week? Prioritize warm relationships I haven't touched recently." },
    { icon: "hub", label: "Network insights", prompt: "Analyze my network. Who are my strongest connections, and where are the gaps?" },
    { icon: "diversity_3", label: "Intro opportunities", prompt: "Suggest valuable introductions I could make between people in my network." },
    { icon: "contact_mail", label: "Draft outreach", prompt: "Help me draft a warm outreach email to a key contact. Ask me who and what the context is." },
  ],
  memo: [
    { icon: "edit_note", label: "Improve writing", prompt: "Review the current memo section and tighten the writing — more concise, more specific, more punchy." },
    { icon: "fact_check", label: "Sanity-check facts", prompt: "Sanity-check the figures and claims in this memo. Flag anything that looks inconsistent or unsupported." },
    { icon: "format_list_bulleted", label: "Outline section", prompt: "Help me outline the next section of this memo with key bullet points and supporting data." },
    { icon: "compare_arrows", label: "Counterargument", prompt: "Make the strongest counterargument against the investment thesis in this memo. What would a skeptic say?" },
  ],
  general: [
    { icon: "tips_and_updates", label: "What can you do?", prompt: "What kinds of questions can you help me with across deals, portfolio, contacts, and memos?" },
    { icon: "search", label: "Find a deal", prompt: "Help me find a deal — I'll describe what I'm looking for and you suggest matches in my pipeline." },
    { icon: "school", label: "PE concept primer", prompt: "Explain a PE concept I should know better. Ask me which one." },
    { icon: "auto_awesome", label: "Quick brainstorm", prompt: "I want to brainstorm something. Help me think it through step by step." },
  ],
};

export function getSuggestedPrompts(ctx: ChatContext): SuggestedPrompt[] {
  return PROMPTS_BY_CONTEXT[ctx.type] ?? PROMPTS_BY_CONTEXT.general;
}
