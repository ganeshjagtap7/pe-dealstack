"use client";

import { cn } from "@/lib/cn";
import {
  type AnalysisData,
  type InsightsResponse,
  type CrossDocData,
  type BenchmarkData,
  type QoEFlag,
  type KeyMetric,
  type RiskFactor,
  type LBOScreen,
  BANKER_BLUE,
  BANKER_BLUE_MUTED,
  SEVERITY_STYLES,
} from "./deal-analysis-types";

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

export function AnalysisCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-xl p-5 mb-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,51,102,0.08)] transition-shadow", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="material-symbols-outlined text-[20px]" style={{ color: BANKER_BLUE }}>{icon}</span>
      <span className="text-[13px] font-bold text-gray-900 uppercase tracking-wider" style={{ letterSpacing: "0.06em" }}>{title}</span>
      {children}
    </div>
  );
}

export function EmptyTabState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-10">
      <span className="material-symbols-outlined text-[40px] text-gray-300 block mb-2">{icon}</span>
      <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">{message}</p>
    </div>
  );
}

function SeverityBadges({ flags }: { flags: QoEFlag[] }) {
  const counts: Record<string, number> = { critical: 0, warning: 0, positive: 0, info: 0 };
  flags.forEach((f) => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
  const labels: Record<string, string> = { critical: "Critical", warning: "Warning", positive: "Positive", info: "Info" };
  const icons: Record<string, string> = { critical: "error", warning: "warning", positive: "check_circle", info: "info" };

  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, count]) => {
        const s = SEVERITY_STYLES[sev];
        return (
          <span key={sev} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: s.badgeBg, color: s.badge }}>
            <span className="material-symbols-outlined text-[13px]">{icons[sev]}</span>
            {count} {labels[sev]}
          </span>
        );
      })}
    </div>
  );
}

function FlagCard({ flag }: { flag: QoEFlag }) {
  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border hover:translate-x-0.5 transition-transform" style={{ background: s.bg, borderColor: s.border }}>
      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style={{ color: s.icon }}>{flag.icon || "info"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold" style={{ color: s.text }}>{flag.title}</span>
          {flag.metric && (
            <span className="text-[10px] font-semibold px-2 py-px rounded-md bg-white/70" style={{ color: s.icon }}>{flag.metric}</span>
          )}
          {flag.category && <span className="text-[10px] ml-auto opacity-50" style={{ color: s.text }}>{flag.category}</span>}
        </div>
        <p className="text-[11px] leading-relaxed opacity-85 m-0" style={{ color: s.text }}>{flag.detail}</p>
        {flag.evidence && (
          <p className="text-[10px] opacity-50 italic mt-1 mb-0" style={{ color: s.text }}>Evidence: {flag.evidence}</p>
        )}
      </div>
    </div>
  );
}

function RiskScoreCard({ factor }: { factor: RiskFactor }) {
  const s = SEVERITY_STYLES[factor.severity] || SEVERITY_STYLES.info;
  const barWidth = Math.max(5, factor.score);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:-translate-y-px transition-transform">
      <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-1">{factor.category}</div>
      <div className="text-lg font-extrabold mb-1" style={{ color: s.icon }}>{factor.label}</div>
      <div className="bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, background: s.icon }} />
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">{factor.detail}</p>
    </div>
  );
}

function RevenueQualityCard({ rq }: { rq: NonNullable<AnalysisData["revenueQuality"]> }) {
  const scoreColor = (rq.consistencyScore ?? 0) >= 75 ? "#059669" : (rq.consistencyScore ?? 0) >= 50 ? "#d97706" : "#dc2626";
  const scoreLabel = (rq.consistencyScore ?? 0) >= 75 ? "Consistent" : (rq.consistencyScore ?? 0) >= 50 ? "Moderate" : "Volatile";

  return (
    <AnalysisCard>
      <CardHeader icon="query_stats" title="Revenue Quality" />
      <div className="flex gap-4 flex-wrap mb-3.5">
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 uppercase font-semibold">Revenue CAGR</div>
          <div className="text-2xl font-extrabold" style={{ color: (rq.revenueCAGR ?? 0) >= 0 ? "#059669" : "#dc2626" }}>
            {rq.revenueCAGR != null ? rq.revenueCAGR + "%" : "--"}
          </div>
        </div>
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 uppercase font-semibold">Consistency Score</div>
          <div className="text-2xl font-extrabold" style={{ color: scoreColor }}>
            {rq.consistencyScore ?? "--"}<span className="text-xs font-semibold"> {scoreLabel}</span>
          </div>
        </div>
      </div>
      {rq.organicGrowthRates && rq.organicGrowthRates.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {rq.organicGrowthRates.map((g) => {
            const isPos = g.rate != null && g.rate > 0;
            const c = g.rate == null ? "#94A3B8" : isPos ? "#059669" : "#dc2626";
            return (
              <div key={g.period} className="bg-white border border-gray-200 rounded-lg px-3.5 py-2 text-center">
                <div className="text-[10px] text-gray-500 font-medium">{g.period}</div>
                <div className="text-sm font-bold" style={{ color: c }}>
                  {g.rate != null ? (isPos ? "+" : "") + g.rate + "%" : "--"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// EBITDA Bridge (matches legacy renderEBITDABridge)
// ---------------------------------------------------------------------------

function EBITDABridgeCard({ bridge, }: { bridge: NonNullable<AnalysisData["ebitdaBridge"]> }) {
  const vp = bridge.periods.filter((p) => p.reportedEbitda != null);
  if (!vp.length) return null;

  // Collect all unique addback labels across periods
  const allLabels = [...new Set(vp.flatMap((p) => p.addbacks.map((a) => a.label)))];

  return (
    <AnalysisCard>
      <CardHeader icon="bar_chart" title="EBITDA Bridge">
        <span className="text-[10px] text-gray-400 font-medium">Reported → Adjusted</span>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Item</th>
              {vp.map((p) => (
                <th key={p.period} className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{p.period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="p-2.5 font-semibold text-gray-800">Reported EBITDA</td>
              {vp.map((p) => (
                <td key={p.period} className="text-right p-2.5 font-semibold text-gray-800">${p.reportedEbitda}M</td>
              ))}
            </tr>
            {allLabels.map((label) => (
              <tr key={label} className="border-b border-gray-100">
                <td className="p-2.5" style={{ color: "#059669" }}>+ {label}</td>
                {vp.map((p) => {
                  const ab = p.addbacks.find((a) => a.label === label);
                  return (
                    <td key={p.period} className="text-right p-2.5" style={{ color: "#059669" }}>
                      {ab?.amount != null ? `+$${ab.amount}M` : "--"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-t-2 border-gray-200">
              <td className="p-2.5 font-bold" style={{ color: BANKER_BLUE }}>Adjusted EBITDA</td>
              {vp.map((p) => (
                <td key={p.period} className="text-right p-2.5 font-bold" style={{ color: BANKER_BLUE }}>
                  ${p.adjustedEbitda}M
                  {p.adjustmentPct ? <span className="text-[9px] ml-1" style={{ color: "#059669" }}>(+{p.adjustmentPct}%)</span> : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// Score Ring SVG
// ---------------------------------------------------------------------------

export function ScoreRing({ score }: { score: number }) {
  let ringColor: string, ringBg: string, label: string;
  if (score >= 75) { ringColor = "#059669"; ringBg = "#ECFDF5"; label = "Strong"; }
  else if (score >= 50) { ringColor = "#d97706"; ringBg = "#FFFBEB"; label = "Moderate"; }
  else { ringColor = "#dc2626"; ringBg = "#FEF2F2"; label = "Weak"; }

  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="48" cy="48" r="40" fill={ringBg} stroke="#E5E7EB" strokeWidth="5" />
        <circle
          cx="48" cy="48" r="40" fill="none" stroke={ringColor} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-extrabold leading-none" style={{ color: ringColor }}>{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: ringColor }}>{label}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab (matches legacy renderOverviewTab)
// ---------------------------------------------------------------------------

export function OverviewPanel({ analysis, insights }: { analysis: AnalysisData | null; insights: InsightsResponse | null }) {
  const qoe = analysis?.qoe;
  const metrics: KeyMetric[] = [];
  if (analysis?.revenueQuality?.revenueCAGR != null)
    metrics.push({ label: "Revenue CAGR", value: analysis.revenueQuality.revenueCAGR + "%", color: analysis.revenueQuality.revenueCAGR >= 0 ? "#059669" : "#dc2626" });
  if (analysis?.cashFlowAnalysis?.avgConversion != null)
    metrics.push({ label: "FCF Conversion", value: analysis.cashFlowAnalysis.avgConversion + "%", color: analysis.cashFlowAnalysis.avgConversion >= 60 ? "#059669" : "#d97706" });
  if (analysis?.debtCapacity?.currentLeverage != null)
    metrics.push({ label: "Net Leverage", value: analysis.debtCapacity.currentLeverage + "x", color: analysis.debtCapacity.currentLeverage <= 3 ? "#059669" : "#d97706" });
  if (analysis?.lboScreen?.passesScreen != null)
    metrics.push({ label: "LBO Screen", value: analysis.lboScreen.passesScreen ? "Pass" : "Fail", color: analysis.lboScreen.passesScreen ? "#059669" : "#dc2626" });

  if (!qoe && metrics.length === 0) return <EmptyTabState icon="dashboard" message="No overview data available yet." />;

  return (
    <div className="flex flex-col gap-4">
      {/* QoE Score Hero */}
      {qoe && (
        <AnalysisCard className="bg-gradient-to-br from-[#FAFBFF] to-[#F0F4FA] border-[#D6DEE8]">
          <div className="flex gap-6 items-center flex-wrap">
            <ScoreRing score={qoe.score} />
            <div className="flex-1 min-w-[200px]">
              <div className="text-sm font-bold text-gray-900 mb-1.5">Quality of Earnings Assessment</div>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">{qoe.summary}</p>
              <SeverityBadges flags={qoe.flags} />
            </div>
            {metrics.length > 0 && (
              <div className="grid grid-cols-2 gap-2 min-w-[180px]">
                {metrics.map((m) => (
                  <div key={m.label} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
                    <div className="text-[9px] text-gray-500 uppercase font-semibold">{m.label}</div>
                    <div className="text-lg font-extrabold" style={{ color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AnalysisCard>
      )}

      {/* QoE Flags */}
      {qoe && qoe.flags.length > 0 && (
        <AnalysisCard>
          <CardHeader icon="flag" title="Key Findings">
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#dc2626" }}>
              {qoe.flags.filter((f) => f.severity === "critical").length} Critical
            </span>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {qoe.flags.map((f, i) => <FlagCard key={i} flag={f} />)}
          </div>
        </AnalysisCard>
      )}

      {/* EBITDA Bridge */}
      {analysis?.ebitdaBridge && <EBITDABridgeCard bridge={analysis.ebitdaBridge} />}

      {/* Revenue Quality */}
      {analysis?.revenueQuality && <RevenueQualityCard rq={analysis.revenueQuality} />}

      {/* AI Insights (narrative text from /insights endpoint) */}
      {insights?.hasData && insights.insights && <AIInsightsCard insights={insights.insights} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Insights Card (matches legacy renderAIInsightsTab sections)
// ---------------------------------------------------------------------------

function AIInsightsCard({ insights }: { insights: NonNullable<InsightsResponse["insights"]> }) {
  const sections: { key: string; title: string; icon: string }[] = [
    { key: "executiveSummary", title: "Executive Summary", icon: "summarize" },
    { key: "topThreeStrengths", title: "Key Strengths", icon: "thumb_up" },
    { key: "keyStrengths", title: "Key Strengths", icon: "thumb_up" },
    { key: "topThreeRisks", title: "Key Risks", icon: "warning" },
    { key: "keyRisks", title: "Key Risks", icon: "warning" },
    { key: "investmentThesis", title: "Investment Thesis", icon: "lightbulb" },
    { key: "diligencePriorities", title: "Due Diligence Priorities", icon: "checklist" },
    { key: "dueDiligencePriorities", title: "Due Diligence Priorities", icon: "checklist" },
  ];

  // Deduplicate: prefer new keys over legacy aliases
  const seen = new Set<string>();
  const rendered = sections.filter((s) => {
    const content = (insights as Record<string, unknown>)[s.key];
    if (!content) return false;
    if (Array.isArray(content) && content.length === 0) return false;
    // Avoid rendering both "topThreeStrengths" and legacy "keyStrengths"
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return true;
  });

  if (rendered.length === 0) return null;

  return (
    <AnalysisCard>
      <CardHeader icon="auto_awesome" title="AI Insights" />
      <div className="flex flex-col gap-4">
        {rendered.map((s) => {
          const content = (insights as Record<string, unknown>)[s.key];
          const isList = Array.isArray(content);
          return (
            <div key={s.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[16px]" style={{ color: BANKER_BLUE }}>{s.icon}</span>
                <span className="text-xs font-bold text-gray-800">{s.title}</span>
              </div>
              {isList ? (
                <ul className="text-xs text-gray-600 leading-relaxed pl-4 m-0 list-disc">
                  {(content as string[]).map((item, i) => <li key={i} className="mb-1.5">{item}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-gray-600 leading-relaxed m-0">{String(content)}</p>
              )}
            </div>
          );
        })}
      </div>
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// Valuation Tab (matches legacy renderValuationTab + renderLBOScreen)
// ---------------------------------------------------------------------------

export function ValuationPanel({ analysis, benchmark }: { analysis: AnalysisData | null; benchmark: BenchmarkData | null }) {
  const lbo = analysis?.lboScreen;

  if (!lbo) return <EmptyTabState icon="rocket_launch" message="No valuation data available. Upload financial documents to generate LBO screening and valuation analysis." />;

  return (
    <div className="flex flex-col gap-4">
      <LBOScreenCard lbo={lbo} />

      {/* Benchmark data shown here as well when available */}
      {benchmark?.hasData && benchmark.peerCount > 0 && benchmark.benchmarks?.length > 0 ? (
        <BenchmarkCard benchmark={benchmark} />
      ) : (
        <AnalysisCard>
          <div className="text-center py-5">
            <span className="material-symbols-outlined text-3xl text-gray-300 block mb-2">leaderboard</span>
            <p className="text-xs text-gray-400">
              Portfolio benchmarking requires 2+ deals with financials extracted.
            </p>
          </div>
        </AnalysisCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LBO Screen Card (matches legacy renderLBOScreen exactly)
// ---------------------------------------------------------------------------

function LBOScreenCard({ lbo }: { lbo: LBOScreen }) {
  const passColor = lbo.passesScreen ? "#059669" : "#dc2626";
  const passLabel = lbo.passesScreen ? "PASSES SCREEN" : "BELOW THRESHOLD";

  const hasScenarios = lbo.scenarios && lbo.scenarios.length > 0;
  const entryMults = hasScenarios
    ? [...new Set(lbo.scenarios.map((s) => s.entryMultiple))].sort((a, b) => a - b)
    : [];
  const exitMults = hasScenarios
    ? [...new Set(lbo.scenarios.map((s) => s.exitMultiple))].sort((a, b) => a - b)
    : [];

  return (
    <AnalysisCard>
      <CardHeader icon="rocket_launch" title="LBO Quick Screen">
        <span
          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full"
          style={{ background: `${passColor}15`, color: passColor }}
        >
          {passLabel}
        </span>
      </CardHeader>

      {/* Entry metrics */}
      <div className="flex gap-3.5 flex-wrap mb-4">
        {lbo.entryEbitda != null && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Entry EBITDA</div>
            <div className="text-2xl font-extrabold" style={{ color: BANKER_BLUE }}>${lbo.entryEbitda}M</div>
          </div>
        )}
        {hasScenarios && lbo.scenarios[0]?.growthRate != null && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Growth Rate</div>
            <div className="text-2xl font-extrabold" style={{ color: BANKER_BLUE }}>{lbo.scenarios[0].growthRate}%</div>
          </div>
        )}
      </div>

      {/* Scenario matrix */}
      {hasScenarios && entryMults.length > 0 && exitMults.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th rowSpan={2} className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase align-bottom border-b-2 border-gray-200">
                    Entry Multiple
                  </th>
                  <th colSpan={exitMults.length} className="text-center p-2.5 text-gray-500 font-semibold text-[10px] uppercase border-b border-gray-200">
                    Exit Multiple → MOIC / IRR
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  {exitMults.map((em) => (
                    <th key={em} className="text-center p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{em}x</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entryMults.map((entry) => (
                  <tr key={entry} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2.5 font-bold text-gray-800">{entry}x</td>
                    {exitMults.map((exit) => {
                      const s = lbo.scenarios.find((sc) => sc.entryMultiple === entry && sc.exitMultiple === exit);
                      if (!s) return <td key={exit} className="text-center p-2.5 text-gray-400">--</td>;
                      const irrC = s.irr == null ? "#94A3B8" : s.irr >= 25 ? "#059669" : s.irr >= 20 ? "#d97706" : "#dc2626";
                      return (
                        <td key={exit} className="text-center p-2.5">
                          <span className="font-bold text-gray-800 text-[13px]">{s.moic ?? "--"}x</span>
                          <br />
                          <span className="text-[10px] font-semibold" style={{ color: irrC }}>
                            {s.irr != null ? `${s.irr}% IRR` : ""}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 mt-2.5">
            Assumes 60% debt / 40% equity, 20% debt paydown over 5 years.{" "}
            <span style={{ color: "#059669" }}>Green</span> IRR &gt;= 25%,{" "}
            <span style={{ color: "#d97706" }}>Amber</span> &gt;= 20%.
          </p>
        </>
      )}
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// Risk Profile Tab (matches legacy renderDiligenceTab)
// ---------------------------------------------------------------------------

export function RiskPanel({ analysis, crossDoc }: { analysis: AnalysisData | null; crossDoc: CrossDocData | null }) {
  const redFlags = analysis?.redFlags || [];
  const qoeFlags = analysis?.qoe?.flags || [];
  const conflicts = crossDoc?.conflicts || [];

  const riskFactors: RiskFactor[] = [];
  const criticalCount = [...redFlags, ...qoeFlags].filter((f) => f.severity === "critical").length;
  const warningCount = [...redFlags, ...qoeFlags].filter((f) => f.severity === "warning").length;

  if (criticalCount > 0 || warningCount > 0) {
    riskFactors.push({
      category: "Financial Quality",
      score: Math.max(0, 100 - criticalCount * 25 - warningCount * 10),
      label: criticalCount > 0 ? "High Risk" : "Moderate",
      detail: `${criticalCount} critical and ${warningCount} warning flags identified`,
      severity: criticalCount > 0 ? "critical" : "warning",
    });
  }

  if (conflicts.length > 0) {
    riskFactors.push({
      category: "Document Consistency",
      score: Math.max(0, 100 - conflicts.length * 15),
      label: conflicts.length > 3 ? "High Risk" : "Moderate",
      detail: `${conflicts.length} discrepanc${conflicts.length !== 1 ? "ies" : "y"} found across documents`,
      severity: conflicts.length > 3 ? "critical" : "warning",
    });
  }

  if (analysis?.debtCapacity?.currentLeverage != null) {
    const lev = analysis.debtCapacity.currentLeverage;
    riskFactors.push({
      category: "Leverage Risk",
      score: lev <= 2 ? 90 : lev <= 3 ? 70 : lev <= 4 ? 50 : 30,
      label: lev <= 3 ? "Low" : lev <= 4 ? "Moderate" : "High",
      detail: `Current leverage at ${lev}x EBITDA`,
      severity: lev <= 3 ? "positive" : lev <= 4 ? "warning" : "critical",
    });
  }

  if (riskFactors.length === 0 && redFlags.length === 0) {
    return <EmptyTabState icon="shield" message="No risk data available yet. Analysis will populate once financial data is extracted." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {riskFactors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {riskFactors.map((rf) => <RiskScoreCard key={rf.category} factor={rf} />)}
        </div>
      )}

      {/* Red Flags (matches legacy renderRedFlags) */}
      {redFlags.length > 0 && (
        <AnalysisCard>
          <CardHeader icon="flag" title="Red Flag Analysis">
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#dc2626" }}>
              {redFlags.length} Flag{redFlags.length !== 1 ? "s" : ""}
            </span>
          </CardHeader>
          <div className="flex flex-col gap-2.5">
            {redFlags.map((f, i) => <FlagCard key={i} flag={f} />)}
          </div>
        </AnalysisCard>
      )}

      {/* No Red Flags - positive state (matches legacy) */}
      {redFlags.length === 0 && riskFactors.length > 0 && (
        <AnalysisCard>
          <CardHeader icon="check_circle" title="No Red Flags Detected" />
          <p className="text-xs text-gray-500">All automated deep detection checks passed.</p>
        </AnalysisCard>
      )}

      {/* Cross-Doc Verification (matches legacy renderCrossDoc) */}
      {crossDoc?.hasData && conflicts.length > 0 && (
        <AnalysisCard>
          <CardHeader icon="compare" title="Cross-Document Verification">
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#d97706" }}>
              {conflicts.length} Discrepanc{conflicts.length !== 1 ? "ies" : "y"}
            </span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50 border-b-2 border-gray-200">
                  <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Period</th>
                  <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Field</th>
                  <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Values by Document</th>
                  <th className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.slice(0, 10).map((c, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-2.5 font-semibold text-gray-800">{c.period}</td>
                    <td className="p-2.5 text-gray-600">{c.field.replace(/_/g, " ")}</td>
                    <td className="p-2.5">
                      {c.values.map((v, vi) => (
                        <span
                          key={vi}
                          className="inline-block text-[10px] px-2 py-0.5 rounded-md mx-0.5 my-0.5"
                          style={{ background: v.isActive ? "#D1FAE5" : "#F1F5F9" }}
                        >
                          {v.documentName}: ${v.value}M
                        </span>
                      ))}
                    </td>
                    <td className="p-2.5 text-right font-bold" style={{ color: c.discrepancyPct > 10 ? "#dc2626" : "#d97706" }}>
                      {c.discrepancyPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalysisCard>
      )}

      {/* Cross-doc no conflicts (matches legacy) */}
      {crossDoc?.hasData && conflicts.length === 0 && (
        <AnalysisCard>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#059669" }}>fact_check</span>
            <span className="text-[13px] font-bold text-gray-900 uppercase tracking-wider" style={{ letterSpacing: "0.06em" }}>Cross-Document Verification</span>
            <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#059669" }}>No Conflicts</span>
          </div>
          <p className="text-xs text-gray-500">All financial figures are consistent across {crossDoc.documents?.length || 0} document(s).</p>
        </AnalysisCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmarks Tab (matches legacy renderBenchmark)
// ---------------------------------------------------------------------------

export function BenchmarksPanel({ benchmark }: { benchmark: BenchmarkData | null }) {
  if (!benchmark?.hasData || !benchmark.peerCount || !benchmark.benchmarks?.length) {
    return <EmptyTabState icon="leaderboard" message="Portfolio benchmarking requires 2+ deals with financials extracted." />;
  }

  return <BenchmarkCard benchmark={benchmark} />;
}

function BenchmarkCard({ benchmark }: { benchmark: BenchmarkData }) {
  return (
    <AnalysisCard>
      <CardHeader icon="leaderboard" title="Portfolio Benchmarking">
        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: BANKER_BLUE_MUTED, color: BANKER_BLUE }}>
          vs {benchmark.peerCount} peers
        </span>
      </CardHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {benchmark.benchmarks.map((b) => {
          const pc = b.percentile >= 70 ? "#059669" : b.percentile >= 40 ? "#d97706" : "#dc2626";
          const pl = b.percentile >= 70 ? "Top Quartile" : b.percentile >= 40 ? "Mid Range" : "Below Median";
          const u = b.unit === "%" ? "%" : b.unit === "$M" ? "M" : "";

          return (
            <div key={b.metric} className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 hover:-translate-y-px transition-transform">
              <div className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide mb-2">{b.metric}</div>
              <div className="text-2xl font-extrabold" style={{ color: BANKER_BLUE }}>{b.dealValue}{u}</div>
              <div className="mt-3">
                <div className="bg-gray-200 h-1.5 rounded-full relative overflow-visible">
                  <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${b.percentile}%`, background: `linear-gradient(90deg, ${pc}40, ${pc})` }} />
                  <div
                    className="absolute top-[-3px] rounded-full border-2 border-white transition-all duration-700"
                    style={{ left: `${b.percentile}%`, transform: "translateX(-50%)", width: 12, height: 12, background: pc, boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-[9px] text-gray-400">{b.peerMin}{u}</span>
                  <span className="text-[10px] font-semibold" style={{ color: pc }}>{b.percentile}th pctl - {pl}</span>
                  <span className="text-[9px] text-gray-400">{b.peerMax}{u}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AnalysisCard>
  );
}
