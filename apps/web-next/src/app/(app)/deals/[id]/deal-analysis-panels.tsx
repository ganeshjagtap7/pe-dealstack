"use client";

import { cn } from "@/lib/cn";
import {
  type AnalysisData,
  type CrossDocData,
  type BenchmarkData,
  type NarrativeInsights,
  type QoEFlag,
  type KeyMetric,
  type RiskFactor,
  type LBOScreen,
  type DuPontDecomposition,
  type CashFlowAnalysis,
  type WorkingCapital,
  type CostStructure,
  type DebtCapacity,
  BANKER_BLUE,
  BANKER_BLUE_LIGHT,
  BANKER_BLUE_MUTED,
  SEVERITY_STYLES,
  AI_INSIGHT_SECTIONS,
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

export function OverviewPanel({ analysis }: { analysis: AnalysisData | null }) {
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
    </div>
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
// Diligence Tab (matches legacy renderDiligenceTab — id "diligence")
// ---------------------------------------------------------------------------

export function DiligencePanel({ analysis, crossDoc }: { analysis: AnalysisData | null; crossDoc: CrossDocData | null }) {
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
// Benchmark Card (used inside Valuation tab — matches legacy renderBenchmark
// in apps/web/js/analysis-valuation.js. Title "Portfolio Benchmarking"
// is canonical and must not change without a corresponding legacy update.)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deep Dive Tab (matches legacy renderDeepDiveTab — id "deepdive")
//   Cards: Financial Ratios, DuPont Decomposition, Cost Structure
// ---------------------------------------------------------------------------

export function DeepDivePanel({ analysis }: { analysis: AnalysisData | null }) {
  if (!analysis) {
    return <EmptyTabState icon="analytics" message="No deep-dive data available yet." />;
  }

  const hasRatios = analysis.ratios && analysis.ratios.length > 0;
  const hasDuPont = analysis.duPont && analysis.duPont.periods.length > 0;
  const hasCost = analysis.costStructure && analysis.costStructure.periods.length > 0;

  if (!hasRatios && !hasDuPont && !hasCost) {
    return <EmptyTabState icon="analytics" message="Deep-dive ratios, DuPont decomposition, and cost structure will appear here once enough financial data is extracted." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasRatios && <FinancialRatiosCard ratios={analysis.ratios} />}
      {hasDuPont && <DuPontCard duPont={analysis.duPont!} />}
      {hasCost && <CostStructureCard cs={analysis.costStructure!} />}
    </div>
  );
}

// Card: Financial Ratios (matches legacy renderRatioDashboard title)
function FinancialRatiosCard({ ratios }: { ratios: AnalysisData["ratios"] }) {
  const trendIcon = (t: string) =>
    t === "improving" ? "trending_up" : t === "declining" ? "trending_down" : t === "stable" ? "trending_flat" : "remove";
  const trendColor = (t: string) =>
    t === "improving" ? "#059669" : t === "declining" ? "#dc2626" : t === "stable" ? "#64748B" : "#94A3B8";

  return (
    <AnalysisCard>
      <CardHeader icon="bar_chart" title="Financial Ratios" />
      <div className="flex flex-col gap-4">
        {ratios.map((group) => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[16px]" style={{ color: BANKER_BLUE }}>{group.icon}</span>
              <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: BANKER_BLUE }}>{group.category}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 border-b-2 border-gray-200">
                    <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Ratio</th>
                    {group.ratios[0]?.periods.map((p) => (
                      <th key={p.period} className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{p.period}</th>
                    ))}
                    <th className="text-center p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {group.ratios.map((r) => (
                    <tr key={r.key} className="border-b border-gray-100">
                      <td className="p-2.5 text-gray-800" title={r.description}>{r.name}</td>
                      {r.periods.map((p) => (
                        <td key={p.period} className="text-right p-2.5 text-gray-800">
                          {p.value != null ? `${p.value}${r.unit === "%" ? "%" : r.unit === "x" ? "x" : r.unit === "days" ? "d" : ""}` : "--"}
                        </td>
                      ))}
                      <td className="text-center p-2.5">
                        <span className="material-symbols-outlined text-[16px]" style={{ color: trendColor(r.trend) }}>{trendIcon(r.trend)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </AnalysisCard>
  );
}

// Card: DuPont Decomposition (matches legacy renderDuPont)
function DuPontCard({ duPont }: { duPont: DuPontDecomposition }) {
  const fmt = (v: number | null) => (v != null ? v.toFixed(2) : "--");

  return (
    <AnalysisCard>
      <CardHeader icon="schema" title="DuPont Decomposition" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left p-2 text-gray-500 font-semibold">Component</th>
              {duPont.periods.map((p) => (
                <th key={p.period} className="text-right p-2 text-gray-500 font-semibold">{p.period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="p-2 font-medium text-gray-800">Net Profit Margin</td>
              {duPont.periods.map((p) => (
                <td key={p.period} className="text-right p-2 text-gray-800">{fmt(p.netProfitMargin)}%</td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-2 font-medium text-gray-800">Asset Turnover</td>
              {duPont.periods.map((p) => (
                <td key={p.period} className="text-right p-2 text-gray-800">{fmt(p.assetTurnover)}x</td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="p-2 font-medium text-gray-800">Equity Multiplier</td>
              {duPont.periods.map((p) => (
                <td key={p.period} className="text-right p-2 text-gray-800">{fmt(p.equityMultiplier)}x</td>
              ))}
            </tr>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <td className="p-2 font-bold" style={{ color: BANKER_BLUE }}>ROE</td>
              {duPont.periods.map((p) => {
                const c = p.roe != null && p.roe >= 15 ? "#059669" : p.roe != null && p.roe >= 8 ? "#d97706" : "#dc2626";
                return (
                  <td key={p.period} className="text-right p-2 font-bold" style={{ color: c }}>{fmt(p.roe)}%</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 px-3.5 py-2.5 bg-[#F0F7FF] rounded-lg text-[11px] text-gray-600 leading-relaxed">
        ROE = Net Profit Margin x Asset Turnover x Equity Multiplier
      </div>
    </AnalysisCard>
  );
}

// Card: Cost Structure (matches legacy renderCostStructure)
function CostStructureCard({ cs }: { cs: CostStructure }) {
  const levColors: Record<string, string> = { high: "#dc2626", moderate: "#d97706", low: "#059669", unknown: "#64748B" };
  const cap = cs.operatingLeverage.charAt(0).toUpperCase() + cs.operatingLeverage.slice(1);

  return (
    <AnalysisCard>
      <CardHeader icon="pie_chart" title="Cost Structure" />
      <div className="flex gap-3.5 flex-wrap mb-4">
        {cs.breakEvenRevenue != null && (
          <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">Break-even Revenue</div>
            <div className="text-2xl font-extrabold" style={{ color: BANKER_BLUE }}>${cs.breakEvenRevenue}M</div>
          </div>
        )}
        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 uppercase font-semibold">Operating Leverage</div>
          <div className="text-2xl font-extrabold" style={{ color: levColors[cs.operatingLeverage] || "#64748B" }}>{cap}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Cost Category (% Rev)</th>
              {cs.periods.map((p) => (
                <th key={p.period} className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{p.period}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100"><td className="p-2.5 text-gray-800">COGS %</td>{cs.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.cogsPct != null ? p.cogsPct + "%" : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5 text-gray-800">SG&amp;A %</td>{cs.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.sgaPct != null ? p.sgaPct + "%" : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5 text-gray-800">R&amp;D %</td>{cs.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.rdPct != null ? p.rdPct + "%" : "--"}</td>)}</tr>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-t-2 border-gray-200">
              <td className="p-2.5 font-bold" style={{ color: BANKER_BLUE }}>Total OpEx %</td>
              {cs.periods.map((p) => <td key={p.period} className="text-right p-2.5 font-bold" style={{ color: BANKER_BLUE }}>{p.opexPct != null ? p.opexPct + "%" : "--"}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// Cash & Capital Tab (matches legacy renderCashCapitalTab — id "cashcap")
//   Cards: Cash Flow Analysis, Working Capital, Debt Capacity
// ---------------------------------------------------------------------------

export function CashCapitalPanel({ analysis }: { analysis: AnalysisData | null }) {
  if (!analysis) {
    return <EmptyTabState icon="payments" message="No cash & capital data available yet." />;
  }

  const cfa = analysis.cashFlowAnalysis;
  const wc = analysis.workingCapital;
  const dc = analysis.debtCapacity;

  if (!cfa && !wc && !dc) {
    return <EmptyTabState icon="payments" message="Cash flow, working capital, and debt capacity analysis will appear here once enough financial data is extracted." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {cfa && <CashFlowAnalysisCard cfa={cfa} />}
      {wc && <WorkingCapitalCard wc={wc} />}
      {dc && <DebtCapacityCard dc={dc} />}
    </div>
  );
}

// Card: Cash Flow Analysis (matches legacy renderCashFlowAnalysis)
function CashFlowAnalysisCard({ cfa }: { cfa: CashFlowAnalysis }) {
  const vp = cfa.periods.filter((p) => p.ebitda != null || p.fcf != null);
  if (!vp.length) return null;
  const convColor = cfa.avgConversion == null ? "#64748B" : cfa.avgConversion >= 70 ? "#059669" : cfa.avgConversion >= 50 ? "#d97706" : "#dc2626";

  return (
    <AnalysisCard>
      <CardHeader icon="payments" title="Cash Flow Analysis">
        {cfa.avgConversion != null && (
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: `${convColor}15`, color: convColor }}>
            Avg Conversion: {cfa.avgConversion}%
          </span>
        )}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Item</th>
              {vp.map((p) => <th key={p.period} className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{p.period}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100"><td className="p-2.5 font-semibold text-gray-800">EBITDA</td>{vp.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.ebitda != null ? `$${p.ebitda}M` : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5" style={{ color: "#dc2626" }}>- CapEx</td>{vp.map((p) => <td key={p.period} className="text-right p-2.5" style={{ color: "#dc2626" }}>{p.capex != null ? `($${p.capex}M)` : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5" style={{ color: "#d97706" }}>- WC Change</td>{vp.map((p) => <td key={p.period} className="text-right p-2.5" style={{ color: "#d97706" }}>{p.wcChange != null ? (p.wcChange >= 0 ? `($${p.wcChange}M)` : `+$${Math.abs(p.wcChange)}M`) : "--"}</td>)}</tr>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-t-2 border-gray-200">
              <td className="p-2.5 font-bold" style={{ color: BANKER_BLUE }}>= Free Cash Flow</td>
              {vp.map((p) => <td key={p.period} className="text-right p-2.5 font-bold" style={{ color: BANKER_BLUE }}>{p.fcf != null ? `$${p.fcf}M` : "--"}</td>)}
            </tr>
            <tr>
              <td className="p-2.5 text-[10px] text-gray-500">Conversion %</td>
              {vp.map((p) => {
                const c = p.ebitdaToFcfConversion;
                const cc = c == null ? "#94A3B8" : c >= 70 ? "#059669" : c >= 50 ? "#d97706" : "#dc2626";
                return <td key={p.period} className="text-right p-2.5 text-[11px] font-semibold" style={{ color: cc }}>{c != null ? `${c}%` : "--"}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisCard>
  );
}

// Card: Working Capital (matches legacy renderWorkingCapital)
function WorkingCapitalCard({ wc }: { wc: WorkingCapital }) {
  if (!wc.periods.length) return null;
  return (
    <AnalysisCard>
      <CardHeader icon="account_balance_wallet" title="Working Capital">
        {wc.normalizedNwc != null && (
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: BANKER_BLUE_MUTED, color: BANKER_BLUE }}>
            Normalized NWC: ${wc.normalizedNwc}M
          </span>
        )}
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left p-2.5 text-gray-500 font-semibold text-[10px] uppercase">Component</th>
              {wc.periods.map((p) => <th key={p.period} className="text-right p-2.5 text-gray-500 font-semibold text-[10px] uppercase">{p.period}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100"><td className="p-2.5 text-gray-800">Accounts Receivable</td>{wc.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.ar != null ? `$${p.ar}M` : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5 text-gray-800">Inventory</td>{wc.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-gray-800">{p.inventory != null ? `$${p.inventory}M` : "--"}</td>)}</tr>
            <tr className="border-b border-gray-100"><td className="p-2.5" style={{ color: "#dc2626" }}>Accounts Payable</td>{wc.periods.map((p) => <td key={p.period} className="text-right p-2.5" style={{ color: "#dc2626" }}>{p.ap != null ? `($${p.ap}M)` : "--"}</td>)}</tr>
            <tr className="bg-gradient-to-r from-gray-100 to-gray-50 border-t-2 border-gray-200">
              <td className="p-2.5 font-bold" style={{ color: BANKER_BLUE }}>Net Working Capital</td>
              {wc.periods.map((p) => <td key={p.period} className="text-right p-2.5 font-bold" style={{ color: BANKER_BLUE }}>{p.nwc != null ? `$${p.nwc}M` : "--"}</td>)}
            </tr>
            <tr>
              <td className="p-2.5 text-[10px] text-gray-500">NWC % Revenue</td>
              {wc.periods.map((p) => <td key={p.period} className="text-right p-2.5 text-[11px] text-gray-500">{p.nwcPctRevenue != null ? p.nwcPctRevenue + "%" : "--"}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </AnalysisCard>
  );
}

// Card: Debt Capacity (matches legacy renderDebtCapacity)
function DebtCapacityCard({ dc }: { dc: DebtCapacity }) {
  const dscrColor = dc.dscr == null ? "#64748B" : dc.dscr >= 1.5 ? "#059669" : dc.dscr >= 1.25 ? "#d97706" : "#dc2626";
  const metrics: { label: string; value: string; color: string; sub?: string }[] = [
    { label: "Current Leverage", value: dc.currentLeverage != null ? dc.currentLeverage + "x" : "--", color: BANKER_BLUE },
    { label: "Max Debt @3x", value: dc.maxDebt3x != null ? `$${dc.maxDebt3x}M` : "--", color: BANKER_BLUE },
    { label: "Max Debt @4x", value: dc.maxDebt4x != null ? `$${dc.maxDebt4x}M` : "--", color: BANKER_BLUE },
    { label: "DSCR", value: dc.dscr != null ? dc.dscr + "x" : "--", color: dscrColor, sub: "Banks want >1.25x" },
    { label: "Debt Headroom", value: dc.debtHeadroom != null ? `$${dc.debtHeadroom}M` : "--", color: "#059669", sub: "vs 4x capacity" },
    { label: "Interest Coverage", value: dc.interestCoverage != null ? dc.interestCoverage + "x" : "--", color: BANKER_BLUE },
  ];

  return (
    <AnalysisCard>
      <CardHeader icon="account_balance" title="Debt Capacity" />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {metrics.map((m) => (
          <div key={m.label} className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4">
            <div className="text-[10px] text-gray-500 uppercase font-semibold">{m.label}</div>
            <div className="text-2xl font-extrabold" style={{ color: m.color }}>{m.value}</div>
            {m.sub && <div className="text-[10px] text-gray-500 mt-1">{m.sub}</div>}
          </div>
        ))}
      </div>
    </AnalysisCard>
  );
}

// ---------------------------------------------------------------------------
// AI Insights Tab (matches legacy renderAIInsightsTab — id "aiinsights")
//   Sub-sections must be in this exact order, with these exact titles
//   and Material Symbol icons (see AI_INSIGHT_SECTIONS in deal-analysis-types):
//     - Executive Summary       (summarize)
//     - Key Strengths           (thumb_up)
//     - Key Risks               (warning)
//     - Investment Thesis       (lightbulb)
//     - Due Diligence Priorities (checklist)
// ---------------------------------------------------------------------------

export function AIInsightsPanel({ insights }: { insights: NarrativeInsights | null }) {
  if (!insights) {
    return (
      <AnalysisCard className="text-center" >
        <span className="material-symbols-outlined text-[40px] text-gray-400 block mb-3">auto_awesome</span>
        <h3 className="text-sm font-semibold text-gray-500 mb-1.5">AI Insights Loading...</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Narrative insights are generated asynchronously.<br />
          Refresh in a few seconds to see AI-powered analysis.
        </p>
      </AnalysisCard>
    );
  }

  const rendered = AI_INSIGHT_SECTIONS.filter((s) => insights[s.key]);
  if (!rendered.length) {
    return <EmptyTabState icon="auto_awesome" message="AI insights not available for this deal yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {rendered.map((s) => {
        const content = insights[s.key];
        const isList = Array.isArray(content);
        return (
          <AnalysisCard key={s.key}>
            <CardHeader icon={s.icon} title={s.title} />
            {isList ? (
              <ul className="text-xs text-gray-700 pl-5 m-0 list-disc">
                {(content as string[]).map((item, i) => (
                  <li key={i} className="mb-1.5 leading-relaxed">{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-700 leading-relaxed m-0">{content as string}</p>
            )}
          </AnalysisCard>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memo Tab (matches legacy renderMemoTab — id "memo")
//   Heading copy is canonical: "Investment Memo Ready" / "Generate Investment Memo"
// ---------------------------------------------------------------------------

export function MemoPanel({ analysis, dealId }: { analysis: AnalysisData | null; dealId: string }) {
  const qoeScore = analysis?.qoe?.score;
  // analysis.memo isn't yet wired in web-next — treat as not-yet-generated.
  const hasMemo = false;

  return (
    <AnalysisCard className="text-center">
      <div className="flex justify-center mb-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${BANKER_BLUE_MUTED}, #D6DEE8)` }}
        >
          <span className="material-symbols-outlined text-[32px]" style={{ color: BANKER_BLUE }}>description</span>
        </div>
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1.5">
        {hasMemo ? "Investment Memo Ready" : "Generate Investment Memo"}
      </h3>
      <p className="text-xs text-gray-500 mb-1 leading-relaxed">
        {hasMemo
          ? "Auto-generated memo based on extracted financials."
          : "Extract financial data first to auto-generate an investment memorandum."}
      </p>
      {qoeScore != null && (
        <span
          className="inline-flex text-[10px] font-semibold px-2.5 py-0.5 rounded-full mt-2"
          style={{ background: BANKER_BLUE_MUTED, color: BANKER_BLUE }}
        >
          QoE Score: {qoeScore}/100
        </span>
      )}
      <div className="mt-5">
        <a
          href={`/memo-builder?dealId=${dealId}`}
          className="inline-flex items-center gap-2 px-7 py-3 text-[13px] font-bold text-white rounded-[10px] no-underline shadow-[0_2px_8px_rgba(0,51,102,0.25)] hover:shadow-[0_4px_16px_rgba(0,51,102,0.35)] hover:-translate-y-px transition-all"
          style={{ background: `linear-gradient(135deg, ${BANKER_BLUE}, ${BANKER_BLUE_LIGHT})` }}
        >
          <span className="material-symbols-outlined text-[18px]">edit_document</span>
          Open Memo Builder
        </a>
      </div>
    </AnalysisCard>
  );
}
