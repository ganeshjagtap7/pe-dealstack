"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { UsageEventRow } from "./types";

export function LiveFeed() {
  const [events, setEvents] = useState<UsageEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (operation) params.set("operation", operation);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (errorsOnly) params.set("errorsOnly", "true");
      params.set("limit", "200");
      const qs = params.toString();
      const res = await api.get<{ events: UsageEventRow[] }>(
        `/internal/usage/events${qs ? `?${qs}` : ""}`,
      );
      setEvents(res.events);
    } catch (err) {
      console.warn("[LiveFeed] failed to load events", err);
    } finally {
      setLoading(false);
    }
  }, [operation, from, to, errorsOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Derive unique operations from loaded events for the filter dropdown.
  const operations = Array.from(new Set(events.map((e) => e.operation))).sort();

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={operation}
          onChange={(e) => setOperation(e.target.value)}
          className="px-2 py-1 border border-border-subtle rounded text-sm bg-white"
        >
          <option value="">All operations</option>
          {operations.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="px-2 py-1 border border-border-subtle rounded text-sm"
          aria-label="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-2 py-1 border border-border-subtle rounded text-sm"
          aria-label="To date"
        />

        <label className="text-sm text-text-secondary flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
          />
          Errors only
        </label>

        <button
          onClick={load}
          className="px-3 py-1 border rounded text-sm"
          style={{ borderColor: "#003366", color: "#003366" }}
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      {loading && events.length === 0 ? (
        <div className="text-text-secondary py-6">Loading events…</div>
      ) : events.length === 0 ? (
        <div className="text-text-secondary py-6 italic">
          No events match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white border border-border-subtle rounded">
            <thead className="bg-gray-50 text-xs uppercase text-text-secondary">
              <tr>
                <th className="text-left p-2 whitespace-nowrap">Time</th>
                <th className="text-left p-2 whitespace-nowrap">Org</th>
                <th className="text-left p-2 whitespace-nowrap">User</th>
                <th className="text-left p-2 whitespace-nowrap">Operation</th>
                <th className="text-left p-2 whitespace-nowrap">Model</th>
                <th className="text-left p-2 whitespace-nowrap">Tokens In / Out</th>
                <th className="text-right p-2 whitespace-nowrap">$ Cost</th>
                <th className="text-right p-2 whitespace-nowrap">Credits</th>
                <th className="text-left p-2 whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-t border-border-subtle hover:bg-gray-50"
                >
                  <td className="p-2 text-xs whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 text-xs">{e.Organization?.name ?? ""}</td>
                  <td className="p-2 text-xs">{e.User?.email ?? ""}</td>
                  <td className="p-2 text-xs font-mono">{e.operation}</td>
                  <td className="p-2 text-xs">{e.model ?? "—"}</td>
                  <td className="p-2 text-xs whitespace-nowrap">
                    {e.promptTokens ?? 0} / {e.completionTokens ?? 0}
                  </td>
                  <td className="p-2 text-right text-xs">
                    ${Number(e.costUsd ?? 0).toFixed(4)}
                  </td>
                  <td className="p-2 text-right text-xs">{e.credits ?? 0}</td>
                  <td className="p-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-semibold",
                        e.status === "success"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800",
                      )}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-text-secondary mt-2">
            Showing {events.length} event{events.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
