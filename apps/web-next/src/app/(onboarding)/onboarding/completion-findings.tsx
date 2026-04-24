"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Dynamic completion findings — fetches real red-flag / analysis data when
// onboarding is fully complete. Ported from onboarding-flow.js
// loadCompletionFindings + renderFindings + renderNoFindings +
// SEVERITY_CONFIG + startDeepResearchPolling + showDeepResearchNotification.

interface RedFlag {
  title?: string;
  flag?: string;
  description?: string;
  detail?: string;
  explanation?: string;
  source?: string;
  severity?: string;
  type?: string;
}

const SEVERITY_CONFIG: Record<
  string,
  { icon: string; iconColor: string; badge: string; badgeClass: string }
> = {
  critical: { icon: "warning", iconColor: "text-red-500", badge: "Critical", badgeClass: "text-red-600 bg-red-50" },
  high: { icon: "warning", iconColor: "text-red-500", badge: "High", badgeClass: "text-red-600 bg-red-50" },
  warning: { icon: "error", iconColor: "text-amber-500", badge: "Watch", badgeClass: "text-amber-700 bg-amber-50" },
  medium: { icon: "error", iconColor: "text-amber-500", badge: "Watch", badgeClass: "text-amber-700 bg-amber-50" },
  positive: { icon: "trending_up", iconColor: "text-secondary", badge: "Positive", badgeClass: "text-secondary bg-secondary-light" },
  low: { icon: "info", iconColor: "text-blue-500", badge: "Info", badgeClass: "text-blue-600 bg-blue-50" },
};

export function CompletionFindings({
  onDealId,
}: {
  onDealId?: (id: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Checking what your AI analyst found...");
  const [subtitle, setSubtitle] = useState("Loading findings from your deal.");
  const [findings, setFindings] = useState<RedFlag[]>([]);
  const [noFindings, setNoFindings] = useState(false);
  const [statementCount, setStatementCount] = useState(0);

  // Deep research polling
  const [deepNotification, setDeepNotification] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollCountRef.current = 0;
    pollRef.current = setInterval(async () => {
      pollCountRef.current++;
      if (pollCountRef.current > 36) {
        stopPolling();
        return;
      }
      try {
        const data = await api.get<{ phase?: number; status?: string; newInsightsCount?: number }>(
          "/onboarding/research-status",
        );
        if (data.phase === 2 && data.status === "complete") {
          stopPolling();
          if (data.newInsightsCount && data.newInsightsCount > 0) {
            setDeepNotification(data.newInsightsCount);
          }
        }
      } catch {
        // Silent polling
      }
    }, 5000);
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Fetch the user's most recent deal
        const dealsData = await api.get<
          { id: string }[] | { deals?: { id: string }[] }
        >("/deals?sortBy=updatedAt&sortOrder=desc");
        if (cancelled) return;

        const deals = Array.isArray(dealsData) ? dealsData : (dealsData?.deals ?? []);
        if (deals.length === 0) {
          renderNoFindings();
          return;
        }

        const dealId = deals[0].id;
        onDealId?.(dealId);

        // Try fetching red flags / analysis
        try {
          const analysis = await api.get<{
            redFlags?: { flags?: RedFlag[] } | RedFlag[];
          }>(`/deals/${dealId}/analysis`);
          if (cancelled) return;

          const flags = Array.isArray(analysis?.redFlags)
            ? analysis.redFlags
            : (analysis?.redFlags as { flags?: RedFlag[] })?.flags ?? [];

          if (flags.length > 0) {
            const top5 = flags.slice(0, 5);
            setTitle(
              `Your AI analyst found ${top5.length} thing${top5.length > 1 ? "s" : ""} on your deal.`,
            );
            setSubtitle("Here's a preview. Click any finding to see the exact page it came from.");
            setFindings(top5);
            setLoading(false);
            return;
          }
        } catch {
          // fall through
        }

        // Fallback: check financial statements
        try {
          const finData = await api.get<
            { id: string }[] | { statements?: { id: string }[] }
          >(`/deals/${dealId}/financials`);
          if (cancelled) return;

          const statements = Array.isArray(finData) ? finData : (finData?.statements ?? []);
          if (statements.length > 0) {
            setTitle("Your workspace is ready.");
            setSubtitle(
              `We extracted ${statements.length} financial statement${statements.length > 1 ? "s" : ""} from your deal. Dive in to see the full analysis.`,
            );
            setStatementCount(statements.length);
            setLoading(false);
            return;
          }
        } catch {
          // fall through
        }

        renderNoFindings();
        startPolling();
      } catch {
        renderNoFindings();
      }
    })();

    function renderNoFindings() {
      if (cancelled) return;
      setTitle("Your workspace is ready.");
      setSubtitle("Your AI analyst is still processing. Findings will appear on your dashboard shortly.");
      setNoFindings(true);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* Deep research notification */}
      {deepNotification !== null && (
        <div className="mb-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/20 bg-primary-light/40 animate-[slideDown_300ms_ease-out_both]">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#003366" }}
            >
              <span
                className="material-symbols-outlined text-white text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-text-main flex items-center gap-2">
                Your AI analyst found {deepNotification} more insight
                {deepNotification > 1 ? "s" : ""} about your firm
                <PulseDot />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDeepNotification(null)}
            className="text-text-muted hover:text-text-main p-1"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      <h3 className="font-display text-[24px] font-bold text-text-main">{title}</h3>
      <p className="text-[13.5px] text-text-secondary mt-1.5 mb-5">{subtitle}</p>

      {/* Loading shimmer */}
      {loading && (
        <div className="space-y-2.5">
          <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-16 rounded-lg bg-gray-100 animate-pulse" />
        </div>
      )}

      {/* Red flag findings */}
      {!loading && findings.length > 0 && (
        <div className="space-y-2.5">
          {findings.map((flag, i) => {
            const severity = (flag.severity || flag.type || "medium").toLowerCase();
            const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium;
            const flagTitle = flag.title || flag.flag || flag.description || "Finding";
            const detail = flag.detail || flag.explanation || flag.source || "";
            return (
              <div
                key={i}
                className="border border-border-subtle rounded-lg p-3.5 flex items-start gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span
                  className={`material-symbols-outlined ${config.iconColor} mt-0.5 text-[20px]`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {config.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold">{flagTitle}</div>
                  {detail && <div className="text-[12px] text-text-muted mt-0.5">{detail}</div>}
                </div>
                <span
                  className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded flex-shrink-0 ${config.badgeClass}`}
                >
                  {config.badge}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* No findings — AI still processing */}
      {!loading && noFindings && statementCount === 0 && findings.length === 0 && (
        <div className="border border-border-subtle rounded-lg p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center flex-shrink-0">
            <span
              className="material-symbols-outlined text-primary text-[20px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
          </div>
          <div>
            <div className="text-[13.5px] font-semibold text-text-main">AI extraction in progress</div>
            <div className="text-[12px] text-text-muted mt-0.5">
              Red flags, financials, and signals will stream in as they&apos;re discovered.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PulseDot() {
  return <span className="pulse-dot inline-block flex-shrink-0" />;
}
