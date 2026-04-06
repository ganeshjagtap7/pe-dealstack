"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { api } from "@/lib/api";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

interface Deal {
  id: string;
  name: string;
  stage: string;
  dealSize?: number;
  updatedAt: string;
  nextAction?: string;
  industry?: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  category?: string;
}

const SOURCING_STAGES = ["INITIAL_REVIEW"];
const DD_STAGES = ["DUE_DILIGENCE"];
const LOI_STAGES = ["IOI_SUBMITTED", "LOI_SUBMITTED", "NEGOTIATION"];
const CLOSED_STAGES = ["CLOSED_WON"];

const AVATAR_COLORS = [
  "bg-blue-100 border-blue-200 text-primary",
  "bg-purple-100 border-purple-200 text-purple-700",
  "bg-green-100 border-green-200 text-green-700",
  "bg-orange-100 border-orange-200 text-orange-700",
  "bg-pink-100 border-pink-200 text-pink-700",
];

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [stageModal, setStageModal] = useState<{ label: string; stages: string[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [dealsRes, tasksRes] = await Promise.allSettled([
          api.get<{ deals: Deal[]; total: number }>("/deals?limit=100&sortBy=updatedAt&sortOrder=desc"),
          api.get<{ tasks: Task[] } | Task[]>("/tasks?limit=5"),
        ]);
        if (dealsRes.status === "fulfilled") {
          setAllDeals(dealsRes.value.deals || []);
          setDeals((dealsRes.value.deals || []).slice(0, 5));
        }
        if (tasksRes.status === "fulfilled") {
          const t = tasksRes.value;
          setTasks(Array.isArray(t) ? t : t.tasks || []);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus } : t)));
    }
  };

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const sourcingCount = allDeals.filter((d) => SOURCING_STAGES.includes(d.stage)).length;
  const ddCount = allDeals.filter((d) => DD_STAGES.includes(d.stage)).length;
  const loiCount = allDeals.filter((d) => LOI_STAGES.includes(d.stage)).length;
  const closedTotal = allDeals.filter((d) => CLOSED_STAGES.includes(d.stage)).reduce((sum, d) => sum + (d.dealSize || 0), 0);
  const pendingTasks = tasks.filter((t) => t.status !== "COMPLETED");
  const firstName = user?.name?.split(" ")[0] || "there";

  const stageModalDeals = stageModal ? allDeals.filter((d) => stageModal.stages.includes(d.stage)) : [];

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div className="mx-auto max-w-[1600px] flex flex-col gap-6">
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Sourcing */}
          <button onClick={() => setStageModal({ label: "Sourcing", stages: SOURCING_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Sourcing</span>
              <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">travel_explore</span>
            </div>
            <div className="flex items-end gap-2 mt-3">
              <span className="text-3xl font-bold text-primary tracking-tight">{loading ? "—" : sourcingCount}</span>
              <span className="text-xs font-medium text-secondary mb-1.5 flex items-center bg-secondary-light px-1.5 py-0.5 rounded">
                <span className="material-symbols-outlined text-[14px] mr-0.5">arrow_upward</span> new
              </span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
              <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${Math.min(sourcingCount * 10, 100)}%` }} />
            </div>
          </button>

          {/* Due Diligence */}
          <button onClick={() => setStageModal({ label: "Due Diligence", stages: DD_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-primary bg-surface-card p-5 shadow-glow cursor-pointer group">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-3xl" />
            <div className="flex items-center justify-between relative z-10">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">Due Diligence</span>
              <span className="material-symbols-outlined text-primary text-[20px]">saved_search</span>
            </div>
            <div className="flex items-end gap-2 mt-3 relative z-10">
              <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? "—" : ddCount}</span>
              <span className="text-xs font-medium text-text-secondary mb-1.5">Active deals</span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden relative z-10">
              <div className="bg-primary h-1.5 rounded-full" style={{ width: "100%" }} />
            </div>
          </button>

          {/* LOI / Offer */}
          <button onClick={() => setStageModal({ label: "LOI / Offer", stages: LOI_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">LOI / Offer</span>
              <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">description</span>
            </div>
            <div className="flex items-end gap-2 mt-3">
              <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? "—" : loiCount}</span>
              <span className="text-xs font-medium text-text-secondary mb-1.5">Waiting response</span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
              <div className="bg-orange-400 h-1.5 rounded-full" style={{ width: `${Math.min(loiCount * 20, 100)}%` }} />
            </div>
          </button>

          {/* Closed */}
          <button onClick={() => setStageModal({ label: "Closed Won", stages: CLOSED_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Closed (Q4)</span>
              <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">verified</span>
            </div>
            <div className="flex items-end gap-2 mt-3">
              <span className="text-3xl font-bold text-text-main tracking-tight">
                {loading ? "—" : closedTotal > 0 ? formatCurrency(closedTotal) : "$0"}
              </span>
              <span className="text-xs font-medium text-secondary mb-1.5 flex items-center bg-secondary-light px-1.5 py-0.5 rounded">+12% vs Q3</span>
            </div>
            <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
              <div className="bg-secondary h-1.5 rounded-full" style={{ width: "100%" }} />
            </div>
          </button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* AI Market Sentiment */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card">
              <div className="p-6 border-b border-border-subtle flex items-start justify-between gap-4 bg-gradient-to-r from-white to-gray-50/50">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-secondary-light rounded text-secondary border border-secondary/20">
                      <span className="material-symbols-outlined text-[20px] block">psychology</span>
                    </div>
                    <h2 className="text-lg font-bold text-primary">AI Market Sentiment</h2>
                  </div>
                  <p className="text-text-secondary text-sm max-w-2xl leading-relaxed">
                    <span className="text-text-main font-semibold">Analysis:</span> SaaS valuations are stabilizing in the mid-market sector. The proprietary algorithm indicates a{" "}
                    <span className="text-secondary font-semibold">Bullish trend</span> for enterprise software.
                    <br />
                    <Link href="/deals" className="text-primary font-medium mt-2 inline-flex items-center gap-1 hover:underline">
                      Recommended Action: Review Q3 projections for Project Alpha.
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </Link>
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end border-l border-border-subtle pl-6 py-1">
                  <div className="text-4xl font-bold text-secondary">78</div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Confidence</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle bg-gray-50/30">
                {[
                  { icon: "trending_up", title: "Tech Recovery", sub: "+15% sector avg", color: "bg-secondary-light text-secondary border-secondary/10" },
                  { icon: "show_chart", title: "Low Volatility", sub: "Private mkts stable", color: "bg-blue-50 text-blue-600 border-blue-100" },
                  { icon: "hub", title: "Sector Focus", sub: "B2B Enterprise", color: "bg-orange-50 text-orange-600 border-orange-100" },
                ].map((item) => (
                  <div key={item.title} className="p-4 flex items-center gap-3 hover:bg-white transition-colors cursor-pointer group">
                    <div className={cn("p-2 rounded-md border", item.color)}>
                      <span className="material-symbols-outlined">{item.icon}</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-text-main">{item.title}</div>
                      <div className="text-xs text-text-secondary font-medium">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Priorities */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden">
              <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                <h3 className="font-bold text-text-main text-base">Active Priorities</h3>
                <Link href="/deals" className="text-xs font-semibold text-text-secondary hover:text-primary hover:bg-primary-light px-3 py-1.5 rounded-md transition-all">View All</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase font-semibold text-text-secondary border-b border-border-subtle">
                    <tr>
                      <th className="px-5 py-3">Deal Name</th>
                      <th className="px-5 py-3">Stage</th>
                      <th className="px-5 py-3">Value</th>
                      <th className="px-5 py-3">Next Action</th>
                      <th className="px-5 py-3">Team</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {loading ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-text-muted">Loading...</td></tr>
                    ) : deals.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-text-muted">No deals yet. <Link href="/deal-intake" className="text-primary font-medium hover:underline">Add your first deal</Link></td></tr>
                    ) : deals.map((deal, i) => {
                      const style = STAGE_STYLES[deal.stage] || STAGE_STYLES.INITIAL_REVIEW;
                      return (
                        <tr key={deal.id} onClick={() => router.push(`/deals/${deal.id}`)} className="hover:bg-primary-light/30 transition-colors cursor-pointer group">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn("size-8 rounded border flex items-center justify-center font-bold shadow-sm text-sm", AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                                {deal.name?.[0] || "D"}
                              </div>
                              <span className="font-semibold text-text-main group-hover:text-primary transition-colors">{deal.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={cn("inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium", style.bg, style.text, style.border)}>
                              {STAGE_LABELS[deal.stage] || deal.stage}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-text-main font-medium font-mono">{deal.dealSize != null ? formatCurrency(deal.dealSize) : "—"}</td>
                          <td className="px-5 py-4 text-text-main text-sm">{deal.nextAction || "—"}</td>
                          <td className="px-5 py-4">
                            <div className="flex -space-x-2">
                              <div className="inline-flex h-7 w-7 rounded-full ring-2 ring-white bg-gray-500 items-center justify-center text-[10px] text-white font-medium">{firstName?.[0] || "U"}</div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6">
            {/* Tasks */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden">
              <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-text-secondary text-[20px]">check_circle</span>
                  <h3 className="font-bold text-text-main text-base">My Tasks</h3>
                </div>
                <span className="bg-primary-light text-primary text-xs font-bold px-2.5 py-1 rounded-full border border-primary/10">{pendingTasks.length} Pending</span>
              </div>
              <div>
                {loading ? (
                  <div className="p-6 text-center text-text-muted text-sm">Loading...</div>
                ) : tasks.length === 0 ? (
                  <div className="p-6 text-center text-text-muted text-sm">No tasks assigned</div>
                ) : tasks.slice(0, 5).map((task, i) => {
                  const done = task.status === "COMPLETED";
                  return (
                    <label key={task.id} className={cn("flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer group", i < tasks.length - 1 && "border-b border-border-subtle/50")}>
                      <input type="checkbox" checked={done} onChange={() => toggleTask(task.id, task.status)} className="mt-1 size-4 rounded border-gray-300 text-primary focus:ring-primary" />
                      <div className={cn("flex flex-col gap-0.5", done && "opacity-50")}>
                        <span className={cn("text-sm font-semibold text-text-main group-hover:text-primary transition-colors", done && "line-through font-medium")}>{task.title}</span>
                        <span className="text-xs text-text-muted font-medium">
                          {done ? "Completed" : task.dueDate ? `Due ${formatRelativeTime(task.dueDate)}` : "No due date"}
                          {task.category ? ` · ${task.category}` : ""}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="p-3 bg-gray-50 text-center border-t border-border-subtle">
                <button onClick={() => router.push("/deals")} className="text-xs font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wide">View All Tasks</button>
              </div>
            </div>

            {/* Portfolio Allocation */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden p-6 gap-5">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-text-main">Portfolio Allocation</h3>
                <span className="material-symbols-outlined text-text-muted">pie_chart</span>
              </div>
              <div className="flex items-center gap-6">
                <div className="size-28 rounded-full border-[10px] border-primary border-r-secondary border-b-gray-300 rotate-45 shadow-inner" />
                <div className="flex flex-col gap-3 flex-1">
                  {[{ label: "SaaS", pct: "55%", color: "bg-primary" }, { label: "Healthcare", pct: "30%", color: "bg-secondary" }, { label: "Others", pct: "15%", color: "bg-gray-300" }].map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className={cn("size-2.5 rounded-sm shadow-sm", item.color)} />
                        <span className="text-text-secondary font-medium">{item.label}</span>
                      </div>
                      <span className="text-text-main font-bold">{item.pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Deal Signals */}
            <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card overflow-hidden">
              <div className="p-5 border-b border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">radar</span>
                  <h3 className="font-bold text-text-main text-base">AI Deal Signals</h3>
                </div>
                <button
                  onClick={async () => { setScanning(true); try { await api.get("/ai/scan-signals"); } catch {} finally { setScanning(false); } }}
                  disabled={scanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                  style={{ backgroundColor: "#003366" }}
                >
                  <span className={cn("material-symbols-outlined text-[16px]", scanning && "animate-spin")}>{scanning ? "progress_activity" : "radar"}</span>
                  {scanning ? "Scanning..." : "Scan Signals"}
                </button>
              </div>
              <div className="p-5 text-center">
                <span className="material-symbols-outlined text-text-muted text-2xl mb-2">monitoring</span>
                <p className="text-sm font-medium text-text-main mb-1">Portfolio Signal Monitor</p>
                <p className="text-xs text-text-muted">Click &quot;Scan Signals&quot; to analyze your portfolio for risks and opportunities.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Detail Modal */}
      {stageModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setStageModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-subtle">
              <h3 className="text-lg font-bold text-text-main">{stageModal.label} Deals</h3>
              <button onClick={() => setStageModal(null)} className="text-text-muted hover:text-text-main">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh] divide-y divide-border-subtle">
              {stageModalDeals.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-sm">No deals in this stage</div>
              ) : stageModalDeals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  onClick={() => setStageModal(null)}
                  className="flex items-center justify-between p-4 hover:bg-primary-light/30 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-main">{deal.name}</p>
                    <p className="text-xs text-text-muted">{deal.industry || "No industry"} · {formatRelativeTime(deal.updatedAt)}</p>
                  </div>
                  {deal.dealSize != null && (
                    <span className="text-sm font-medium text-text-main font-mono">{formatCurrency(deal.dealSize)}</span>
                  )}
                </Link>
              ))}
            </div>
            <div className="p-4 border-t border-border-subtle bg-gray-50 text-center">
              <Link href="/deals" onClick={() => setStageModal(null)} className="text-sm font-medium text-primary hover:underline">View all deals →</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
