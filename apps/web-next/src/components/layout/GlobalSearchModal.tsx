"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// Quick actions — hardcoded entries matching legacy globalSearch.js
// ---------------------------------------------------------------------------
interface QuickAction {
  id: string;
  label: string;
  icon: string;
  route: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "new-deal", label: "Create Deal", icon: "add_circle", route: "/deal-intake" },
  { id: "goto-pipeline", label: "Go to Pipeline", icon: "dashboard", route: "/deals" },
  { id: "goto-vdr", label: "Open Data Room", icon: "folder_open", route: "/data-room" },
  { id: "goto-memo", label: "AI Reports", icon: "edit_note", route: "/memo-builder" },
  { id: "goto-settings", label: "Settings", icon: "settings", route: "/settings" },
];

// ---------------------------------------------------------------------------
// Result union type
// ---------------------------------------------------------------------------
type SearchResult =
  | { type: "deal"; deal: Deal }
  | { type: "action"; action: QuickAction };

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

  // -----------------------------------------------------------------------
  // Build the default result set (quick actions only, no query)
  // -----------------------------------------------------------------------
  const buildQuickActionResults = useCallback(
    (filter?: string): SearchResult[] => {
      const actions = filter
        ? QUICK_ACTIONS.filter((a) =>
            a.label.toLowerCase().includes(filter.toLowerCase()),
          )
        : QUICK_ACTIONS;
      return actions.map((a) => ({ type: "action" as const, action: a }));
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
      setResults(buildQuickActionResults());
      setLoading(false);
      setError(false);
      // Focus the input after the modal renders
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, buildQuickActionResults]);

  // -----------------------------------------------------------------------
  // Debounced search
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!open) return;

    const trimmed = query.trim();

    // No query — show all quick actions
    if (!trimmed) {
      setResults(buildQuickActionResults());
      setSelectedIndex(0);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);

    const timer = setTimeout(async () => {
      try {
        // Fetch deals matching query
        const data = await api.get<Deal[] | { deals: Deal[] }>(
          `/deals?search=${encodeURIComponent(trimmed)}&limit=5`,
        );
        const deals: Deal[] = Array.isArray(data)
          ? data
          : (data as { deals: Deal[] }).deals ?? [];

        // Filter quick actions by query
        const matchingActions = buildQuickActionResults(trimmed);

        const combined: SearchResult[] = [
          ...deals.map((d) => ({ type: "deal" as const, deal: d })),
          ...matchingActions,
        ];

        setResults(combined);
        setSelectedIndex(0);
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, open, buildQuickActionResults]);

  // -----------------------------------------------------------------------
  // Navigate to a result
  // -----------------------------------------------------------------------
  const selectResult = useCallback(
    (result: SearchResult) => {
      onClose();
      if (result.type === "deal") {
        router.push(`/deals/${result.deal.id}`);
      } else {
        router.push(result.action.route);
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
          setSelectedIndex((prev) => (prev + 1) % (total || 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev <= 0 ? (total || 1) - 1 : prev - 1));
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
  // Derived data for rendering
  // -----------------------------------------------------------------------
  const dealResults = results.filter((r) => r.type === "deal") as Extract<
    SearchResult,
    { type: "deal" }
  >[];
  const actionResults = results.filter((r) => r.type === "action") as Extract<
    SearchResult,
    { type: "action" }
  >[];

  // Global index counter for mapping selected index across groups
  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <span className="material-symbols-outlined text-gray-400">search</span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 text-lg outline-none placeholder-gray-400 bg-transparent"
            placeholder="Search deals, documents, or type a command..."
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="px-2 py-0.5 text-xs font-bold text-gray-400 bg-gray-100 rounded border border-gray-200">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[400px] overflow-y-auto">
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
              <span className="material-symbols-outlined text-3xl mb-2">search_off</span>
              <p className="text-sm font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          )}

          {/* Results list */}
          {!loading && !error && results.length > 0 && (
            <div className="p-2">
              {/* Deals section */}
              {dealResults.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Deals
                  </div>
                  {dealResults.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={r.deal.id}
                        data-result-item
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-[#E6EEF5]" : "hover:bg-gray-100"
                        }`}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: "#E6EEF5" }}
                        >
                          <span
                            className="material-symbols-outlined text-lg"
                            style={{ color: "#003366" }}
                          >
                            {r.deal.icon || "business_center"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            <HighlightedText text={r.deal.name} query={query} />
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {r.deal.industry || "No industry"} &bull;{" "}
                            {formatStage(r.deal.stage)}
                          </p>
                        </div>
                        {r.deal.dealSize != null && (
                          <span className="text-xs font-bold text-gray-500">
                            ${r.deal.dealSize}M
                          </span>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Quick Actions section */}
              {actionResults.length > 0 && (
                <>
                  <div
                    className={`px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider ${
                      dealResults.length > 0 ? "mt-2" : ""
                    }`}
                  >
                    Quick Actions
                  </div>
                  {actionResults.map((r) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={r.action.id}
                        data-result-item
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-[#E6EEF5]" : "hover:bg-gray-100"
                        }`}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                          <span className="material-symbols-outlined text-amber-600 text-lg">
                            {r.action.icon}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          <HighlightedText text={r.action.label} query={query} />
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">
                &uarr;
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">
                &darr;
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">
                &crarr;
              </kbd>
              Select
            </span>
          </div>
          <span>PE OS Command Palette</span>
        </div>
      </div>
    </div>
  );
}
