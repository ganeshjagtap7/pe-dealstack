"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/formatters";
import type { UsageEventRow } from "./types";
import { PillGroup, StatusPill, EmptyState, ErrorPanel } from "./_ui";

// ── Range preset helpers ─────────────────────────────────────────────────────

type RangePreset = "today" | "7d" | "30d" | "custom";

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: "today",  label: "Today"  },
  { value: "7d",     label: "7d"     },
  { value: "30d",    label: "30d"    },
  { value: "custom", label: "Custom" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Beginning of the given UTC day as a full ISO timestamp. */
function startOfDayUtc(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** End of the given UTC day (inclusive) as a full ISO timestamp. */
function endOfDayUtc(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}

/** ISO timestamp for `from` filter. Use full timestamps (not bare dates) so
 * Supabase's gte/lte against `createdAt` (timestamptz) doesn't accidentally
 * exclude events recorded later the same day. */
function presetToFrom(preset: RangePreset): string {
  const now = new Date();
  if (preset === "today") return startOfDayUtc(now);
  if (preset === "7d")    return startOfDayUtc(new Date(Date.now() - 6  * 86400_000));
  if (preset === "30d")   return startOfDayUtc(new Date(Date.now() - 29 * 86400_000));
  return ""; // "custom" — caller supplies dates
}

/** ISO timestamp for `to` filter. For Today/7d/30d we don't send a `to` —
 * we only want events newer than `from`, and there's no need to cap the end.
 * Returning a fresh timestamp every render would cause an infinite re-fetch
 * loop since this value feeds into a useEffect dep array. */
function presetToTo(preset: RangePreset): string {
  if (preset === "custom") return "";
  return ""; // intentional — no upper bound on non-custom presets
}

/** Convert a date input value (YYYY-MM-DD, user's local) into a UTC ISO
 * timestamp. `from` uses start-of-day; `to` uses end-of-day. */
function customDateToIso(value: string, edge: "from" | "to"): string {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return edge === "from" ? startOfDayUtc(date) : endOfDayUtc(date);
}

// ── Refresh icon ─────────────────────────────────────────────────────────────

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LiveFeed() {
  const [events, setEvents]               = useState<UsageEventRow[]>([]);
  const [showLoading, setShowLoading]     = useState(false);
  const [hasError, setHasError]           = useState(false);
  const [operation, setOperation]         = useState("");
  const [rangePreset, setRangePreset]     = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom]       = useState("");
  const [customTo, setCustomTo]           = useState("");
  const [errorsOnly, setErrorsOnly]       = useState(false);
  const loadingTimerRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective date range — full ISO timestamps (not bare dates) so the API's
  // gte/lte against the timestamptz column matches the entire selected day.
  const effectiveFrom =
    rangePreset === "custom" ? customDateToIso(customFrom, "from") : presetToFrom(rangePreset);
  const effectiveTo =
    rangePreset === "custom" ? customDateToIso(customTo, "to") : presetToTo(rangePreset);

  const load = useCallback(async () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setShowLoading(true), 300);

    setHasError(false);
    try {
      const params = new URLSearchParams();
      if (operation)       params.set("operation",  operation);
      if (effectiveFrom)   params.set("from",        effectiveFrom);
      if (effectiveTo)     params.set("to",          effectiveTo);
      if (errorsOnly)      params.set("errorsOnly",  "true");
      params.set("limit", "200");
      const qs = params.toString();
      const res = await api.get<{ events: UsageEventRow[] }>(
        `/internal/usage/events${qs ? `?${qs}` : ""}`,
      );
      setEvents(res.events);
    } catch (err) {
      console.warn("[LiveFeed] failed to load events", err);
      setHasError(true);
    } finally {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setShowLoading(false);
    }
  }, [operation, effectiveFrom, effectiveTo, errorsOnly]);

  useEffect(() => {
    // load() is async — its setStates run in deferred callbacks, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [load]);

  const operations = Array.from(new Set(events.map((e) => e.operation))).sort();
  const filtersActive = !!operation || rangePreset !== "7d" || errorsOnly;

  function clearFilters() {
    setOperation("");
    setRangePreset("7d");
    setCustomFrom("");
    setCustomTo("");
    setErrorsOnly(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        {/* Operation selector */}
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
          className="h-8 px-2.5 border border-gray-200 rounded-md text-xs bg-white text-gray-700
                     focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366]"
        >
          <option value="">All operations</option>
          {operations.map((op) => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>

        {/* Range presets */}
        <PillGroup
          options={RANGE_OPTIONS}
          value={rangePreset}
          onChange={(v) => setRangePreset(v)}
        />

        {/* Errors-only checkbox */}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
            className="rounded border-gray-300 focus:ring-[#003366]/30"
            style={{ accentColor: "#003366" }}
          />
          Errors only
        </label>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={showLoading}
          className="ml-auto h-8 flex items-center gap-1.5 px-3 rounded-md border border-gray-200
                     text-xs text-gray-600 bg-white hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshIcon />
          Refresh
        </button>
      </div>

      {/* Custom date pickers — revealed only when "Custom" is active */}
      {rangePreset === "custom" && (
        <div className="flex gap-2 mb-4 items-center">
          <span className="text-xs text-gray-500">From</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-8 px-2.5 border border-gray-200 rounded-md text-xs bg-white
                       focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366]"
            aria-label="From date"
          />
          <span className="text-xs text-gray-500">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-8 px-2.5 border border-gray-200 rounded-md text-xs bg-white
                       focus:outline-none focus:ring-2 focus:ring-[#003366]/30 focus:border-[#003366]"
            aria-label="To date"
          />
        </div>
      )}

      {/* ── Loading / error / table ── */}
      {hasError ? (
        <ErrorPanel message="Couldn't load events. Try refreshing." />
      ) : showLoading ? (
        <div className="text-xs text-gray-400 py-8 text-center">Loading events…</div>
      ) : events.length === 0 ? (
        <EmptyState
          heading={filtersActive ? "No matching events" : "No events yet"}
          body={
            filtersActive
              ? "No AI calls match the current filters."
              : "AI calls are recorded automatically. Once a user runs a deal chat, financial extraction, or any tracked operation, they'll appear here in real time."
          }
          filtersActive={filtersActive}
          onClearFilters={clearFilters}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead
                className="bg-white text-gray-400 uppercase tracking-wide border-b border-gray-200"
                style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "#fff" }}
              >
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Time</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Org</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">User</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Operation</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Model</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Tokens In / Out</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">$ Cost</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Credits</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, idx) => (
                  <tr
                    key={e.id}
                    className={cn(
                      "border-t border-gray-100 hover:bg-blue-50/30 transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/60",
                    )}
                  >
                    <td
                      className="px-4 py-2.5 whitespace-nowrap text-gray-600"
                      title={new Date(e.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {e.Organization?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {e.User?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-gray-800">
                      {e.operation}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {e.model ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {(e.promptTokens ?? 0).toLocaleString()} /{" "}
                      {(e.completionTokens ?? 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 font-medium">
                      ${Number(e.costUsd ?? 0).toFixed(4)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                      {e.credits ?? 0}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill
                        variant={e.status === "success" ? "success" : "error"}
                        label={e.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-400 tabular-nums">
              Showing{" "}
              <span className="font-medium text-gray-600">{events.length}</span>{" "}
              event{events.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
