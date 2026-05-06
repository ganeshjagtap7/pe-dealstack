"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import type { LeaderboardRow } from "./types";
import { PillGroup, StatusPill, EmptyState, ErrorPanel } from "./_ui";

type WindowKey = "24h" | "7d" | "30d";

const WINDOW_OPTIONS: { value: WindowKey; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d",  label: "7 d"  },
  { value: "30d", label: "30 d" },
];

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

export function Leaderboard() {
  const { showToast }         = useToast();
  const [rows, setRows]       = useState<LeaderboardRow[]>([]);
  const [showLoading, setShowLoading] = useState(false);
  const [hasError, setHasError]       = useState(false);
  const [window, setWindow]   = useState<WindowKey>("24h");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const loadingTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => setShowLoading(true), 300);
    setHasError(false);
    try {
      const res = await api.get<{ rows: LeaderboardRow[]; window: string }>(
        `/internal/usage/leaderboard?window=${window}`,
      );
      setRows(res.rows);
    } catch (err) {
      console.warn("[Leaderboard] failed to load leaderboard", err);
      setHasError(true);
      showToast("Failed to load leaderboard data.", "error");
    } finally {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
      setShowLoading(false);
    }
  }, [window, showToast]);

  useEffect(() => {
    // load() is async — its setStates run in deferred callbacks, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [load]);

  const handleThrottle = async (row: LeaderboardRow) => {
    const nextValue = !row.isThrottled;
    setPendingUserId(row.userId);
    try {
      await api.post(`/internal/users/${row.userId}/throttle`, { value: nextValue });
      showToast(
        nextValue
          ? `Throttled ${row.email ?? row.userId}`
          : `Removed throttle for ${row.email ?? row.userId}`,
        "success",
      );
      setRows((prev) =>
        prev.map((r) =>
          r.userId === row.userId ? { ...r, isThrottled: nextValue } : r,
        ),
      );
    } catch (err) {
      console.warn("[Leaderboard] throttle action failed", err);
      showToast("Failed to update throttle status.", "error");
    } finally {
      setPendingUserId(null);
    }
  };

  const handleBlock = async (row: LeaderboardRow) => {
    const nextValue = !row.isBlocked;
    setPendingUserId(row.userId);
    try {
      await api.post(`/internal/users/${row.userId}/block`, { value: nextValue });
      showToast(
        nextValue
          ? `Blocked ${row.email ?? row.userId}`
          : `Unblocked ${row.email ?? row.userId}`,
        nextValue ? "warning" : "success",
      );
      setRows((prev) =>
        prev.map((r) =>
          r.userId === row.userId ? { ...r, isBlocked: nextValue } : r,
        ),
      );
    } catch (err) {
      console.warn("[Leaderboard] block action failed", err);
      showToast("Failed to update block status.", "error");
    } finally {
      setPendingUserId(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <PillGroup
          options={WINDOW_OPTIONS}
          value={window}
          onChange={(v) => setWindow(v)}
        />
        <button
          onClick={load}
          disabled={showLoading}
          className="ml-auto h-8 flex items-center gap-1.5 px-3 rounded-md border border-gray-200
                     text-xs text-gray-600 bg-white hover:bg-gray-50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshIcon />
          {showLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* ── States ── */}
      {hasError ? (
        <ErrorPanel message="Couldn't load leaderboard. Try refreshing." />
      ) : showLoading ? (
        <div className="text-xs text-gray-400 py-8 text-center">Loading leaderboard…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          heading="No usage yet for this window"
          body="Once users make AI calls, they'll surface here ranked by spend."
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
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">User</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Org</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Role</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Calls</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Tokens</th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">
                    $ Cost{" "}
                    <span className="text-gray-300 font-normal not-uppercase normal-case">↓</span>
                  </th>
                  <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap">Credits</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Top Operation</th>
                  <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isPending = pendingUserId === row.userId;
                  return (
                    <tr
                      key={row.userId}
                      className={cn(
                        "border-t border-gray-100 transition-colors",
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/60",
                        "hover:bg-blue-50/30",
                      )}
                    >
                      <td className="px-4 py-2.5 text-gray-800 font-medium">
                        {row.email ?? row.userId}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {row.orgName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 capitalize">
                        {row.role ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {row.calls.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {row.tokens.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 font-medium">
                        ${Number(row.costUsd).toFixed(4)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">
                        {row.credits}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-gray-700">
                        {row.topOperation}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.isBlocked ? (
                          <StatusPill variant="error" label="blocked" />
                        ) : row.isThrottled ? (
                          <StatusPill variant="warning" label="throttled" />
                        ) : (
                          <StatusPill variant="neutral" label="ok" />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5">
                          <button
                            disabled={isPending}
                            onClick={() => handleThrottle(row)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs border transition-colors",
                              row.isThrottled
                                ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                                : "border-gray-200 text-gray-500 hover:bg-gray-50",
                              isPending && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            {row.isThrottled ? "Unthrottle" : "Throttle"}
                          </button>
                          <button
                            disabled={isPending}
                            onClick={() => handleBlock(row)}
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs border transition-colors",
                              row.isBlocked
                                ? "border-red-300 text-red-700 hover:bg-red-50"
                                : "border-gray-200 text-gray-500 hover:bg-gray-50",
                              isPending && "opacity-50 cursor-not-allowed",
                            )}
                          >
                            {row.isBlocked ? "Unblock" : "Block"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60">
            <p className="text-xs text-gray-400 tabular-nums">
              <span className="font-medium text-gray-600">{rows.length}</span>{" "}
              user{rows.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
