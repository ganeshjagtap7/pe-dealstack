// Type and constant definitions for the CommandPalette.
// Extracted from CommandPalette.tsx so the parent module stays under the
// 500-line cap.

import { STAGE_LABELS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Static action shortcuts — broader than NAV_ITEMS (verbs, not destinations).
// ---------------------------------------------------------------------------

export interface PaletteAction {
  label: string;
  href: string;
  icon: string;
  keywords: string;
  /** Visibility rule: hide for users without member-level access. */
  memberOnly?: boolean;
}

// Sentinel href used to signal "open the deal-intake modal" instead of routing.
// Intercepted in selectResult() in CommandPalette.tsx — never actually
// navigated to.
export const ACTION_OPEN_DEAL_INTAKE = "modal:deal-intake";

export const PALETTE_ACTIONS: PaletteAction[] = [
  { label: "Create New Deal",      href: ACTION_OPEN_DEAL_INTAKE, icon: "add_circle",   keywords: "new deal create intake ingest", memberOnly: true },
  { label: "Open Data Room",       href: "/data-room",    icon: "folder_open",  keywords: "vdr documents files data room" },
  { label: "Generate AI Report",   href: "/memo-builder", icon: "auto_awesome", keywords: "memo ic report ai generate investment", memberOnly: true },
  { label: "Open Settings",        href: "/settings",     icon: "settings",     keywords: "profile preferences account settings" },
];

// Per-page keyword expansion (mirrors commandPalette.js PAGES).
// Lets queries like "pipeline" or "vdr" match Deals / Data Room.
export const PAGE_KEYWORDS: Record<string, string> = {
  dashboard: "home overview",
  deals: "pipeline crm",
  "data-room": "vdr documents files",
  crm: "crm people network contacts",
  admin: "tasks team users",
  "ai-reports": "memo ic report ai investment",
};

// ---------------------------------------------------------------------------
// Contact API row (matches /api/contacts response shape).
// ---------------------------------------------------------------------------
export interface ContactRow {
  id: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Result discriminated union — used so renderer can switch on .kind.
// ---------------------------------------------------------------------------

export type PaletteResult =
  | { kind: "page"; id: string; label: string; href: string; icon: string; keywords: string }
  | { kind: "deal"; id: string; label: string; href: string; icon: string; sub: string; keywords: string }
  | { kind: "contact"; id: string; label: string; href: string; icon: string; sub: string; keywords: string }
  | { kind: "action"; label: string; href: string; icon: string; keywords: string };

// ---------------------------------------------------------------------------
// Shared substring matcher — AND-of-words across haystack (mirrors legacy).
// ---------------------------------------------------------------------------

export function matchesQuery(haystack: string, query: string): boolean {
  const lower = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .every((word) => lower.includes(word));
}

export function formatStage(stage: string | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] || stage;
}

// ---------------------------------------------------------------------------
// Group rendering helpers
// ---------------------------------------------------------------------------

export const GROUP_ICON_STYLES: Record<PaletteResult["kind"], { bg: string; color: string }> = {
  page:    { bg: "#E6EEF5", color: "#003366" },
  deal:    { bg: "#DBEAFE", color: "#1D4ED8" },
  contact: { bg: "#FCE7F3", color: "#BE185D" },
  action:  { bg: "#FEF3C7", color: "#D97706" },
};

// Group label varies for deals: "Recent Deals" when showing the lazy
// 5-deal preview on empty query, plain "Deals" once the user types.
export const GROUP_LABELS: Record<PaletteResult["kind"], string> = {
  page:    "Pages",
  deal:    "Deals",
  contact: "Contacts",
  action:  "Actions",
};

// Render order — Pages first, then Deals, then Contacts, then Actions.
export const GROUP_ORDER: PaletteResult["kind"][] = ["page", "deal", "contact", "action"];
