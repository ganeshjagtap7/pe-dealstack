"use client";

// ---------------------------------------------------------------------------
// deal-analysis-panels.tsx — composition / re-export module
//
// The original 1049-line file was split into eight modules per the C2 audit
// remediation. This file preserves the public API by re-exporting every panel
// the rest of the app imports. Implementations live in:
//
//   - deal-analysis-shared.tsx     — AnalysisCard, CardHeader, EmptyTabState,
//                                    SeverityBadges, FlagCard, ScoreRing
//   - deal-analysis-overview.tsx   — OverviewPanel (+ EBITDA bridge,
//                                    revenue-quality cards)
//   - deal-analysis-valuation.tsx  — ValuationPanel (+ LBO screen,
//                                    portfolio benchmark cards)
//   - deal-analysis-diligence.tsx  — DiligencePanel (+ risk-score card,
//                                    cross-doc verification)
//   - deal-analysis-deepdive.tsx   — DeepDivePanel (+ ratios, DuPont,
//                                    cost-structure cards)
//   - deal-analysis-cashcap.tsx    — CashCapitalPanel (+ cash-flow,
//                                    working-capital, debt-capacity cards)
//   - deal-analysis-aiinsights.tsx — AIInsightsPanel + MemoPanel
//
// External callers (deal-analysis.tsx) keep importing from this module so
// nothing else needed to change.
// ---------------------------------------------------------------------------

export {
  AnalysisCard,
  CardHeader,
  EmptyTabState,
  ScoreRing,
} from "./deal-analysis-shared";

export { OverviewPanel } from "./deal-analysis-overview";
export { ValuationPanel } from "./deal-analysis-valuation";
export { DiligencePanel } from "./deal-analysis-diligence";
export { DeepDivePanel } from "./deal-analysis-deepdive";
export { CashCapitalPanel } from "./deal-analysis-cashcap";
export { AIInsightsPanel, MemoPanel } from "./deal-analysis-aiinsights";
