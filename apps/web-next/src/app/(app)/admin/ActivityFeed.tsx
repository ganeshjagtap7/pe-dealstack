"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import type { AdminAuditLog } from "./types";

const PAGE_SIZE = 10;

const ACTION_META: Record<string, { text: (entity: string) => string; icon: string }> = {
  DEAL_CREATED: { text: (e) => `created deal ${e}`, icon: "add_circle" },
  DEAL_UPDATED: { text: (e) => `updated ${e}`, icon: "edit" },
  DEAL_DELETED: { text: (e) => `deleted deal ${e}`, icon: "delete" },
  DEAL_STAGE_CHANGED: { text: (e) => `moved ${e} to a new stage`, icon: "arrow_forward" },
  DEAL_ASSIGNED: { text: (e) => `assigned ${e}`, icon: "person_add" },
  DOCUMENT_UPLOADED: { text: (e) => `uploaded ${e}`, icon: "upload_file" },
  DOCUMENT_DELETED: { text: (e) => `deleted document ${e}`, icon: "delete" },
  DOCUMENT_DOWNLOADED: { text: (e) => `downloaded ${e}`, icon: "download" },
  MEMO_CREATED: { text: (e) => `created memo ${e}`, icon: "description" },
  MEMO_UPDATED: { text: (e) => `updated memo ${e}`, icon: "edit_note" },
  MEMO_EXPORTED: { text: (e) => `exported memo ${e}`, icon: "file_download" },
  USER_CREATED: { text: (e) => `added team member ${e}`, icon: "person_add" },
  USER_UPDATED: { text: (e) => `updated user ${e}`, icon: "manage_accounts" },
  USER_INVITED: { text: (e) => `invited ${e}`, icon: "mail" },
  INVITATION_SENT: { text: (e) => `sent invitation to ${e}`, icon: "send" },
  INVITATION_ACCEPTED: { text: (e) => `${e} accepted invitation`, icon: "how_to_reg" },
  AI_INGEST: { text: (e) => `ingested document ${e}`, icon: "auto_awesome" },
  AI_GENERATE: { text: (e) => `generated analysis for ${e}`, icon: "auto_awesome" },
  LOGIN: { text: () => "logged in", icon: "login" },
  SETTINGS_CHANGED: { text: () => "updated settings", icon: "settings" },
};

function initials(raw: string): string {
  return raw
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
}

function groupByDay(logs: AdminAuditLog[]): Array<[string, AdminAuditLog[]]> {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString();
  const groups = new Map<string, AdminAuditLog[]>();

  for (const log of logs) {
    const d = new Date(log.createdAt);
    const str = d.toDateString();
    const label =
      str === today
        ? "Today"
        : str === yesterday
          ? "Yesterday"
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(log);
  }
  return Array.from(groups.entries());
}

export function ActivityFeed() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (append: boolean) => {
    const nextOffset = append ? offset : 0;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError(false);
    }
    try {
      const data = await api.get<{ logs: AdminAuditLog[] }>(
        `/audit?limit=${PAGE_SIZE}&offset=${nextOffset}`,
      );
      const newLogs = data.logs || [];
      setLogs((prev) => (append ? prev.concat(newLogs) : newLogs));
      setOffset(nextOffset + newLogs.length);
      setHasMore(newLogs.length === PAGE_SIZE);
    } catch (err) {
      console.warn("[admin] activity feed load failed:", err);
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [offset]);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = groupByDay(logs);

  return (
    <div
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card flex flex-col"
      style={{ height: 420 }}
    >
      <div className="p-5 border-b border-border-subtle">
        <h2 className="text-base font-semibold text-text-main flex items-center gap-2">
          <span className="material-symbols-outlined text-text-muted text-[20px]">rss_feed</span>
          Team Activity
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-5 relative custom-scrollbar">
        {loading ? (
          <div className="text-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-[24px] mb-2 block animate-spin">
              progress_activity
            </span>
            <p className="text-sm">Loading activity...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-[32px] mb-2 block">cloud_off</span>
            <p className="text-sm font-medium">Could not load activity</p>
            <button
              type="button"
              onClick={() => load(false)}
              className="mt-3 text-sm text-primary font-medium hover:text-primary-hover transition-colors"
            >
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-[32px] mb-2 block">rss_feed</span>
            <p className="text-sm font-medium">No activity yet</p>
            <p className="text-xs mt-1">Actions across your org will appear here</p>
          </div>
        ) : (
          <div className="space-y-5 relative">
            {/* Timeline vertical line */}
            <div className="absolute left-[17px] top-6 bottom-6 w-px bg-border-subtle" />
            {grouped.map(([label, dayLogs]) => (
              <div key={label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mt-2 mb-2 first:mt-0">
                  {label}
                </p>
                {dayLogs.map((log) => {
                  const userName = log.userEmail?.split("@")[0] || "System";
                  const isAI = log.action?.startsWith("AI_");
                  const meta = ACTION_META[log.action];
                  const entity = log.entityName || log.resourceName || "";
                  const text = meta
                    ? meta.text(entity)
                    : `performed ${log.action || "an action"}`;
                  const icon = meta?.icon || "info";

                  return (
                    <div key={log.id} className="flex gap-3 relative z-10 mb-4">
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-9 h-9 rounded-full text-white text-xs font-medium flex items-center justify-center"
                          style={{ backgroundColor: "#003366" }}
                        >
                          {isAI ? (
                            <span className="material-symbols-outlined text-[18px]">
                              auto_awesome
                            </span>
                          ) : (
                            initials(userName)
                          )}
                        </div>
                        <div
                          className="absolute -bottom-0.5 -right-0.5 rounded-full w-4 h-4 flex items-center justify-center border-2 border-white"
                          style={{ backgroundColor: "#003366" }}
                        >
                          <span className="material-symbols-outlined text-white text-[10px]">
                            {icon}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm text-text-main">
                          <span className={cn("font-semibold", isAI && "text-primary")}>
                            {isAI ? "PE OS AI" : userName}
                          </span>{" "}
                          {entity ? (
                            <HighlightEntity text={text} entity={entity} />
                          ) : (
                            text
                          )}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {formatRelativeTime(log.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
      {logs.length > 0 && hasMore && (
        <div className="p-3 border-t border-border-subtle text-center">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loadingMore}
            className="text-xs text-text-muted hover:text-primary font-medium uppercase tracking-wide transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "View Full History"}
          </button>
        </div>
      )}
    </div>
  );
}

// Highlight the entity within the text using React elements (no raw HTML).
function HighlightEntity({ text, entity }: { text: string; entity: string }) {
  const idx = text.indexOf(entity);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary font-medium">{entity}</span>
      {text.slice(idx + entity.length)}
    </>
  );
}
