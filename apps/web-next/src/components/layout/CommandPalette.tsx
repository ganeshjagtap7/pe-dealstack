"use client";

// ---------------------------------------------------------------------------
// CommandPalette — Cmd+K spotlight overlay for quick navigation.
// Ported from apps/web/js/commandPalette.js. The legacy palette listed Pages,
// Deals, and Contacts — the web-next port restructures into Pages, Recent
// Deals, and Actions (broader navigation). Per-result search continues to use
// case-insensitive AND-of-words substring match across label + keywords.
//
// This component is mounted once at the (app) layout root so the keyboard
// listener and modal portal are available across every authenticated page.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api, NotFoundError } from "@/lib/api";
import { NAV_ITEMS, STAGE_LABELS } from "@/lib/constants";
import { useUser } from "@/providers/UserProvider";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// Static action shortcuts — broader than NAV_ITEMS (verbs, not destinations).
// ---------------------------------------------------------------------------

interface PaletteAction {
  label: string;
  href: string;
  icon: string;
  keywords: string;
  /** Visibility rule: hide for users without member-level access. */
  memberOnly?: boolean;
}

const PALETTE_ACTIONS: PaletteAction[] = [
  { label: "Create New Deal",      href: "/deal-intake",  icon: "add_circle",   keywords: "new deal create intake ingest", memberOnly: true },
  { label: "Open Data Room",       href: "/data-room",    icon: "folder_open",  keywords: "vdr documents files data room" },
  { label: "Generate AI Report",   href: "/memo-builder", icon: "auto_awesome", keywords: "memo ic report ai generate investment", memberOnly: true },
  { label: "Open Settings",        href: "/settings",     icon: "settings",     keywords: "profile preferences account settings" },
];

// ---------------------------------------------------------------------------
// Result discriminated union — used so renderer can switch on .kind.
// ---------------------------------------------------------------------------

type PaletteResult =
  | { kind: "page"; id: string; label: string; href: string; icon: string; keywords: string }
  | { kind: "deal"; id: string; label: string; href: string; icon: string; sub: string }
  | { kind: "action"; label: string; href: string; icon: string; keywords: string };

// ---------------------------------------------------------------------------
// Shared substring matcher — AND-of-words across haystack (mirrors legacy).
// ---------------------------------------------------------------------------

function matchesQuery(haystack: string, query: string): boolean {
  const lower = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .every((word) => lower.includes(word));
}

function formatStage(stage: string | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] || stage;
}

// ---------------------------------------------------------------------------
// Group rendering helpers
// ---------------------------------------------------------------------------

const GROUP_ICON_STYLES: Record<PaletteResult["kind"], { bg: string; color: string }> = {
  page:   { bg: "#E6EEF5", color: "#003366" },
  deal:   { bg: "#DBEAFE", color: "#1D4ED8" },
  action: { bg: "#FEF3C7", color: "#D97706" },
};

const GROUP_LABELS: Record<PaletteResult["kind"], string> = {
  page:   "Pages",
  deal:   "Recent Deals",
  action: "Actions",
};

// Render order — Pages first, then Recent Deals, then Actions.
const GROUP_ORDER: PaletteResult["kind"][] = ["page", "deal", "action"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const router = useRouter();
  const { user } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentDeals, setRecentDeals] = useState<Deal[]>([]);
  const dealsFetchedRef = useRef(false);

  // -----------------------------------------------------------------------
  // Visibility filters — match Sidebar role gating exactly.
  // -----------------------------------------------------------------------
  const isAdmin = user?.systemRole === "ADMIN";
  const isMember = user?.systemRole === "ADMIN" || user?.systemRole === "MEMBER";

  // -----------------------------------------------------------------------
  // Pages — filter NAV_ITEMS by role + drop dividers/empty hrefs.
  // -----------------------------------------------------------------------
  const pages = useMemo<PaletteResult[]>(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.divider || !item.href) return false;
      if (item.adminOnly && !isAdmin) return false;
      if (item.memberOnly && !isMember) return false;
      return true;
    }).map((item) => ({
      kind: "page" as const,
      id: item.id,
      label: item.label,
      href: item.href,
      icon: item.icon,
      // Lightweight keyword expansion so common synonyms (e.g. "crm",
      // "pipeline") still match relevant pages.
      keywords: `${item.label} ${item.id}`.toLowerCase(),
    }));
  }, [isAdmin, isMember]);

  // -----------------------------------------------------------------------
  // Actions — filter by role.
  // -----------------------------------------------------------------------
  const actions = useMemo<PaletteResult[]>(() => {
    return PALETTE_ACTIONS.filter((a) => !a.memberOnly || isMember).map((a) => ({
      kind: "action" as const,
      label: a.label,
      href: a.href,
      icon: a.icon,
      keywords: a.keywords,
    }));
  }, [isMember]);

  // -----------------------------------------------------------------------
  // Recent deals — fetched once on first open. Fall back gracefully on any
  // error (matches legacy "silent" behaviour).
  // -----------------------------------------------------------------------
  const fetchRecentDeals = useCallback(async () => {
    if (dealsFetchedRef.current) return;
    dealsFetchedRef.current = true;
    try {
      const data = await api.get<Deal[] | { deals: Deal[] }>(
        "/deals?sortBy=updatedAt&sortOrder=desc&limit=5",
      );
      const list = Array.isArray(data) ? data : (data?.deals ?? []);
      setRecentDeals(list.slice(0, 5));
    } catch (err) {
      // Endpoint not deployed yet or transient error — stay empty.
      if (!(err instanceof NotFoundError)) {
        console.warn("[CommandPalette] /deals fetch failed:", err);
      }
    }
  }, []);

  const recentDealResults = useMemo<PaletteResult[]>(() => {
    return recentDeals.map((d) => ({
      kind: "deal" as const,
      id: d.id,
      label: d.name,
      href: `/deals/${d.id}`,
      icon: "work",
      sub: [d.industry, formatStage(d.stage)].filter(Boolean).join(" · "),
    }));
  }, [recentDeals]);

  // -----------------------------------------------------------------------
  // Combined results — empty query shows all groups; with query, filter by
  // label + sub + keywords. Cap at 12 results to keep the list readable.
  // -----------------------------------------------------------------------
  const results = useMemo<PaletteResult[]>(() => {
    const all = [...pages, ...recentDealResults, ...actions];
    const trimmed = query.trim();
    if (!trimmed) return all;

    return all
      .filter((r) => {
        const haystack =
          r.kind === "deal"
            ? `${r.label} ${r.sub}`
            : `${r.label} ${r.keywords}`;
        return matchesQuery(haystack, trimmed);
      })
      .slice(0, 12);
  }, [pages, recentDealResults, actions, query]);

  // -----------------------------------------------------------------------
  // Open / close helpers — the modal's open state is tracked here so the
  // global keydown listener can toggle without re-attaching.
  // -----------------------------------------------------------------------
  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    fetchRecentDeals();
  }, [fetchRecentDeals]);

  const closePalette = useCallback(() => {
    setOpen(false);
  }, []);

  // -----------------------------------------------------------------------
  // Global Cmd/Ctrl+K + Escape listener — registered on capture phase with
  // stopImmediatePropagation so existing Header.tsx Cmd+K listener (which
  // opens GlobalSearchModal) is suppressed in favor of this palette.
  // -----------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen((prev) => {
          if (prev) return false;
          setQuery("");
          setActiveIndex(0);
          fetchRecentDeals();
          return true;
        });
      } else if (e.key === "Escape" && open) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, fetchRecentDeals]);

  // -----------------------------------------------------------------------
  // Focus the input shortly after the modal mounts (matches legacy 50ms
  // delay using requestAnimationFrame so the portal has rendered first).
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // -----------------------------------------------------------------------
  // Reset the active index whenever the visible results change so we don't
  // point past the end of the list.
  // -----------------------------------------------------------------------
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // -----------------------------------------------------------------------
  // Scroll active item into view as user navigates with arrow keys.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll("[data-palette-item]");
    const el = items[activeIndex];
    if (el) (el as HTMLElement).scrollIntoView({ block: "nearest" });
  }, [activeIndex, results.length]);

  // -----------------------------------------------------------------------
  // Selection — close, then route via Next.js router (no full page nav).
  // -----------------------------------------------------------------------
  const selectResult = useCallback(
    (result: PaletteResult) => {
      closePalette();
      router.push(result.href);
    },
    [closePalette, router],
  );

  // -----------------------------------------------------------------------
  // Per-input keyboard handling (arrows + Enter). Escape is handled on the
  // global capture-phase listener above.
  // -----------------------------------------------------------------------
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = results[activeIndex];
        if (result) selectResult(result);
      }
    },
    [results, activeIndex, selectResult],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // -----------------------------------------------------------------------
  // Group results for rendering. Maintain a global index counter so the
  // arrow-key activeIndex maps cleanly across visible groups.
  // -----------------------------------------------------------------------
  const grouped: Record<PaletteResult["kind"], PaletteResult[]> = {
    page: [],
    deal: [],
    action: [],
  };
  for (const r of results) grouped[r.kind].push(r);

  let globalIdx = 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center pt-[18vh]"
      data-modal-overlay
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closePalette();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        style={{ boxShadow: "0 25px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)" }}
      >
        {/* Search input ------------------------------------------------ */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-200">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 22 }}>
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-[15px] bg-transparent font-sans text-gray-900 placeholder-gray-400"
            style={{ outline: "none", border: "none" }}
            placeholder="Jump to a page, deal, or action..."
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded border border-gray-200 font-sans">
            ESC
          </kbd>
        </div>

        {/* Results ----------------------------------------------------- */}
        <div ref={resultsRef} className="max-h-[340px] overflow-y-auto p-1.5 custom-scrollbar">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <span
                className="material-symbols-outlined mb-1"
                style={{ fontSize: 28, opacity: 0.4 }}
              >
                search_off
              </span>
              <p className="text-[13px]">No results found</p>
            </div>
          ) : (
            GROUP_ORDER.map((kind) => {
              const items = grouped[kind];
              if (items.length === 0) return null;
              return (
                <div key={kind}>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">
                    {GROUP_LABELS[kind]}
                  </div>
                  {items.map((item) => {
                    const idx = globalIdx++;
                    const isActive = idx === activeIndex;
                    const sub = item.kind === "deal" ? item.sub : "";
                    const itemKey =
                      item.kind === "deal" || item.kind === "page"
                        ? `${item.kind}:${item.id}`
                        : `action:${item.href}`;
                    return (
                      <div
                        key={itemKey}
                        data-palette-item
                        className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isActive ? "text-white" : "hover:bg-[#E6EEF5]"
                        }`}
                        style={isActive ? { backgroundColor: "#003366" } : undefined}
                        onClick={() => selectResult(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={
                            isActive
                              ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
                              : {
                                  backgroundColor: GROUP_ICON_STYLES[item.kind].bg,
                                  color: GROUP_ICON_STYLES[item.kind].color,
                                }
                          }
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {item.icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          {sub && (
                            <p
                              className="text-[11px] truncate"
                              style={
                                isActive
                                  ? { color: "rgba(255,255,255,0.7)" }
                                  : { color: "#9CA3AF" }
                              }
                            >
                              {sub}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer ------------------------------------------------------ */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 text-[11px] text-gray-400">
          <span>
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              &uarr;&darr;
            </kbd>
            {" "}Navigate
            {" "}&#xB7;{" "}
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              &#x21B5;
            </kbd>
            {" "}Open
          </span>
          <span className="text-gray-400">PE OS Command Palette</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
