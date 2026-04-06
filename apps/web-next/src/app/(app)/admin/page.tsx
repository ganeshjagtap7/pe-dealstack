"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { api } from "@/lib/api";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

// ─── Types ──────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
  email: string;
  title: string;
  role: string;
  avatar: string;
  isActive: boolean;
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  dealSize: number;
  teamMembers?: { userId: string }[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assignedTo: string;
  assigneeName?: string;
  dealId?: string;
  dealName?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  entityName?: string;
  resourceName?: string;
  userEmail?: string;
  createdAt: string;
}

// ─── Constants ──────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PENDING:      { bg: "bg-amber-100",   text: "text-amber-700" },
  IN_PROGRESS:  { bg: "bg-blue-100",    text: "text-blue-700" },
  COMPLETED:    { bg: "bg-emerald-100", text: "text-emerald-700" },
  STUCK:        { bg: "bg-red-100",     text: "text-red-700" },
  CANCELLED:    { bg: "bg-gray-100",    text: "text-gray-600" },
};

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
  URGENT: { bg: "bg-red-100",    text: "text-red-700" },
  HIGH:   { bg: "bg-orange-100", text: "text-orange-700" },
  MEDIUM: { bg: "bg-amber-100",  text: "text-amber-700" },
  LOW:    { bg: "bg-gray-100",   text: "text-gray-600" },
};

const ACTION_MAP: Record<string, { icon: string }> = {
  DEAL_CREATED:         { icon: "add_circle" },
  DEAL_UPDATED:         { icon: "edit" },
  DEAL_DELETED:         { icon: "delete" },
  DEAL_STAGE_CHANGED:   { icon: "arrow_forward" },
  DEAL_ASSIGNED:        { icon: "person_add" },
  DOCUMENT_UPLOADED:    { icon: "upload_file" },
  DOCUMENT_DELETED:     { icon: "delete" },
  DOCUMENT_DOWNLOADED:  { icon: "download" },
  MEMO_CREATED:         { icon: "description" },
  MEMO_UPDATED:         { icon: "edit_note" },
  USER_CREATED:         { icon: "person_add" },
  USER_INVITED:         { icon: "mail" },
  INVITATION_ACCEPTED:  { icon: "how_to_reg" },
  AI_INGEST:            { icon: "auto_awesome" },
  AI_GENERATE:          { icon: "auto_awesome" },
  LOGIN:                { icon: "login" },
  SETTINGS_CHANGED:     { icon: "settings" },
};

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatActionText(log: AuditLog): string {
  const entity = log.entityName || log.resourceName || "";
  const actionTexts: Record<string, string> = {
    DEAL_CREATED: `created deal ${entity}`,
    DEAL_UPDATED: `updated ${entity}`,
    DEAL_DELETED: `deleted deal ${entity}`,
    DEAL_STAGE_CHANGED: `moved ${entity} to a new stage`,
    DEAL_ASSIGNED: `assigned ${entity}`,
    DOCUMENT_UPLOADED: `uploaded ${entity}`,
    DOCUMENT_DELETED: `deleted document ${entity}`,
    MEMO_CREATED: `created memo ${entity}`,
    USER_CREATED: `added team member ${entity}`,
    USER_INVITED: `invited ${entity}`,
    INVITATION_ACCEPTED: `${entity} accepted invitation`,
    AI_INGEST: `ingested document ${entity}`,
    AI_GENERATE: `generated analysis for ${entity}`,
    LOGIN: "logged in",
    SETTINGS_CHANGED: "updated settings",
  };
  return actionTexts[log.action] || `performed ${log.action || "an action"}`;
}

// ─── Page Component ─────────────────────────────────────────

export default function AdminPage() {
  const { user } = useUser();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activityLogs, setActivityLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Data Loading ─────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      try {
        const [teamRes, dealsRes, tasksRes, activityRes] = await Promise.all([
          api.get<TeamMember[] | { users: TeamMember[] }>("/users?isActive=true").catch(() => []),
          api.get<{ deals: Deal[] } | Deal[]>("/deals").catch(() => []),
          api.get<{ tasks: Task[] }>("/tasks?limit=100").catch(() => ({ tasks: [] })),
          api.get<{ logs: AuditLog[] }>("/audit?limit=10").catch(() => ({ logs: [] })),
        ]);

        const teamArr = Array.isArray(teamRes) ? teamRes : (teamRes as { users: TeamMember[] }).users || [];
        setTeamMembers(teamArr);

        const dealData = Array.isArray(dealsRes) ? dealsRes : (dealsRes as { deals: Deal[] }).deals || [];
        setDeals(dealData);

        setTasks((tasksRes as { tasks: Task[] }).tasks || []);
        setActivityLogs((activityRes as { logs: AuditLog[] }).logs || []);
      } catch {
        // Partial load is acceptable
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // ─── Computed Stats ───────────────────────────────────────

  const now = new Date();
  const pendingTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "STUCK");
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "COMPLETED"
  );
  const totalVolume = deals.reduce((sum, d) => sum + (d.dealSize || 0), 0);

  // Members with deal assignments
  const membersWithDeals = new Set<string>();
  deals.forEach((d) => {
    if (d.teamMembers) d.teamMembers.forEach((tm) => membersWithDeals.add(tm.userId));
  });

  // Deal count per member
  const dealCountByMember: Record<string, number> = {};
  deals.forEach((d) => {
    if (d.teamMembers) {
      d.teamMembers.forEach((tm) => {
        dealCountByMember[tm.userId] = (dealCountByMember[tm.userId] || 0) + 1;
      });
    }
  });

  const taskCountByMember: Record<string, number> = {};
  tasks
    .filter((t) => t.status !== "COMPLETED")
    .forEach((t) => {
      if (t.assignedTo) {
        taskCountByMember[t.assignedTo] = (taskCountByMember[t.assignedTo] || 0) + 1;
      }
    });

  // ─── RBAC Gate ────────────────────────────────────────────

  if (user && user.systemRole !== "ADMIN") {
    return (
      <div className="p-6 mx-auto max-w-[1600px] flex items-center justify-center py-20">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-red-400">lock</span>
          <h2 className="mt-3 text-lg font-bold text-text-main">Access Denied</h2>
          <p className="text-sm text-text-muted mt-1">You do not have permission to view the admin dashboard.</p>
        </div>
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 mx-auto max-w-[1600px] flex items-center justify-center py-20">
        <div className="text-center text-text-muted">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="p-6 mx-auto max-w-[1600px] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Command Center</h1>
          <p className="text-text-secondary text-sm mt-0.5 flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            Last updated: Just now
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard
          label="Team Members"
          value={teamMembers.length}
          icon="groups"
          color="blue"
          progress={Math.min(100, teamMembers.length * 10)}
        />
        <StatsCard
          label="Deal Volume"
          value={formatCurrency(totalVolume)}
          icon="trending_up"
          color="emerald"
          progress={Math.min(100, (totalVolume / 1000) * 10)}
        />
        <StatsCard
          label="Overdue Tasks"
          value={overdueTasks.length || pendingTasks.length}
          icon="warning"
          color="amber"
          subtitle={`${pendingTasks.length} Pending`}
          progress={overdueTasks.length > 0 ? Math.min(100, overdueTasks.length * 20) : 10}
        />
        <StatsCard
          label="Utilization"
          value={`${teamMembers.length > 0 ? Math.min(100, Math.round((membersWithDeals.size / teamMembers.length) * 100)) : 0}%`}
          icon="speed"
          color="purple"
          progress={teamMembers.length > 0 ? Math.min(100, Math.round((membersWithDeals.size / teamMembers.length) * 100)) : 0}
        />
      </div>

      {/* Two-column layout: Team + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Members */}
        <div className="lg:col-span-2 rounded-lg border border-border-subtle bg-surface-card shadow-card">
          <div className="flex items-center justify-between p-5 border-b border-border-subtle">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-text-muted">groups</span>
              Resource Allocation
            </h2>
            <span className="text-xs text-text-muted">{teamMembers.length} members</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {teamMembers.length === 0 ? (
              <div className="p-8 text-center text-text-muted">
                <span className="material-symbols-outlined text-[32px] mb-2 block">groups</span>
                <p className="text-sm">No team members found</p>
              </div>
            ) : (
              teamMembers.slice(0, 8).map((member) => {
                const memberDeals = dealCountByMember[member.id] || 0;
                const memberTasks = taskCountByMember[member.id] || 0;
                const capacity = Math.min(100, memberDeals * 25 + memberTasks * 10);

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-background-body/50 transition-colors"
                  >
                    <div className="size-10 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center flex-shrink-0">
                      {getInitials(member.name || member.email)}
                    </div>
                    <div className="w-28 flex-shrink-0 min-w-0">
                      <p className="text-sm font-medium text-text-main truncate">
                        {member.name || member.email.split("@")[0]}
                      </p>
                      <p className="text-xs text-text-muted truncate">{member.title || member.role || "Member"}</p>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-text-muted mb-1.5">Active Deals</p>
                        <span className="text-sm font-semibold text-text-main">{memberDeals}</span>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted mb-1.5">Capacity ({capacity}%)</p>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              capacity > 80 ? "bg-red-500" : capacity > 50 ? "bg-amber-500" : "bg-primary"
                            )}
                            style={{ width: `${capacity}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-right w-14 flex-shrink-0">
                      <span className="block text-lg font-bold text-text-main">{memberTasks}</span>
                      <span className="text-xs text-text-muted">Tasks</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-lg border border-border-subtle bg-surface-card shadow-card">
          <div className="flex items-center justify-between p-5 border-b border-border-subtle">
            <h2 className="text-base font-bold text-text-main flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-text-muted">rss_feed</span>
              Activity
            </h2>
          </div>
          <div className="p-5">
            {activityLogs.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <span className="material-symbols-outlined text-[24px] mb-2 block">rss_feed</span>
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5 relative">
                {/* Timeline line */}
                <div className="absolute left-[18px] top-4 bottom-4 w-px bg-border-subtle" />

                {activityLogs.map((log) => {
                  const userName = log.userEmail?.split("@")[0] || "System";
                  const isAI = log.action?.startsWith("AI_");
                  const actionIcon = ACTION_MAP[log.action]?.icon || "info";

                  return (
                    <div key={log.id} className="flex gap-3 relative z-10">
                      <div className="relative flex-shrink-0">
                        <div className="size-9 rounded-full bg-primary text-white text-xs font-medium flex items-center justify-center">
                          {isAI ? (
                            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                          ) : (
                            getInitials(userName)
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 bg-primary rounded-full size-4 flex items-center justify-center border-2 border-white">
                          <span className="material-symbols-outlined text-white text-[10px]">{actionIcon}</span>
                        </div>
                      </div>
                      <div className="flex-1 pt-0.5">
                        <p className="text-sm text-text-main">
                          <span className={cn("font-semibold", isAI && "text-primary")}>
                            {isAI ? "PE OS AI" : userName}
                          </span>{" "}
                          {formatActionText(log)}
                        </p>
                        <p className="text-xs text-text-muted mt-1">{formatRelativeTime(log.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="rounded-lg border border-border-subtle bg-surface-card shadow-card">
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-text-muted">task_alt</span>
            Tasks Overview
          </h2>
          <span className="text-xs text-text-muted">
            {tasks.length} total / {pendingTasks.length} pending
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            <span className="material-symbols-outlined text-[32px] mb-2 block">task_alt</span>
            <p className="text-sm">No tasks found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-background-body">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Task</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Assignee</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Priority</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {tasks.slice(0, 20).map((task) => {
                  const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES.PENDING;
                  const priorityStyle = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM;
                  const isOverdue =
                    task.dueDate && new Date(task.dueDate) < now && task.status !== "COMPLETED";
                  const assignee = teamMembers.find((m) => m.id === task.assignedTo);

                  return (
                    <tr key={task.id} className="hover:bg-background-body/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-text-main truncate max-w-xs">{task.title}</p>
                          {task.dealName && (
                            <p className="text-xs text-primary mt-0.5">{task.dealName}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded-full bg-primary text-white text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                            {getInitials(assignee?.name || task.assigneeName)}
                          </div>
                          <span className="text-text-secondary text-sm truncate">
                            {assignee?.name || task.assigneeName || "Unassigned"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                            statusStyle.bg,
                            statusStyle.text
                          )}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                            priorityStyle.bg,
                            priorityStyle.text
                          )}
                        >
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {task.dueDate ? (
                          <span className={cn("text-sm", isOverdue ? "text-red-600 font-medium" : "text-text-secondary")}>
                            {isOverdue && (
                              <span className="material-symbols-outlined text-[14px] mr-1 align-middle">warning</span>
                            )}
                            {new Date(task.dueDate).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-text-muted">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stats Card Component ───────────────────────────────────

function StatsCard({
  label,
  value,
  icon,
  color,
  subtitle,
  progress,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: "blue" | "emerald" | "amber" | "purple";
  subtitle?: string;
  progress: number;
}) {
  const colorMap = {
    blue:    { bg: "bg-blue-50",    text: "text-blue-600",    bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600", bar: "bg-emerald-500" },
    amber:   { bg: "bg-amber-50",   text: "text-amber-600",   bar: "bg-amber-500" },
    purple:  { bg: "bg-purple-50",  text: "text-purple-600",  bar: "bg-purple-500" },
  };
  const c = colorMap[color];

  return (
    <div className="relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">{label}</span>
        <div className={cn("size-8 rounded-lg flex items-center justify-center", c.bg)}>
          <span className={cn("material-symbols-outlined text-[18px]", c.text)}>{icon}</span>
        </div>
      </div>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-3xl font-bold text-primary tracking-tight">{value}</span>
      </div>
      {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-2">
        <div className={cn("h-full rounded-full transition-all", c.bar)} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
