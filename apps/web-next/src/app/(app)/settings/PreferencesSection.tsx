"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface PrefsState {
  investmentFocus: string[];
  preferredCurrency: string;
  density: string;
  theme: string;
}

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];
const SECTOR_PRESETS = ["Healthcare IT", "SaaS", "FinTech", "Consumer", "Industrial", "Real Estate"];
const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact", icon: "density_small" },
  { value: "default", label: "Default", icon: "density_medium" },
  { value: "comfortable", label: "Comfortable", icon: "density_large" },
];
const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
];

interface Props {
  prefs: PrefsState;
  onChange: (patch: Partial<PrefsState>) => void;
}

export function PreferencesSection({ prefs, onChange }: Props) {
  const [sectorModalOpen, setSectorModalOpen] = useState(false);
  const [sectorInput, setSectorInput] = useState("");

  const addSector = (raw: string) => {
    const name = raw.trim();
    if (!name || prefs.investmentFocus.includes(name)) return;
    onChange({ investmentFocus: [...prefs.investmentFocus, name] });
    setSectorInput("");
    setSectorModalOpen(false);
  };

  const removeSector = (name: string) => {
    onChange({ investmentFocus: prefs.investmentFocus.filter((s) => s !== name) });
  };

  return (
    <>
      {/* Preferences */}
      <section
        id="section-preferences"
        className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
      >
        <div className="px-6 py-5 border-b border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-primary-light rounded-lg text-primary border border-primary/20">
            <span className="material-symbols-outlined text-[20px] block">tune</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Preferences</h2>
            <p className="text-xs text-text-muted">
              Configure your investment focus and display settings.
            </p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {/* Investment Focus */}
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
              Investment Focus Sectors
            </label>
            <div className="flex gap-2 flex-wrap items-center">
              {prefs.investmentFocus.map((s) => (
                <div
                  key={s}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-border-subtle rounded-lg text-sm font-semibold text-text-main"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSector(s)}
                    className="text-text-muted hover:text-red-500 transition-colors"
                    aria-label={`Remove ${s}`}
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSectorModalOpen(true)}
                className="inline-flex items-center bg-white hover:bg-primary-light border border-dashed border-gray-300 hover:border-primary rounded-lg px-3 py-1.5 text-sm font-semibold text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] mr-1">add</span>
                Add Sector
              </button>
            </div>
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
              Preferred Currency
            </label>
            <select
              value={prefs.preferredCurrency}
              onChange={(e) => onChange({ preferredCurrency: e.target.value })}
              className="w-full rounded-lg border border-border-subtle bg-white text-text-main text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary h-11 px-4 shadow-sm outline-none cursor-pointer max-w-xs"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Display Preferences */}
      <section
        id="section-display"
        className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
      >
        <div className="px-6 py-5 border-b border-border-subtle flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-200">
            <span className="material-symbols-outlined text-[20px] block">palette</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Display Preferences</h2>
            <p className="text-xs text-text-muted">Control layout density and theme.</p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
              Layout Density
            </label>
            <div className="flex gap-3">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ density: opt.value })}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium",
                    prefs.density === opt.value
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30",
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
              Theme
            </label>
            <div className="flex gap-3">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onChange({ theme: opt.value })}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium",
                    prefs.theme === opt.value
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30",
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Add Sector Modal */}
      {sectorModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSectorModalOpen(false);
            setSectorInput("");
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-border-subtle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-text-main">Add Investment Sector</h3>
              <button
                type="button"
                onClick={() => {
                  setSectorModalOpen(false);
                  setSectorInput("");
                }}
                className="text-text-muted hover:text-text-main transition-colors p-1 hover:bg-gray-200 rounded"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="p-6">
              <input
                autoFocus
                type="text"
                value={sectorInput}
                onChange={(e) => setSectorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSector(sectorInput);
                  }
                }}
                placeholder="e.g. Healthcare IT, FinTech, SaaS..."
                className="w-full rounded-lg border border-border-subtle bg-white text-text-main text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary h-11 px-4 mb-4 shadow-sm outline-none"
              />
              <div className="flex gap-2 flex-wrap mb-4">
                {SECTOR_PRESETS.filter((p) => !prefs.investmentFocus.includes(p)).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => addSector(p)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-primary-light hover:text-primary border border-border-subtle rounded-lg transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => addSector(sectorInput)}
                disabled={!sectorInput.trim()}
                className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg transition-colors shadow-card disabled:opacity-50"
              >
                Add Sector
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

