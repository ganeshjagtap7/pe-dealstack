"use client";

import type { TeaserCriterion } from "@/lib/teaser";

// Banker Blue per repo style rules (inline, not a Tailwind class).
const BANKER_BLUE = "#003366";

// Editor for the active profile's criteria rows ("rec questions" in the sketch:
// each is a label + the firm's answer/threshold) and the system-prompt box. GEN
// expands the user's rough notes + criteria into a full system prompt in place;
// the user edits and saves it. Pure controlled component — all state lives in
// the parent section so Save sends one consistent profiles array.
export function CriteriaEditor({
  criteria,
  systemPrompt,
  onAddCriterion,
  onUpdateCriterion,
  onRemoveCriterion,
  onSystemPromptChange,
  onGenerate,
  generating,
  generateError,
}: {
  criteria: TeaserCriterion[];
  systemPrompt: string;
  onAddCriterion: () => void;
  onUpdateCriterion: (id: string, patch: Partial<Pick<TeaserCriterion, "label" | "value">>) => void;
  onRemoveCriterion: (id: string) => void;
  onSystemPromptChange: (value: string) => void;
  onGenerate: () => void;
  generating: boolean;
  generateError: string | null;
}) {
  const canGenerate = !generating && (criteria.length > 0 || systemPrompt.trim().length > 0);

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

      {/* System prompt — written by hand, or expanded from notes + criteria via GEN */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            System prompt
          </label>
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: BANKER_BLUE }}
            title="Expand your notes + criteria into a full system prompt"
          >
            {generating ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[15px]">progress_activity</span>
                Generating…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                GEN
              </>
            )}
          </button>
        </div>
        <textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          rows={8}
          placeholder="Jot what you're looking for (e.g. 'I like deep-tech businesses with recurring revenue'), then hit GEN to expand it — using your criteria above — into a full system prompt. Edit it freely before saving."
          className="w-full resize-y rounded-lg border border-border-subtle px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {generateError && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {generateError}
          </div>
        )}
      </div>
    </div>
  );
}
