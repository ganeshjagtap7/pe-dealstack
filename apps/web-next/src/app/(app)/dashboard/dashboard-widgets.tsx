"use client";

// Inline core-widget JSX extracted from page.tsx. These are the three biggest
// blocks that lived inside the dashboard page render: Active Priorities table,
// My Tasks list, and AI Deal Signals scanner. Pulled out so page.tsx can stay
// under the 500-line cap. Behavior is unchanged — props mirror the closure
// state the page already had on hand.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { Deal, Task, fmtNextAction } from "./components";
import { SignalResults } from "./dashboard-modals";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Active Priorities widget                                               */
/* ──────────────────────────────────────────────────────────────────────── */

interface ActivePrioritiesWidgetProps {
  deals: Deal[];
  loading: boolean;
}

export function ActivePrioritiesWidget({ deals, loading }: ActivePrioritiesWidgetProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden group">
      <div className="p-5 border-b border-border-subtle flex items-center justify-between bg-white">
        <h3 className="font-bold text-text-main text-base">Active Priorities</h3>
        <div className="flex gap-2">
          <Link href="/deals" className="text-xs font-semibold text-text-secondary hover:text-primary hover:bg-primary-light px-3 py-1.5 rounded-md border border-transparent hover:border-primary/20 transition-all">View All</Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-text-secondary">
          <thead className="bg-gray-50 text-xs uppercase font-semibold text-text-secondary border-b border-border-subtle">
            <tr>
              <th className="px-5 py-3 tracking-wide">Deal Name</th>
              <th className="px-5 py-3 tracking-wide">Stage</th>
              <th className="px-5 py-3 tracking-wide">Value</th>
              <th className="px-5 py-3 tracking-wide">Next Action</th>
              <th className="px-5 py-3 tracking-wide">Team</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-white">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-5 py-4">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton.Line width="65%" height={14} />
                      <Skeleton.Line width="40%" height={11} />
                    </div>
                  </td>
                  <td className="px-5 py-4"><Skeleton.Badge width={88} /></td>
                  <td className="px-5 py-4"><Skeleton.Line width="60%" height={14} /></td>
                  <td className="px-5 py-4"><Skeleton.Line width="80%" height={13} /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center -space-x-1.5">
                      <Skeleton.Circle size={28} />
                      <Skeleton.Circle size={28} />
                    </div>
                  </td>
                </tr>
              ))
            ) : deals.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center">
                <span className="material-symbols-outlined text-text-muted text-[32px] mb-2 block opacity-60">priority_high</span>
                <p className="text-sm font-medium text-text-main">No active priorities</p>
                <p className="text-xs text-text-muted mt-1">Deals needing immediate attention will appear here</p>
              </td></tr>
            ) : deals.map((deal) => {
              const style = STAGE_STYLES[deal.stage] || STAGE_STYLES.INITIAL_REVIEW;
              const members: Array<{ name?: string; email?: string }> = [];
              if (deal.assignedUser) members.push(deal.assignedUser);
              if (deal.teamMembers) {
                deal.teamMembers.forEach((tm) => { if (tm.user) members.push(tm.user); });
              }
              return (
                <tr key={deal.id} onClick={() => router.push(`/deals/${deal.id}`)} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-text-main">{deal.name}</div>
                    <div className="text-xs text-text-muted">{deal.industry || ""}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={cn("inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap", style.bg, style.text, style.border)}>
                      {STAGE_LABELS[deal.stage] || deal.stage}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-text-main">{deal.dealSize != null ? formatCurrency(deal.dealSize, deal.currency) : "—"}</td>
                  <td className="px-5 py-4 text-text-secondary">{deal.nextAction || fmtNextAction(deal.stage)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center">
                      {members.length === 0 ? (
                        <span className="text-xs text-text-muted">Unassigned</span>
                      ) : members.slice(0, 3).map((m, mi) => (
                        <div key={mi} className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white border-2 border-white" style={{ backgroundColor: "#003366", marginLeft: mi === 0 ? 0 : "-6px" }} title={m.name || m.email || ""}>
                          {(m.name || m.email || "?").charAt(0).toUpperCase()}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  My Tasks widget                                                        */
/* ──────────────────────────────────────────────────────────────────────── */

interface MyTasksWidgetProps {
  tasks: Task[];
  pendingTasks: Task[];
  loading: boolean;
  taskError: string | null;
  onToggleTask: (taskId: string, currentStatus: string) => void;
  onOpenAllTasks: () => void;
}

export function MyTasksWidget({
  tasks,
  pendingTasks,
  loading,
  taskError,
  onToggleTask,
  onOpenAllTasks,
}: MyTasksWidgetProps) {
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden group">
      <div className="p-5 border-b border-border-subtle flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-text-secondary">check_circle</span>
          <h3 className="font-bold text-text-main text-base">My Tasks</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-primary-light text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/10">{pendingTasks.length} Pending</span>
        </div>
      </div>
      {taskError && (
        <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
          {taskError}
        </div>
      )}
      <div>
        {loading ? (
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex items-start gap-3 p-4", i < 3 && "border-b border-border-subtle/50")}>
                <Skeleton width={16} height={16} rounded="sm" className="mt-1" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <Skeleton.Line width={`${75 - i * 5}%`} height={13} />
                  <Skeleton.Line width="50%" height={11} />
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <span className="material-symbols-outlined text-3xl mb-2 text-secondary">task_alt</span>
            <span className="text-sm font-medium">All caught up!</span>
            <span className="text-xs mt-0.5">No tasks assigned to you</span>
          </div>
        ) : tasks.slice(0, 5).map((task, i) => {
          const done = task.status === "COMPLETED";
          const isOverdue = !done && task.dueDate && formatRelativeTime(task.dueDate).toLowerCase().includes("ago");
          const isDueToday = !done && task.dueDate && (() => { const d = new Date(task.dueDate!); const n = new Date(); return d.toDateString() === n.toDateString(); })();
          const dueColor = done ? "text-text-secondary" : isOverdue ? "text-red-500" : isDueToday ? "text-orange-500" : "text-text-muted";
          const dealName = task.deal?.name || task.dealName;
          return (
            <label key={task.id} className={cn("flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer group", i < Math.min(tasks.length, 5) - 1 && "border-b border-border-subtle/50")}>
              <input type="checkbox" checked={done} onChange={() => onToggleTask(task.id, task.status)} className="mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0" />
              <div className={cn("flex flex-col gap-0.5 flex-1", done && "opacity-50")}>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm text-text-main group-hover:text-primary transition-colors", done ? "font-medium line-through" : "font-semibold")}>{task.title}</span>
                  {!done && task.priority === "HIGH" && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">HIGH</span>}
                  {!done && task.priority === "LOW" && <span className="text-[10px] bg-gray-100 text-text-muted px-1.5 py-0.5 rounded font-bold">LOW</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-medium", dueColor)}>
                    {done ? "Completed" : task.dueDate ? formatRelativeTime(task.dueDate) : "No due date"}
                  </span>
                  {dealName && <span className="text-xs text-text-muted">· {dealName}</span>}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="p-3 bg-gray-50 text-center border-t border-border-subtle">
        <button onClick={onOpenAllTasks} className="text-xs font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wide">View All Tasks</button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  AI Deal Signals widget                                                 */
/* ──────────────────────────────────────────────────────────────────────── */

type SignalScanResult = {
  signals?: Array<{ title: string; description: string; severity: string; signalType: string; dealName: string; suggestedAction: string }>;
  processedCount?: number;
};

interface AiDealSignalsWidgetProps {
  scanning: boolean;
  signalResult: SignalScanResult | null;
  signalError: string | null;
  setScanning: (v: boolean) => void;
  setSignalResult: (v: SignalScanResult | null) => void;
  setSignalError: (v: string | null) => void;
}

export function AiDealSignalsWidget({
  scanning,
  signalResult,
  signalError,
  setScanning,
  setSignalResult,
  setSignalError,
}: AiDealSignalsWidgetProps) {
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden group">
      <div className="p-5 border-b border-border-subtle flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">radar</span>
          <h3 className="font-bold text-text-main text-base">AI Deal Signals</h3>
        </div>
        <button
          onClick={async () => {
            setScanning(true);
            setSignalResult(null);
            setSignalError(null);
            try {
              const result = await api.get<SignalScanResult>("/ai/scan-signals");
              setSignalResult(result);
            } catch (err) {
              console.warn("[dashboard] scan-signals failed:", err);
              setSignalError("Couldn't scan signals — please try again.");
              setTimeout(() => setSignalError(null), 5000);
            } finally {
              setScanning(false);
            }
          }}
          disabled={scanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
          style={{ backgroundColor: "#003366" }}
        >
          <span className={cn("material-symbols-outlined text-[16px]", scanning && "animate-spin")}>{scanning ? "progress_activity" : "radar"}</span>
          {scanning ? "Scanning..." : "Scan Signals"}
        </button>
      </div>
      {signalError && (
        <div className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {signalError}
        </div>
      )}
      {scanning ? (
        <div className="flex flex-col items-center justify-center py-8">
          <span className="material-symbols-outlined text-primary text-2xl animate-spin mb-2">radar</span>
          <p className="text-sm text-text-muted">Scanning portfolio for signals...</p>
        </div>
      ) : signalResult ? (
        <SignalResults result={signalResult} />
      ) : (
        <div className="p-5 text-center">
          <span className="material-symbols-outlined text-text-muted text-2xl mb-2">monitoring</span>
          <p className="text-sm font-medium text-text-main mb-1">Portfolio Signal Monitor</p>
          <p className="text-xs text-text-muted">Click &quot;Scan Signals&quot; to analyze your portfolio for risks, opportunities, and actionable deal signals using AI.</p>
        </div>
      )}
    </div>
  );
}
