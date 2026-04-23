"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminDeal, AdminTask, AdminTeamMember } from "./types";

interface Props {
  members: AdminTeamMember[];
  deals: AdminDeal[];
  tasks: AdminTask[];
}

// Capacity heuristic from vanilla: dealCount / 5 * 100, capped at 100.
function capacityFor(dealCount: number): number {
  return Math.min(100, Math.round((dealCount / 5) * 100));
}

function initials(name?: string, email?: string): string {
  const raw = name || email || "";
  if (!raw) return "?";
  return raw
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function ResourceAllocation({ members, deals, tasks }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Build memberId -> dealNames[] map from the already-loaded deals array.
  // Matches vanilla admin-dashboard.js renderResourceAllocation: single pass
  // over allDeals instead of N sequential HTTP calls.
  const dealsByMember = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const deal of deals) {
      const name = deal.name || "Unknown";
      for (const tm of deal.teamMembers || []) {
        const uid = (tm as { user?: { id: string }; userId: string }).user?.id || tm.userId;
        if (!uid) continue;
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid)!.push(name);
      }
    }
    return map;
  }, [deals]);

  if (members.length === 0) {
    return (
      <div className="bg-surface-card rounded-xl border border-border-subtle shadow-card">
        <div className="p-5 border-b border-border-subtle flex justify-between items-center">
          <h2 className="text-base font-semibold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-text-muted text-[20px]">pie_chart</span>
            Resource Allocation
          </h2>
        </div>
        <div className="text-center py-8 text-text-muted">
          <span className="material-symbols-outlined text-[32px] mb-2 block">groups</span>
          <p className="text-sm font-medium">No team members yet</p>
          <p className="text-xs mt-1 mb-3">Invite your first team member to get started</p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            Invite Team
          </Link>
        </div>
      </div>
    );
  }

  const limit = expanded ? members.length : 8;
  const visible = members.slice(0, limit);

  return (
    <div
      id="resource-allocation"
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card scroll-mt-6"
    >
      <div className="p-5 border-b border-border-subtle flex justify-between items-center">
        <h2 className="text-base font-semibold text-text-main flex items-center gap-2">
          <span className="material-symbols-outlined text-text-muted text-[20px]">pie_chart</span>
          Resource Allocation
        </h2>
        {members.length > 8 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm text-primary font-medium hover:text-primary-hover transition-colors"
          >
            {expanded ? "Show Less" : `View All (${members.length})`}
          </button>
        )}
      </div>
      <div className="p-5 space-y-1">
        {visible.map((member) => {
          const memberDeals = dealsByMember.get(member.id) || [];
          const dealNames = memberDeals.slice(0, 3);
          const taskCount = tasks.filter(
            (t) => t.assignedTo === member.id && t.status !== "COMPLETED",
          ).length;
          const capacity = capacityFor(memberDeals.length);
          const barColor =
            capacity >= 80 ? "#ef4444" : capacity >= 50 ? "#f59e0b" : "#003366";

          return (
            <div
              key={member.id}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div
                className="w-10 h-10 rounded-full text-white text-sm font-medium flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "#003366" }}
              >
                {initials(member.name, member.email)}
              </div>
              <div className="w-28 flex-shrink-0 min-w-0">
                <p className="text-sm font-medium text-text-main truncate">
                  {member.name || member.email.split("@")[0]}
                </p>
                <p className="text-xs text-text-muted truncate">
                  {member.title || member.role || "Member"}
                </p>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-4 min-w-0">
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Active Deals</p>
                  <div className="flex gap-1 flex-wrap">
                    {dealNames.length > 0 ? (
                      dealNames.map((n, idx) => (
                        <span
                          key={idx}
                          className="text-xs bg-gray-100 text-text-secondary px-2 py-0.5 rounded border border-border-subtle"
                        >
                          {n}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-text-muted">None</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-1.5">Capacity ({capacity}%)</p>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${capacity}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right w-14 flex-shrink-0">
                <span className="block text-lg font-bold text-text-main">{taskCount}</span>
                <span className="text-xs text-text-muted">Tasks</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
