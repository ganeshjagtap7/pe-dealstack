"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import type { LeaderboardRow } from "./types";

type Window = "24h" | "7d" | "30d";

export function Leaderboard() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [window, setWindow] = useState<Window>("24h");
  // Track which userId has a pending action to prevent double-clicks.
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ rows: LeaderboardRow[]; window: string }>(
        `/internal/usage/leaderboard?window=${window}`,
      );
      setRows(res.rows);
    } catch (err) {
      console.warn("[Leaderboard] failed to load leaderboard", err);
      showToast("Failed to load leaderboard data.", "error");
    } finally {
      setLoading(false);
    }
  }, [window, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleThrottle = async (row: LeaderboardRow) => {
    const nextValue = !row.isThrottled;
    setPendingUserId(row.userId);
    try {
      await api.post(`/internal/users/${row.userId}/throttle`, {
        value: nextValue,
      });
      showToast(
        nextValue
          ? `Throttled ${row.email ?? row.userId}`
          : `Removed throttle for ${row.email ?? row.userId}`,
        "success",
      );
      // Optimistically update row without full reload.
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
      await api.post(`/internal/users/${row.userId}/block`, {
        value: nextValue,
      });
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

  const WINDOW_LABELS: Record<Window, string> = {
    "24h": "Last 24 h",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
  };

  return (
    <div>
      {/* Window selector */}
      <div className="flex gap-2 mb-3 items-center flex-wrap">
        {(["24h", "7d", "30d"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={cn(
              "px-3 py-1 text-sm rounded border transition-colors",
              window === w
                ? "text-white border-transparent"
                : "bg-white border-border-subtle text-text-secondary hover:bg-gray-50",
            )}
            style={
              window === w
                ? { backgroundColor: "#003366", borderColor: "#003366" }
                : undefined
            }
          >
            {WINDOW_LABELS[w]}
          </button>
        ))}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto px-3 py-1 border rounded text-sm"
          style={{ borderColor: "#003366", color: "#003366" }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="text-text-secondary py-6">Loading leaderboard…</div>
      ) : rows.length === 0 ? (
        <div className="text-text-secondary py-6 italic">
          No usage data for this window.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white border border-border-subtle rounded">
            <thead className="bg-gray-50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">User</th>
                <th className="text-left p-2 whitespace-nowrap">Org</th>
                <th className="text-left p-2 whitespace-nowrap">Role</th>
                <th className="text-right p-2 whitespace-nowrap">Calls</th>
                <th className="text-right p-2 whitespace-nowrap">Tokens</th>
                <th className="text-right p-2 whitespace-nowrap">$ Cost</th>
                <th className="text-right p-2 whitespace-nowrap">Credits</th>
                <th className="text-left p-2 whitespace-nowrap">Top Operation</th>
                <th className="text-left p-2 whitespace-nowrap">Flags</th>
                <th className="text-left p-2 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isPending = pendingUserId === row.userId;
                return (
                  <tr
                    key={row.userId}
                    className={cn(
                      "border-t border-border-subtle",
                      row.isBlocked
                        ? "bg-red-50"
                        : row.isThrottled
                          ? "bg-amber-50"
                          : "hover:bg-gray-50",
                    )}
                  >
                    <td className="p-2 text-xs">{row.email ?? row.userId}</td>
                    <td className="p-2 text-xs">{row.orgName ?? ""}</td>
                    <td className="p-2 text-xs capitalize">{row.role ?? "—"}</td>
                    <td className="p-2 text-right text-xs">
                      {row.calls.toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-xs">
                      {row.tokens.toLocaleString()}
                    </td>
                    <td className="p-2 text-right text-xs">
                      ${Number(row.costUsd).toFixed(4)}
                    </td>
                    <td className="p-2 text-right text-xs">{row.credits}</td>
                    <td className="p-2 text-xs font-mono">{row.topOperation}</td>
                    <td className="p-2">
                      <div className="flex gap-1 flex-wrap">
                        {row.isThrottled && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                            throttled
                          </span>
                        )}
                        {row.isBlocked && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                            blocked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <button
                          disabled={isPending}
                          onClick={() => handleThrottle(row)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs border transition-colors",
                            row.isThrottled
                              ? "border-amber-400 text-amber-700 hover:bg-amber-50"
                              : "border-border-subtle text-text-secondary hover:bg-gray-50",
                            isPending && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          {row.isThrottled ? "Unthrottle" : "Throttle"}
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => handleBlock(row)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs border transition-colors",
                            row.isBlocked
                              ? "border-red-400 text-red-700 hover:bg-red-50"
                              : "border-border-subtle text-text-secondary hover:bg-gray-50",
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
          <p className="text-xs text-text-secondary mt-2">
            {rows.length} user{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
