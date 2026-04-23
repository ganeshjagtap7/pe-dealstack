"use client";

import { cn } from "@/lib/cn";
import { formatCurrency, formatRelativeTime } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Deal {
  id: string;
  name: string;
  stage: string;
  dealSize?: number;
  currency?: string;
  updatedAt: string;
  nextAction?: string;
  industry?: string;
  priority?: string;
  status?: string;
  assignedUser?: { id?: string; name?: string; email?: string };
  teamMembers?: Array<{ userId?: string; user?: { id?: string; name?: string; email?: string } }>;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string;
  category?: string;
  dealId?: string;
  dealName?: string;
  deal?: { id?: string; name?: string };
}

export interface MarketSentiment {
  headline: string;
  analysis: string;
  sentiment: "BULLISH" | "NEUTRAL" | "BEARISH";
  confidenceScore: number;
  recommendation: string;
  indicators: { name: string; trend: "up" | "down" | "stable"; detail: string }[];
  topSector: string;
  riskFactor: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SOURCING_STAGES = ["INITIAL_REVIEW"];
export const DD_STAGES = ["DUE_DILIGENCE"];
export const LOI_STAGES = ["IOI_SUBMITTED", "LOI_SUBMITTED"];
export const CLOSED_STAGES = ["NEGOTIATION", "CLOSING", "CLOSED_WON"];

export const SECTOR_COLORS = ["#003366", "#059669", "#F59E0B", "#8B5CF6", "#9CA3AF"];

export const SENTIMENT_STYLES: Record<MarketSentiment["sentiment"], { label: string; tone: string }> = {
  BULLISH: { label: "Bullish trend", tone: "text-secondary font-semibold" },
  NEUTRAL: { label: "Neutral outlook", tone: "text-text-main font-semibold" },
  BEARISH: { label: "Bearish signal", tone: "text-red-600 font-semibold" },
};

export const TREND_ICONS: Record<"up" | "down" | "stable", { icon: string; tone: string }> = {
  up: { icon: "trending_up", tone: "bg-secondary-light text-secondary border-secondary/10" },
  down: { icon: "trending_down", tone: "bg-red-50 text-red-600 border-red-100" },
  stable: { icon: "show_chart", tone: "bg-blue-50 text-blue-600 border-blue-100" },
};

export const AVATAR_COLORS = [
  "bg-blue-100 border-blue-200 text-primary",
  "bg-purple-100 border-purple-200 text-purple-700",
  "bg-green-100 border-green-200 text-green-700",
  "bg-orange-100 border-orange-200 text-orange-700",
  "bg-pink-100 border-pink-200 text-pink-700",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

// ---------------------------------------------------------------------------
// StatCards
// ---------------------------------------------------------------------------

interface StatCardsProps {
  loading: boolean;
  sourcingCount: number;
  ddCount: number;
  loiCount: number;
  closedCount: number;
  closedTotal: number;
  pct: (n: number) => number;
  onStageClick: (modal: { label: string; stages: string[] }) => void;
}

export function StatCards({ loading, sourcingCount, ddCount, loiCount, closedCount, closedTotal, pct, onStageClick }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Sourcing */}
      <button onClick={() => onStageClick({ label: "Sourcing", stages: SOURCING_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Sourcing</span>
          <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">travel_explore</span>
        </div>
        <div className="flex items-end gap-2 mt-3">
          <span className="text-3xl font-bold text-primary tracking-tight">{loading ? "\u2014" : sourcingCount}</span>
          <span className="text-xs font-medium text-text-secondary mb-1.5">{sourcingCount === 1 ? "deal" : "deals"}</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
          <div className="bg-blue-400 h-1.5 rounded-full transition-all" style={{ width: `${pct(sourcingCount)}%` }} />
        </div>
      </button>

      {/* Due Diligence */}
      <button onClick={() => onStageClick({ label: "Due Diligence", stages: DD_STAGES })} className={cn("text-left relative flex flex-col gap-1 rounded-lg bg-surface-card p-5 transition-all cursor-pointer group", ddCount > 0 ? "border border-primary shadow-glow" : "border border-border-subtle shadow-card hover:shadow-card-hover hover:border-primary/30")}>
        {ddCount > 0 && <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-3xl" />}
        <div className="flex items-center justify-between relative z-10">
          <span className={cn("text-xs font-bold uppercase tracking-wider", ddCount > 0 ? "text-primary" : "text-text-secondary")}>Due Diligence</span>
          <span className={cn("material-symbols-outlined text-[20px]", ddCount > 0 ? "text-primary" : "text-text-muted group-hover:text-primary")}>saved_search</span>
        </div>
        <div className="flex items-end gap-2 mt-3 relative z-10">
          <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? "\u2014" : ddCount}</span>
          <span className="text-xs font-medium text-text-secondary mb-1.5">{ddCount === 1 ? "active" : "active"}</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden relative z-10">
          <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct(ddCount)}%` }} />
        </div>
      </button>

      {/* LOI / Offer */}
      <button onClick={() => onStageClick({ label: "LOI / Offer", stages: LOI_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">LOI / Offer</span>
          <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">description</span>
        </div>
        <div className="flex items-end gap-2 mt-3">
          <span className="text-3xl font-bold text-text-main tracking-tight">{loading ? "\u2014" : loiCount}</span>
          <span className="text-xs font-medium text-text-secondary mb-1.5">Awaiting response</span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
          <div className="bg-orange-400 h-1.5 rounded-full transition-all" style={{ width: `${pct(loiCount)}%` }} />
        </div>
      </button>

      {/* Closed */}
      <button onClick={() => onStageClick({ label: "Closed", stages: CLOSED_STAGES })} className="text-left relative flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Closed</span>
          <span className="material-symbols-outlined text-text-muted group-hover:text-primary transition-colors text-[20px]">verified</span>
        </div>
        <div className="flex items-end gap-2 mt-3">
          <span className="text-3xl font-bold text-text-main tracking-tight">
            {loading ? "\u2014" : closedTotal > 0 ? formatCurrency(closedTotal) : closedCount}
          </span>
          <span className="text-xs font-medium text-text-secondary mb-1.5">
            {closedTotal > 0 ? `${closedCount} ${closedCount === 1 ? "deal" : "deals"}` : closedCount === 1 ? "deal" : "deals"}
          </span>
        </div>
        <div className="w-full bg-gray-100 h-1.5 mt-4 rounded-full overflow-hidden">
          <div className="bg-secondary h-1.5 rounded-full transition-all" style={{ width: `${pct(closedCount)}%` }} />
        </div>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarketSentimentCard
// ---------------------------------------------------------------------------

interface MarketSentimentCardProps {
  sentiment: MarketSentiment | null;
  sentimentLoading: boolean;
  sentimentError: boolean;
}

export function MarketSentimentCard({ sentiment, sentimentLoading, sentimentError }: MarketSentimentCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card">
      <div className="p-6 border-b border-border-subtle flex items-start justify-between gap-4 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-secondary-light rounded text-secondary border border-secondary/20">
              <span className="material-symbols-outlined text-[20px] block">psychology</span>
            </div>
            <h2 className="text-lg font-bold text-primary">AI Market Sentiment</h2>
          </div>
          {sentimentLoading ? (
            <p className="text-text-muted text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
              Generating market analysis…
            </p>
          ) : sentimentError || !sentiment ? (
            <p className="text-text-muted text-sm max-w-2xl leading-relaxed">
              Market analysis is unavailable right now. Add more active deals or try again later.
            </p>
          ) : (
            <>
              {sentiment.headline && (
                <p className="text-sm font-semibold text-text-main leading-snug">{sentiment.headline}</p>
              )}
              <p className="text-text-secondary text-sm max-w-2xl leading-relaxed">
                <span className="text-text-main font-semibold">Analysis:</span> {sentiment.analysis}{" "}
                <span className={SENTIMENT_STYLES[sentiment.sentiment].tone}>
                  ({SENTIMENT_STYLES[sentiment.sentiment].label})
                </span>
                {sentiment.recommendation && (
                  <>
                    <br />
                    <Link href="/deals" className="text-primary font-medium mt-2 inline-flex items-center gap-1 hover:underline">
                      Recommended Action: {sentiment.recommendation}
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </Link>
                  </>
                )}
              </p>
            </>
          )}
        </div>
        {sentiment && !sentimentError && (
          <div className="hidden sm:flex flex-col items-end border-l border-border-subtle pl-6 py-1">
            <div
              className={cn(
                "text-4xl font-bold tracking-tight",
                sentiment.sentiment === "BULLISH" ? "text-secondary"
                  : sentiment.sentiment === "BEARISH" ? "text-red-600"
                    : "text-primary",
              )}
            >
              {sentiment.confidenceScore}
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-wider font-bold">Confidence</div>
          </div>
        )}
      </div>
      {sentiment && !sentimentError && sentiment.indicators?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border-subtle bg-gray-50/30">
          {sentiment.indicators.slice(0, 3).map((item) => {
            const style = TREND_ICONS[item.trend] || TREND_ICONS.stable;
            return (
              <div key={item.name} className="p-4 flex items-center gap-3 hover:bg-white transition-colors">
                <div className={cn("p-2 rounded-md border", style.tone)}>
                  <span className="material-symbols-outlined">{style.icon}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-text-main truncate">{item.name}</div>
                  <div className="text-xs text-text-secondary font-medium truncate">{item.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StageDetailModal
// ---------------------------------------------------------------------------

interface StageDetailModalProps {
  stageModal: { label: string; stages: string[] };
  deals: Deal[];
  onClose: () => void;
}

export function StageDetailModal({ stageModal, deals, onClose }: StageDetailModalProps) {
  const filtered = deals.filter((d) => stageModal.stages.includes(d.stage));
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <h3 className="text-lg font-bold text-text-main">{stageModal.label} Deals</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] divide-y divide-border-subtle">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-text-muted text-sm">No deals in this stage</div>
          ) : filtered.map((deal) => (
            <Link
              key={deal.id}
              href={`/deals/${deal.id}`}
              onClick={onClose}
              className="flex items-center justify-between p-4 hover:bg-primary-light/30 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-text-main">{deal.name}</p>
                <p className="text-xs text-text-muted">{deal.industry || "No industry"} · {formatRelativeTime(deal.updatedAt)}</p>
              </div>
              {deal.dealSize != null && (
                <span className="text-sm font-medium text-text-main font-mono">{formatCurrency(deal.dealSize, deal.currency)}</span>
              )}
            </Link>
          ))}
        </div>
        <div className="p-4 border-t border-border-subtle bg-gray-50 text-center">
          <Link href="/deals" onClick={onClose} className="text-sm font-medium text-primary hover:underline">View all deals &rarr;</Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fmtNextAction — stage-based fallback for Next Action column
// Matches legacy dashboard.js fmtNextAction()
// ---------------------------------------------------------------------------

export function fmtNextAction(stage: string): string {
  switch (stage) {
    case "SOURCING":
      return "Initial review";
    case "INITIAL_REVIEW":
      return "Schedule mgmt call";
    case "DUE_DILIGENCE":
      return "Complete QoE analysis";
    case "LOI_OFFER":
    case "IOI_SUBMITTED":
    case "LOI_SUBMITTED":
      return "Negotiate terms";
    case "CLOSED_WON":
    case "CLOSING":
      return "Onboard portfolio co";
    default:
      return "Review deal";
  }
}

// ---------------------------------------------------------------------------
// PortfolioAllocation — donut chart + legend
// Matches legacy dashboard.html portfolio-widget
// ---------------------------------------------------------------------------

interface AllocationItem {
  label: string;
  count: number;
  pct: number;
  color: string;
}

interface PortfolioAllocationProps {
  loading: boolean;
  allocation: AllocationItem[];
  gradientParts: string[];
}

export function PortfolioAllocation({ loading, allocation, gradientParts }: PortfolioAllocationProps) {
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle bg-surface-card shadow-card p-6 gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-text-main">Portfolio Allocation</h3>
        <span className="material-symbols-outlined text-text-muted">pie_chart</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-text-muted text-xs">
          <span className="material-symbols-outlined text-xl animate-spin">sync</span>
        </div>
      ) : allocation.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-text-muted">
          <span className="material-symbols-outlined text-2xl mb-1 opacity-40">pie_chart</span>
          <p className="text-xs">No deals yet</p>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div
            className="size-28 rounded-full shrink-0 shadow-inner"
            style={{
              background: `conic-gradient(${gradientParts.join(", ")})`,
              mask: "radial-gradient(circle at center, transparent 40%, black 41%)",
              WebkitMask: "radial-gradient(circle at center, transparent 40%, black 41%)",
            }}
          />
          <div className="flex flex-col gap-3 flex-1">
            {allocation.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="size-2.5 rounded-sm shadow-sm shrink-0" style={{ background: item.color }} />
                  <span className="text-text-secondary font-medium truncate">{item.label}</span>
                </div>
                <span className="text-text-main font-bold ml-2">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
