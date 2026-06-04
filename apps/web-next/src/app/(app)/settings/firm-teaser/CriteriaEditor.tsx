"use client";

import type { TeaserCriterion } from "@/lib/teaser";

// Editor for the active profile's criteria rows ("rec questions" in the sketch:
// each is a label + the firm's answer/threshold) and the systemPrompt textarea
// (the "Type & Gen" instruction block). Pure controlled component — all state
// lives in the parent section so Save sends one consistent profiles array.
export function CriteriaEditor({
  criteria,
  systemPrompt,
  onAddCriterion,
  onUpdateCriterion,
  onRemoveCriterion,
  onSystemPromptChange,
}: {
  criteria: TeaserCriterion[];
  systemPrompt: string;
  onAddCriterion: () => void;
  onUpdateCriterion: (id: string, patch: Partial<Pick<TeaserCriterion, "label" | "value">>) => void;
  onRemoveCriterion: (id: string) => void;
  onSystemPromptChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Criteria rows */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Investment criteria
          </label>
          <button
            type="button"
            onClick={onAddCriterion}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            Add criterion
          </button>
        </div>

        {criteria.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-subtle bg-[#F8F9FA] px-3 py-4 text-center text-sm text-text-muted">
            No criteria yet. Add rows like &ldquo;Sector&rdquo; / &ldquo;B2B SaaS, healthcare IT&rdquo;.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {criteria.map((row, idx) => (
              <div key={row.id} className="flex items-start gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-center text-xs font-bold text-text-muted">
                  {String.fromCharCode(65 + (idx % 26))}
                </span>
                <input
                  value={row.label}
                  onChange={(e) => onUpdateCriterion(row.id, { label: e.target.value })}
                  placeholder="Criterion (e.g. EBITDA multiple)"
                  className="w-2/5 rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <input
                  value={row.value}
                  onChange={(e) => onUpdateCriterion(row.id, { value: e.target.value })}
                  placeholder="Firm's answer / threshold (e.g. 6-7x)"
                  className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => onRemoveCriterion(row.id)}
                  className="mt-1 shrink-0 p-1 text-text-muted hover:text-red-500 transition-colors"
                  aria-label="Remove criterion"
                  title="Remove"
                >
                  <span className="material-symbols-outlined text-[18px] block">close</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* System prompt — the "Type & Gen" box */}
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-text-secondary">
          Teaser instructions
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          rows={6}
          placeholder="Describe the tone and what to flag. e.g. 'Write a one-line internal triage note. Lead with the best fit, then the single biggest catch (price, geography, customer concentration). Be blunt; this is for partners only.'"
          className="w-full resize-y rounded-lg border border-border-subtle px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
    </div>
  );
}
