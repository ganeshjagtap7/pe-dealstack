"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useUser } from "@/providers/UserProvider";
import { api } from "@/lib/api";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import {
  Deal,
  Task,
  SOURCING_STAGES,
  DD_STAGES,
  LOI_STAGES,
  CLOSED_STAGES,
  SECTOR_COLORS,
  getGreeting,
  StatCards,
  StageDetailModal,
  fmtNextAction,
  PortfolioAllocation,
} from "./components";
import { TasksModal, SignalResults } from "./dashboard-modals";
import { CustomizeDashboardModal } from "./widgets/customize-modal";
import { DraggableWidget } from "./widgets/draggable-widget";
import { useVisibleWidgets } from "./widgets/useVisibleWidgets";
import { useToast } from "@/providers/ToastProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import type { WidgetId, CoreWidgetId } from "./widgets/registry";

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [signalResult, setSignalResult] = useState<{ signals?: Array<{ title: string; description: string; severity: string; signalType: string; dealName: string; suggestedAction: string }>; processedCount?: number } | null>(null);
  const [stageModal, setStageModal] = useState<{ label: string; stages: string[] } | null>(null);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragging, setDragging] = useState<WidgetId | null>(null);
  const [draggingCore, setDraggingCore] = useState<CoreWidgetId | null>(null);
  const draggingCoreRef = useRef<CoreWidgetId | null>(null);
  const { visible, coreVisible, toggle, toggleCore, orderedVisible, reorder, orderedCoreIds, reorderCore } = useVisibleWidgets();

  // -----------------------------------------------------------------------
  // Edit mode helpers
  // -----------------------------------------------------------------------
  const exitEditMode = useCallback(() => {
    setIsEditing(false);
    setDraggingCore(null);
    draggingCoreRef.current = null;
    showToast("Your dashboard layout has been saved.", "success", { title: "Layout Saved" });
  }, [showToast]);

  const toggleEditMode = useCallback(() => {
    if (isEditing) {
      exitEditMode();
    } else {
      setIsEditing(true);
    }
  }, [isEditing, exitEditMode]);

  // Core widget drag handlers for edit mode
  const onCoreDragStart = useCallback((id: CoreWidgetId) => {
    setDraggingCore(id);
    draggingCoreRef.current = id;
  }, []);

  const onCoreDragEnter = useCallback((targetId: CoreWidgetId) => {
    const sourceId = draggingCoreRef.current;
    if (!sourceId || sourceId === targetId) return;
    const ids = [...orderedCoreIds];
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    reorderCore(next);
  }, [orderedCoreIds, reorderCore]);

  const onCoreDragEnd = useCallback(() => {
    setDraggingCore(null);
    draggingCoreRef.current = null;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [dealsRes, tasksRes] = await Promise.allSettled([
          api.get<Deal[] | { deals: Deal[] }>("/deals?limit=100&sortBy=updatedAt&sortOrder=desc"),
          api.get<{ tasks: Task[] } | Task[]>("/tasks?limit=20"),
        ]);
        if (dealsRes.status === "fulfilled") {
          // API returns plain array; handle both formats for safety
          const rawDeals = Array.isArray(dealsRes.value)
            ? dealsRes.value
            : (dealsRes.value as { deals: Deal[] }).deals || [];
          setAllDeals(rawDeals);
          // Active Priorities: filter active, sort by priority (HIGH first) — matches legacy loadActivePriorities
          const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          const activeForPriorities = rawDeals
            .filter((d) => d.status !== "ARCHIVED" && d.status !== "PASSED")
            .sort((a, b) => (PRIORITY_ORDER[a.priority || ""] ?? 99) - (PRIORITY_ORDER[b.priority || ""] ?? 99))
            .slice(0, 5);
          setDeals(activeForPriorities);
        } else {
          console.warn("[dashboard] failed to load deals:", dealsRes.reason);
        }
        if (tasksRes.status === "fulfilled") {
          const t = tasksRes.value;
          setTasks(Array.isArray(t) ? t : t.tasks || []);
        } else {
          console.warn("[dashboard] failed to load tasks:", tasksRes.reason);
        }
      } catch (err) {
        console.warn("[dashboard] load error:", err);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  // Esc exits layout edit mode — mirrors onKeyDown in layout-editor.js
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitEditMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isEditing, exitEditMode]);

  const [taskError, setTaskError] = useState<string | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
    } catch (err) {
      console.warn("[dashboard] toggleTask failed:", err);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t)));
      setTaskError("Couldn't update task — please try again.");
      setTimeout(() => setTaskError(null), 3500);
    }
  };

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const activeDeals = allDeals.filter((d) => d.status !== "ARCHIVED");
  const activeTotal = Math.max(activeDeals.length, 1);
  const sourcingCount = activeDeals.filter((d) => SOURCING_STAGES.includes(d.stage)).length;
  const ddCount = activeDeals.filter((d) => DD_STAGES.includes(d.stage)).length;
  const loiCount = activeDeals.filter((d) => LOI_STAGES.includes(d.stage)).length;
  const closedCount = activeDeals.filter((d) => CLOSED_STAGES.includes(d.stage)).length;
  const closedTotal = activeDeals
    .filter((d) => CLOSED_STAGES.includes(d.stage))
    .reduce((sum, d) => sum + (d.dealSize || 0), 0);
  const pct = (n: number) => Math.round((n / activeTotal) * 100);
  const pendingTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const firstName = user?.name?.split(" ")[0] || "there";

  // Portfolio allocation: group active deals by industry, take top 4, rest -> "Others"
  const industryCounts = activeDeals.reduce<Record<string, number>>((acc, d) => {
    const key = (d.industry?.trim() || "Uncategorized");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const sortedSectors = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]);
  const topSectors = sortedSectors.slice(0, 4);
  const othersCount = sortedSectors.slice(4).reduce((sum, [, c]) => sum + c, 0);
  if (othersCount > 0) topSectors.push(["Others", othersCount]);
  const sectorTotal = topSectors.reduce((sum, [, c]) => sum + c, 0);
  const allocation = topSectors.map(([label, count], i) => ({
    label,
    count,
    pct: sectorTotal > 0 ? Math.round((count / sectorTotal) * 100) : 0,
    color: SECTOR_COLORS[i] || SECTOR_COLORS[SECTOR_COLORS.length - 1],
  }));
  let cumPct = 0;
  const gradientParts = allocation.map((a) => {
    const start = cumPct;
    cumPct += a.pct;
    return `${a.color} ${start}% ${cumPct}%`;
  });

  // Helper: wraps a core widget in edit-mode decoration (dashed border, drag handle)
  const wrapCoreWidget = (coreId: CoreWidgetId, content: React.ReactNode, extraClass?: string) => {
    const isDragged = draggingCore === coreId;
    return (
      <div
        key={coreId}
        data-widget={coreId}
        draggable={isEditing}
        onDragStart={(e) => {
          if (!isEditing) return;
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", coreId);
          } catch (err) {
            // Firefox quirk — drag-and-drop still works without setData.
            console.warn("[dashboard] dataTransfer.setData failed for core widget:", err);
          }
          onCoreDragStart(coreId);
        }}
        onDragOver={(e) => {
          if (!isEditing || !draggingCoreRef.current || draggingCoreRef.current === coreId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onCoreDragEnter(coreId);
        }}
        onDrop={(e) => { if (isEditing) e.preventDefault(); }}
        onDragEnd={() => { if (isEditing) onCoreDragEnd(); }}
        className={cn(
          "relative transition-opacity",
          extraClass,
          isEditing && "outline-2 outline-dashed outline-offset-2 outline-[#003366] rounded-lg",
          isDragged && "opacity-50",
        )}
      >
        {isEditing && (
          <span
            className="material-symbols-outlined cursor-grab active:cursor-grabbing absolute top-2 right-2 z-20 bg-white text-[#003366] rounded-md p-1 shadow-md text-[18px]"
            title="Drag to reorder"
          >
            drag_indicator
          </span>
        )}
        {content}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <WelcomeModal />
      <div className="mx-auto max-w-[1600px] w-full flex flex-col gap-6">
        {/* Welcome */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-main tracking-tight font-display">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-text-secondary text-sm">
            Here is your deal flow update and AI market analysis for{" "}
            <span className="font-medium text-primary">{today}</span>.
          </p>
        </div>

        {/* Onboarding Checklist */}
        <OnboardingChecklist />

        {/* Edit-mode banner — matches #layout-edit-banner in
            apps/web/js/widgets/layout-editor.js. Shown at top of widgets. */}
        {isEditing && (
          <div
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-white text-[13px] font-semibold shadow-md"
            style={{ background: "linear-gradient(90deg, #003366 0%, #004488 100%)", boxShadow: "0 2px 8px rgba(0, 51, 102, 0.2)" }}
          >
            <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
            <span className="flex-1">
              Drag widgets by the handle to reorder &middot; Click <strong>Done</strong> when finished
            </span>
            <button
              type="button"
              onClick={exitEditMode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-white/20 hover:bg-white/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              Done
            </button>
          </div>
        )}

        {/* Stats Cards — always rendered above the grid (full-width) */}
        {coreVisible.has("stats-cards") && wrapCoreWidget(
          "stats-cards",
          <StatCards
            loading={loading}
            sourcingCount={sourcingCount}
            ddCount={ddCount}
            loiCount={loiCount}
            closedCount={closedCount}
            closedTotal={closedTotal}
            pct={pct}
            onStageClick={setStageModal}
          />,
        )}

        {/* Active Priorities — rendered as a full-width hero row above the
             masonry. CSS multi-column layout below can't honour col-span-full,
             so this widget lives outside the column flow. Drag-and-drop
             reordering still works because it swaps array indices in
             orderedCoreIds; the visual layout is independent.
             Order is driven by orderedCoreIds from useVisibleWidgets. */}
        {orderedCoreIds
          .filter((id) => id === "active-priorities" && coreVisible.has(id))
          .map((coreId) => {
            if (coreId === "active-priorities") {
              return wrapCoreWidget(
                "active-priorities",
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
                                <td className="px-5 py-4 font-mono font-semibold text-text-main">{deal.dealSize != null ? formatCurrency(deal.dealSize, deal.currency) : "\u2014"}</td>
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
                  </div>,
                );
              }
              return null;
            })}

        {/* Remaining core widgets — CSS multi-column masonry. Each widget
             flows into the next available column slot, so a tall widget in
             column 1 doesn't force columns 2 & 3 to leave empty whitespace
             below their content. `break-inside-avoid` keeps each card in a
             single column. Drag-and-drop reorder still works: drop targets
             swap array positions in orderedCoreIds via onCoreDragEnter, the
             columns then re-flow to match. */}
        <div className="columns-1 md:columns-2 lg:columns-3 gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {orderedCoreIds
            .filter((id) => id !== "stats-cards" && id !== "active-priorities" && coreVisible.has(id))
            .map((coreId) => {
              if (coreId === "my-tasks") {
                return wrapCoreWidget(
                  "my-tasks",
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
                            <input type="checkbox" checked={done} onChange={() => toggleTask(task.id, task.status)} className="mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0" />
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
                      <button onClick={() => setTasksModalOpen(true)} className="text-xs font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wide">View All Tasks</button>
                    </div>
                  </div>,
                );
              }

              if (coreId === "portfolio-allocation") {
                return wrapCoreWidget(
                  "portfolio-allocation",
                  <PortfolioAllocation loading={loading} allocation={allocation} gradientParts={gradientParts} />,
                );
              }

              if (coreId === "ai-deal-signals") {
                return wrapCoreWidget(
                  "ai-deal-signals",
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
                            const result = await api.get<{ signals?: Array<{ title: string; description: string; severity: string; signalType: string; dealName: string; suggestedAction: string }>; processedCount?: number }>("/ai/scan-signals");
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
                  </div>,
                );
              }

              return null;
            })}
        </div>{/* /dashboard-widget-grid */}

        {/* Optional widgets (user-customizable via Customize button below).
             Same CSS multi-column masonry approach as the core widgets above
             so short widgets don't leave dead vertical space below them. */}
        {orderedVisible.length > 0 && (
          <div className="columns-1 md:columns-2 lg:columns-3 gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {orderedVisible.map((w) => (
              <DraggableWidget
                key={w.id}
                id={w.id}
                editing={isEditing}
                dragState={{ dragging }}
                onDragStart={setDragging}
                onDragEnter={(targetId) => {
                  if (!dragging || dragging === targetId) return;
                  const ids = orderedVisible.map((x) => x.id);
                  const from = ids.indexOf(dragging);
                  const to = ids.indexOf(targetId);
                  if (from === -1 || to === -1) return;
                  const next = [...ids];
                  next.splice(from, 1);
                  next.splice(to, 0, dragging);
                  reorder(next);
                }}
                onDragEnd={() => setDragging(null)}
              >
                <w.Component />
              </DraggableWidget>
            ))}
          </div>
        )}

        {/* Bottom action buttons — "Add Widget" opens the visibility picker
            modal, "Customize Dashboard" toggles inline edit mode matching
            legacy layout-editor.js behavior. */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2">
          <button
            type="button"
            onClick={() => setCustomizeOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-subtle p-4 text-text-muted hover:border-primary hover:text-primary hover:bg-primary-light/50 transition-all group bg-surface-card/50"
          >
            <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_circle</span>
            <span className="text-sm font-semibold">Add Widget</span>
          </button>
          <button
            type="button"
            onClick={toggleEditMode}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 text-sm font-medium transition-all",
              isEditing
                ? "text-white border-transparent"
                : "text-text-muted border-border-subtle bg-surface-card/50 hover:border-primary hover:text-primary hover:bg-primary-light/50",
            )}
            style={isEditing ? { backgroundColor: "#003366" } : undefined}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isEditing ? "check" : "tune"}
            </span>
            {isEditing ? "Done" : "Customize Dashboard"}
          </button>
        </div>
      </div>

      {/* Stage Detail Modal */}
      {stageModal && (
        <StageDetailModal stageModal={stageModal} deals={allDeals} onClose={() => setStageModal(null)} />
      )}

      <CustomizeDashboardModal
        open={customizeOpen}
        visible={visible}
        coreVisible={coreVisible}
        coreOrder={orderedCoreIds}
        onToggle={toggle}
        onToggleCore={toggleCore}
        onReorderCore={reorderCore}
        onClose={() => setCustomizeOpen(false)}
      />

      {tasksModalOpen && (
        <TasksModal tasks={tasks} onClose={() => setTasksModalOpen(false)} />
      )}
    </div>
  );
}
