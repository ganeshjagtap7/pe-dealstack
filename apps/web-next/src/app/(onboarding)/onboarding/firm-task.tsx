"use client";

import { KeyboardEvent, useState } from "react";
import { cn } from "@/lib/cn";
import { TaskModalShell } from "./task-modal-shell";
import { AUM_OPTIONS, DEFAULT_SECTORS, FirmData } from "./types";

// Firm task modal — form for website/linkedin + fund size + sectors.
// Ported from OnboardingTasks._renderers.firm + _hydrators.firm in
// apps/web/js/onboarding/onboarding-tasks.js. AI enrichment button is
// deferred — user fills the form manually for now.
export function FirmTaskModal({
  value,
  onChange,
  onClose,
  onComplete,
}: {
  value: FirmData;
  onChange: (v: FirmData) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [customSectorOpen, setCustomSectorOpen] = useState(false);
  const [customSector, setCustomSector] = useState("");

  const canComplete = value.aum !== "" && value.sectors.length > 0;

  const toggleSector = (sector: string) => {
    const next = value.sectors.includes(sector)
      ? value.sectors.filter((s) => s !== sector)
      : [...value.sectors, sector];
    onChange({ ...value, sectors: next });
  };

  const addCustomSector = () => {
    const trimmed = customSector.trim();
    if (!trimmed || value.sectors.includes(trimmed)) return;
    onChange({ ...value, sectors: [...value.sectors, trimmed] });
    setCustomSector("");
  };

  const handleCustomKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomSector();
    }
  };

  const extraSectors = value.sectors.filter((s) => !DEFAULT_SECTORS.includes(s));

  return (
    <TaskModalShell
      icon="business"
      title="Define your investment focus"
      onClose={onClose}
      onComplete={onComplete}
      canComplete={canComplete}
    >
      <p className="text-[13.5px] text-text-secondary mb-4">
        Help us tailor AI findings to your strategy. This takes 30 seconds.
      </p>

      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Firm website</label>
      <div className="relative mb-4">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
          link
        </span>
        <input
          type="url"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder="yourfirm.com"
          className="w-full pl-10 pr-3 py-2.5 text-[14px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">LinkedIn</label>
      <div className="relative mb-4">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[16px]">
          person
        </span>
        <input
          type="url"
          value={value.linkedin}
          onChange={(e) => onChange({ ...value, linkedin: e.target.value })}
          placeholder="https://linkedin.com/in/yourprofile"
          className="w-full pl-10 pr-3 py-2.5 text-[14px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
      </div>

      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Fund size</label>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {AUM_OPTIONS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ ...value, aum: v })}
            className={cn(
              "p-2.5 text-[12.5px] rounded-lg border transition-all",
              value.aum === v
                ? "border-primary bg-[#F5F9FD] text-primary shadow-[inset_0_0_0_1px_#003366]"
                : "border-border-subtle bg-white text-text-secondary hover:border-border-focus hover:bg-[#FAFBFC]",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <label className="block text-[12px] font-medium text-text-secondary mb-1.5">Sectors you focus on</label>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_SECTORS.map((s) => {
          const selected = value.sectors.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggleSector(s)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                selected ? "bg-primary-light border-primary text-primary" : "bg-white border-border-subtle text-text-secondary hover:border-border-focus",
              )}
            >
              {s}
            </button>
          );
        })}
        {extraSectors.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSector(s)}
            className="rounded-full bg-primary-light border border-primary px-3 py-1.5 text-[12.5px] font-medium text-primary"
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomSectorOpen((v) => !v)}
          className="rounded-full bg-white border border-dashed border-border-subtle px-3 py-1.5 text-[12.5px] font-medium text-text-secondary hover:border-border-focus"
        >
          + Other
        </button>
      </div>

      {customSectorOpen && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={customSector}
            onChange={(e) => setCustomSector(e.target.value)}
            onKeyDown={handleCustomKey}
            placeholder="e.g. Real Estate, Biotech..."
            className="flex-1 px-3 py-2 text-[13px] rounded-lg border border-border-subtle focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
          <button
            type="button"
            onClick={addCustomSector}
            className="text-[12px] font-semibold text-white px-3 py-2 rounded-lg hover:opacity-90"
            style={{ backgroundColor: "#003366" }}
          >
            Add
          </button>
        </div>
      )}
    </TaskModalShell>
  );
}
