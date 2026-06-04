"use client";

import { cn } from "@/lib/cn";
import type { TeaserFit, TeaserVerdict } from "@/lib/teaser";

export interface PreviewResult {
  headline: string;
  fits: TeaserFit[];
}

export interface DealOption {
  id: string;
  label: string;
}

// Banker Blue per repo style rules (inline, not a Tailwind class).
const BANKER_BLUE = "#003366";

const VERDICT_STYLES: Record<TeaserVerdict, { label: string; className: string }> = {
  fit: { label: "Fit", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial: { label: "Partial", className: "bg-amber-50 text-amber-700 border-amber-200" },
  miss: { label: "Miss", className: "bg-red-50 text-red-700 border-red-200" },
};

// Deal picker + GEN button + rendered teaser. The teaser is plain text, so it's
// rendered as text content (never dangerouslySetInnerHTML).
export function TeaserPreview({
  deals,
  dealsLoading,
  selectedDealId,
  onSelectDeal,
  onGenerate,
  generating,
  result,
  error,
}: {
  deals: DealOption[];
  dealsLoading: boolean;
  selectedDealId: string;
  onSelectDeal: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
  result: PreviewResult | null;
  error: string | null;
}) {
  const canGenerate = !!selectedDealId && !generating;

  return (
    <div className="rounded-lg border border-border-subtle bg-[#F8F9FA] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-text-secondary">
            Preview on a deal
          </label>
          <select
            value={selectedDealId}
            onChange={(e) => onSelectDeal(e.target.value)}
            disabled={dealsLoading || deals.length === 0}
            className="w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:max-w-xs"
          >
            {dealsLoading ? (
              <option value="">Loading deals…</option>
            ) : deals.length === 0 ? (
              <option value="">No deals available</option>
            ) : (
              <>
                <option value="">Select a deal…</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: BANKER_BLUE }}
        >
          {generating ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              Generating…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              GEN
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="material-symbols-outlined text-[16px]">error</span>
          {error}
        </div>
      )}

      {result && !error && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-white p-4">
          <p className="text-sm font-semibold leading-relaxed text-text-main">{result.headline}</p>
          {result.fits.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {result.fits.map((fit, idx) => {
                const verdict = VERDICT_STYLES[fit.verdict] ?? VERDICT_STYLES.partial;
                return (
                  <li key={`${fit.criterion}-${idx}`} className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                        verdict.className,
                      )}
                    >
                      {verdict.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-main">{fit.criterion}</p>
                      {fit.note && <p className="text-sm text-text-secondary">{fit.note}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
