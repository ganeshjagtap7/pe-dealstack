// Result builders + filter logic for the CommandPalette.
// Extracted from CommandPalette.tsx so the parent module stays under the
// 500-line cap.

import { NAV_ITEMS } from "@/lib/constants";
import type { Deal } from "@/types";
import {
  ContactRow, PaletteAction, PaletteResult,
  PAGE_KEYWORDS, formatStage, matchesQuery,
} from "./CommandPalette.types";

// ---------------------------------------------------------------------------
// Pages — filter NAV_ITEMS by role + drop dividers/empty hrefs.
// ---------------------------------------------------------------------------
export function buildPages({
  isAdmin, isMember,
}: { isAdmin: boolean; isMember: boolean }): PaletteResult[] {
  return NAV_ITEMS.filter((item) => {
    if (item.divider || !item.href) return false;
    if (item.adminOnly && !isAdmin) return false;
    if (item.memberOnly && !isMember) return false;
    return true;
  }).map((item) => ({
    kind: "page" as const,
    id: item.id,
    label: item.label,
    href: item.href!,
    icon: item.icon,
    // Per-page keyword synonyms (PAGE_KEYWORDS) ported from legacy so
    // searches like "pipeline", "vdr", "memo" still match relevant pages.
    keywords: `${item.label} ${item.id} ${PAGE_KEYWORDS[item.id] ?? ""}`.toLowerCase(),
  }));
}

// ---------------------------------------------------------------------------
// Actions — filter by role.
// ---------------------------------------------------------------------------
export function buildActions(
  paletteActions: PaletteAction[],
  isMember: boolean,
): PaletteResult[] {
  return paletteActions
    .filter((a) => !a.memberOnly || isMember)
    .map((a) => ({
      kind: "action" as const,
      label: a.label,
      href: a.href,
      icon: a.icon,
      keywords: a.keywords,
    }));
}

// ---------------------------------------------------------------------------
// Result builders for individual items.
// ---------------------------------------------------------------------------
export function dealToResult(d: Deal): PaletteResult {
  return {
    kind: "deal",
    id: d.id,
    label: d.name,
    href: `/deals/${d.id}`,
    icon: "work",
    sub: [d.industry, formatStage(d.stage)].filter(Boolean).join(" · "),
    keywords: `${d.name} ${d.industry ?? ""} ${formatStage(d.stage)}`.toLowerCase(),
  };
}

export function contactToResult(c: ContactRow): PaletteResult {
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || "Unnamed";
  return {
    kind: "contact",
    id: c.id,
    label: name,
    href: `/contacts#detail-${c.id}`,
    icon: "person",
    sub: [c.title, c.company].filter(Boolean).join(" · "),
    keywords: `${name} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Combined result list, filtered by query.
// - Empty query: pages + 5 recent deals + actions (preview).
// - With query: pages + ALL deals + ALL contacts + actions, filtered.
// Capped at 12 to keep the list readable (matches legacy).
// ---------------------------------------------------------------------------
export function buildResults({
  query, pages, actions, recentDeals, allDeals, allContacts,
}: {
  query: string;
  pages: PaletteResult[];
  actions: PaletteResult[];
  recentDeals: Deal[];
  allDeals: Deal[];
  allContacts: ContactRow[];
}): PaletteResult[] {
  const trimmed = query.trim();

  if (!trimmed) {
    const recent = recentDeals.map(dealToResult);
    return [...pages, ...recent, ...actions];
  }

  const dealResults = allDeals.map(dealToResult);
  const contactResults = allContacts.map(contactToResult);
  const haystack = (r: PaletteResult) =>
    `${r.label} ${r.kind === "page" || r.kind === "action" ? r.keywords : `${r.sub} ${r.keywords}`}`;

  return [...pages, ...dealResults, ...contactResults, ...actions]
    .filter((r) => matchesQuery(haystack(r), trimmed))
    .slice(0, 12);
}
