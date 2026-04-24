"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// Contact type (matches the API shape used by legacy command palette)
// ---------------------------------------------------------------------------
interface ContactResult {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Static pages — matching legacy commandPalette.js PAGES array
// ---------------------------------------------------------------------------
interface PageEntry {
  label: string;
  route: string;
  icon: string;
  keywords: string;
}

const PAGES: PageEntry[] = [
  { label: "Dashboard", route: "/dashboard", icon: "dashboard", keywords: "home overview" },
  { label: "Deals", route: "/deals", icon: "work", keywords: "pipeline crm deals" },
  { label: "Data Room", route: "/data-room", icon: "folder_open", keywords: "vdr documents files" },
  { label: "Contacts", route: "/contacts", icon: "groups", keywords: "crm people network" },
  { label: "AI Reports", route: "/memo-builder", icon: "auto_awesome", keywords: "memo ic report" },
  { label: "Admin", route: "/admin", icon: "admin_panel_settings", keywords: "admin tasks team" },
  { label: "Settings", route: "/settings", icon: "settings", keywords: "profile preferences account" },
];

// ---------------------------------------------------------------------------
// Result union type — Pages, Deals, Contacts (matching legacy groups)
// ---------------------------------------------------------------------------
type SearchResult =
  | { type: "page"; entry: PageEntry }
  | { type: "deal"; deal: Deal }
  | { type: "contact"; contact: ContactResult };

// ---------------------------------------------------------------------------
// Stage label formatter (mirrors legacy)
// ---------------------------------------------------------------------------
const STAGE_LABELS: Record<string, string> = {
  INITIAL_REVIEW: "Initial Review",
  DUE_DILIGENCE: "Due Diligence",
  IOI_SUBMITTED: "IOI Submitted",
  LOI_SUBMITTED: "LOI Submitted",
  NEGOTIATION: "Negotiation",
  CLOSING: "Closing",
  PASSED: "Passed",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

function formatStage(stage: string | undefined): string {
  if (!stage) return "";
  return STAGE_LABELS[stage] || stage;
}

// ---------------------------------------------------------------------------
// Highlight matching text with yellow marks
// ---------------------------------------------------------------------------
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-200 px-0.5 rounded text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Search helper — matches legacy prefix-matching (every word in query must
// appear somewhere in the haystack string)
// ---------------------------------------------------------------------------
function matchesQuery(haystack: string, query: string): boolean {
  const lower = haystack.toLowerCase();
  return query
    .toLowerCase()
    .split(" ")
    .every((word) => lower.includes(word));
}

// ---------------------------------------------------------------------------
// GlobalSearchModal
// ---------------------------------------------------------------------------
export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Prefetch caches — filled once on first open
  const dealsCacheRef = useRef<Deal[] | null>(null);
  const contactsCacheRef = useRef<ContactResult[] | null>(null);
  const prefetchedRef = useRef(false);

  // -----------------------------------------------------------------------
  // Prefetch deals + contacts on open (matching legacy behaviour)
  // -----------------------------------------------------------------------
  const prefetchData = useCallback(async () => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;

    try {
      if (!dealsCacheRef.current) {
        const data = await api.get<Deal[] | { deals: Deal[] }>("/deals");
        dealsCacheRef.current = Array.isArray(data)
          ? data
          : (data as { deals: Deal[] }).deals ?? [];
      }
    } catch {
      /* silent — legacy behaviour */
    }

    try {
      if (!contactsCacheRef.current) {
        const data = await api.get<ContactResult[] | { contacts: ContactResult[] }>("/contacts");
        contactsCacheRef.current = Array.isArray(data)
          ? data
          : (data as { contacts: ContactResult[] }).contacts ?? [];
      }
    } catch {
      /* silent — legacy behaviour */
    }
  }, []);

  // -----------------------------------------------------------------------
  // Build default result set (pages only, no query)
  // -----------------------------------------------------------------------
  const buildDefaultResults = useCallback((): SearchResult[] => {
    return PAGES.map((p) => ({ type: "page" as const, entry: p }));
  }, []);

  // -----------------------------------------------------------------------
  // Search across all three groups (Pages, Deals, Contacts) — client-side
  // filtering against the prefetched cache, matching legacy behaviour.
  // Up to 12 results total.
  // -----------------------------------------------------------------------
  const searchAll = useCallback(
    (q: string): SearchResult[] => {
      const pageResults: SearchResult[] = PAGES.filter((p) =>
        matchesQuery(`${p.label} ${p.keywords}`, q),
      ).map((p) => ({ type: "page" as const, entry: p }));

      const dealResults: SearchResult[] = (dealsCacheRef.current || [])
        .filter((d) =>
          matchesQuery(
            `${d.name} ${d.industry || ""} ${d.companyName || ""}`,
            q,
          ),
        )
        .map((d) => ({ type: "deal" as const, deal: d }));

      const contactResults: SearchResult[] = (contactsCacheRef.current || [])
        .filter((c) =>
          matchesQuery(
            `${c.firstName || ""} ${c.lastName || ""} ${c.company || ""} ${c.email || ""}`,
            q,
          ),
        )
        .map((c) => ({ type: "contact" as const, contact: c }));

      return [...pageResults, ...dealResults, ...contactResults].slice(0, 12);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Reset state when modal opens/closes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setResults(buildDefaultResults());
      setLoading(false);
      setError(false);
      // Focus the input after the modal renders
      requestAnimationFrame(() => inputRef.current?.focus());
      prefetchData();
    }
  }, [open, buildDefaultResults, prefetchData]);

  // -----------------------------------------------------------------------
  // Debounced search — filters cached data client-side (matching legacy)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();

    // No query — show pages
    if (!trimmed) {
      setResults(buildDefaultResults());
      setSelectedIndex(0);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    const timer = setTimeout(() => {
      try {
        const combined = searchAll(trimmed);
        setResults(combined);
        setSelectedIndex(0);
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
        setResults([]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query, open, buildDefaultResults, searchAll]);

  // -----------------------------------------------------------------------
  // Navigate to a result
  // -----------------------------------------------------------------------
  const selectResult = useCallback(
    (result: SearchResult) => {
      onClose();
      if (result.type === "deal") {
        router.push(`/deals/${result.deal.id}`);
      } else if (result.type === "contact") {
        router.push(`/contacts#detail-${result.contact.id}`);
      } else {
        router.push(result.entry.route);
      }
    },
    [onClose, router],
  );

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const total = results.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, total - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            selectResult(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results, selectedIndex, selectResult, onClose],
  );

  // -----------------------------------------------------------------------
  // Scroll selected item into view
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!resultsRef.current) return;
    const items = resultsRef.current.querySelectorAll("[data-result-item]");
    const el = items[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // -----------------------------------------------------------------------
  // Render nothing when closed
  // -----------------------------------------------------------------------
  if (!open) return null;

  // -----------------------------------------------------------------------
  // Group results by type — Pages, Deals, Contacts (matching legacy order)
  // -----------------------------------------------------------------------
  const pageResults = results.filter((r) => r.type === "page") as Extract<
    SearchResult,
    { type: "page" }
  >[];
  const dealResults = results.filter((r) => r.type === "deal") as Extract<
    SearchResult,
    { type: "deal" }
  >[];
  const contactResults = results.filter((r) => r.type === "contact") as Extract<
    SearchResult,
    { type: "contact" }
  >[];

  // Global index counter for mapping selectedIndex across groups
  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[18vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[560px] mx-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-200">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 22 }}>
            search
          </span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-[15px] outline-none placeholder-gray-400 bg-transparent font-sans"
            placeholder="Search deals, contacts, pages..."
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded border border-gray-200 font-sans">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[340px] overflow-y-auto p-1.5">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="material-symbols-outlined animate-spin" style={{ color: "#003366" }}>
                sync
              </span>
              <span className="ml-2 text-gray-500">Searching...</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <span className="material-symbols-outlined text-2xl mb-2">error</span>
              <p className="text-sm">Search failed. Please try again.</p>
            </div>
          )}

          {/* No results (with query) */}
          {!loading && !error && query.trim() && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <span className="material-symbols-outlined mb-1" style={{ fontSize: 28, opacity: 0.4 }}>
                search_off
              </span>
              <p className="text-[13px]">No results found</p>
            </div>
          )}

          {/* Results list */}
          {!loading && !error && results.length > 0 && (
            <>
              {/* Pages section */}
              {pageResults.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">
                    Pages
                  </div>
                  {pageResults.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={r.entry.route}
                        data-result-item
                        className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "text-white"
                            : "hover:bg-[#E6EEF5]"
                        }`}
                        style={isSelected ? { backgroundColor: "#003366" } : undefined}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={
                            isSelected
                              ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
                              : { backgroundColor: "#E6EEF5", color: "#003366" }
                          }
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {r.entry.icon}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <HighlightedText text={r.entry.label} query={query} />
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Deals section */}
              {dealResults.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">
                    Deals
                  </div>
                  {dealResults.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    const sub = [r.deal.stage ? formatStage(r.deal.stage) : null, r.deal.industry]
                      .filter(Boolean)
                      .join(" \u00B7 ");
                    return (
                      <div
                        key={r.deal.id}
                        data-result-item
                        className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "text-white"
                            : "hover:bg-[#E6EEF5]"
                        }`}
                        style={isSelected ? { backgroundColor: "#003366" } : undefined}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={
                            isSelected
                              ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
                              : { backgroundColor: "#DBEAFE", color: "#1D4ED8" }
                          }
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            work
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <HighlightedText text={r.deal.name} query={query} />
                          </p>
                          {sub && (
                            <p
                              className="text-[11px] truncate"
                              style={isSelected ? { color: "rgba(255,255,255,0.7)" } : { color: "#9CA3AF" }}
                            >
                              {sub}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Contacts section */}
              {contactResults.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">
                    Contacts
                  </div>
                  {contactResults.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    const fullName = `${r.contact.firstName || ""} ${r.contact.lastName || ""}`.trim();
                    const sub = [r.contact.title, r.contact.company]
                      .filter(Boolean)
                      .join(" \u00B7 ");
                    return (
                      <div
                        key={r.contact.id}
                        data-result-item
                        className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "text-white"
                            : "hover:bg-[#E6EEF5]"
                        }`}
                        style={isSelected ? { backgroundColor: "#003366" } : undefined}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                          style={
                            isSelected
                              ? { backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }
                              : { backgroundColor: "#D1FAE5", color: "#059669" }
                          }
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            person
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            <HighlightedText text={fullName} query={query} />
                          </p>
                          {sub && (
                            <p
                              className="text-[11px] truncate"
                              style={isSelected ? { color: "rgba(255,255,255,0.7)" } : { color: "#9CA3AF" }}
                            >
                              {sub}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer — keyboard hints matching legacy cp-footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-200 text-[11px] text-gray-400">
          <span>
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              &uarr;
            </kbd>
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              &darr;
            </kbd>
            {" "}navigate
          </span>
          <span>
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              Enter
            </kbd>
            {" "}open
          </span>
          <span>
            <kbd className="inline-block text-[10px] font-semibold bg-gray-100 border border-gray-200 rounded px-1 py-px font-sans mx-0.5">
              ESC
            </kbd>
            {" "}close
          </span>
        </div>
      </div>
    </div>
  );
}
