"use client";

// Modal wizard that asks a few structured questions and writes the answer back
// as a clean text block into the Teaser Filter criteria textarea. Pre-fills
// from Organization.settings.firmProfile (sectors, AUM) so a user who finished
// onboarding doesn't retype their thesis.

import { KeyboardEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const DEFAULT_SECTORS = [
  "Healthcare",
  "Healthcare services",
  "Industrials",
  "Software",
  "B2B SaaS",
  "Consumer",
  "Financial services",
  "Tech-enabled services",
  "Business services",
  "Energy",
];

const GEOGRAPHIES = [
  "United States",
  "Canada",
  "North America",
  "Western Europe",
  "United Kingdom",
  "EMEA",
  "APAC",
  "Global",
];

const OWNERSHIP_OPTIONS = [
  "Founder-led",
  "Family-owned",
  "Sponsor-backed",
  "Public-to-private",
  "No preference",
];

const HARD_PASS_SUGGESTIONS = [
  "Customer concentration > 40%",
  "Pre-revenue / early-stage",
  "Restructuring / turnaround",
  "Asset-heavy industrials",
  "Hardware / capex-intensive",
  "Crypto / digital assets",
  "Cannabis",
  "Regulated lending",
];

interface FirmProfile {
  sectors?: string[];
  aum?: string;
}

interface BuilderState {
  sectors: string[];
  ebitdaMin: string;
  ebitdaMax: string;
  revenueMin: string;
  revenueMax: string;
  geographies: string[];
  ownership: string[];
  hardPasses: string[];
}

const EMPTY: BuilderState = {
  sectors: [],
  ebitdaMin: "",
  ebitdaMax: "",
  revenueMin: "",
  revenueMax: "",
  geographies: [],
  ownership: [],
  hardPasses: [],
};

interface CriteriaBuilderProps {
  open: boolean;
  onClose: () => void;
  onApply: (criteriaText: string) => void;
}

export function CriteriaBuilder({ open, onClose, onApply }: CriteriaBuilderProps) {
  const [state, setState] = useState<BuilderState>(EMPTY);
  const [customSector, setCustomSector] = useState("");
  const [customGeo, setCustomGeo] = useState("");
  const [customPass, setCustomPass] = useState("");
  const [prefillNote, setPrefillNote] = useState<string | null>(null);

  // Pre-fill from saved firm profile when the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ firmProfile: FirmProfile }>("/onboarding/firm-profile");
        if (cancelled) return;
        const fp = data?.firmProfile || {};
        const sectors = Array.isArray(fp.sectors) ? fp.sectors : [];
        if (sectors.length > 0) {
          setState((s) => ({ ...s, sectors }));
          setPrefillNote(`Pre-filled ${sectors.length} sector${sectors.length > 1 ? "s" : ""} from your firm profile.`);
        }
      } catch {
        // No profile saved, that's fine — start blank.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (key: "sectors" | "geographies" | "ownership" | "hardPasses", value: string) => {
    setState((s) => {
      const list = s[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...s, [key]: next };
    });
  };

  const addCustom = (key: "sectors" | "geographies" | "hardPasses", value: string, clear: () => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState((s) => {
      const list = s[key];
      if (list.includes(trimmed)) return s;
      return { ...s, [key]: [...list, trimmed] };
    });
    clear();
  };

  const handleCustomKey = (
    e: KeyboardEvent<HTMLInputElement>,
    key: "sectors" | "geographies" | "hardPasses",
    value: string,
    clear: () => void,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustom(key, value, clear);
    }
  };

  const apply = () => {
    onApply(buildCriteriaText(state));
    onClose();
  };

  const reset = () => {
    setState(EMPTY);
    setPrefillNote(null);
  };

  const canApply =
    state.sectors.length > 0 ||
    state.ebitdaMin || state.ebitdaMax ||
    state.revenueMin || state.revenueMax ||
    state.geographies.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h3 className="font-semibold text-base text-text-primary">Build your investment criteria</h3>
            <p className="text-xs text-text-secondary mt-0.5">A few questions. We&apos;ll format your thesis into the criteria box.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-6">
          {prefillNote && (
            <div className="rounded-md bg-primary-light/40 px-3 py-2 text-xs text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
              {prefillNote}
            </div>
          )}

          <Section title="Sectors you invest in" hint="Multi-select. Add anything custom.">
            <Chips
              values={state.sectors}
              suggestions={DEFAULT_SECTORS}
              onToggle={(v) => toggle("sectors", v)}
            />
            <CustomAdd
              value={customSector}
              setValue={setCustomSector}
              onAdd={() => addCustom("sectors", customSector, () => setCustomSector(""))}
              onKey={(e) => handleCustomKey(e, "sectors", customSector, () => setCustomSector(""))}
              placeholder="e.g. Specialty distribution"
            />
          </Section>

          <Section title="Size you target" hint="$M. Revenue is optional.">
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <NumericPair label="EBITDA min" value={state.ebitdaMin} onChange={(v) => setState({ ...state, ebitdaMin: v })} placeholder="5" />
              <NumericPair label="EBITDA max" value={state.ebitdaMax} onChange={(v) => setState({ ...state, ebitdaMax: v })} placeholder="30" />
              <NumericPair label="Revenue min" value={state.revenueMin} onChange={(v) => setState({ ...state, revenueMin: v })} placeholder="20" />
              <NumericPair label="Revenue max" value={state.revenueMax} onChange={(v) => setState({ ...state, revenueMax: v })} placeholder="200" />
            </div>
          </Section>

          <Section title="Geography" hint="Where the company is HQ'd or does most of its business.">
            <Chips
              values={state.geographies}
              suggestions={GEOGRAPHIES}
              onToggle={(v) => toggle("geographies", v)}
            />
            <CustomAdd
              value={customGeo}
              setValue={setCustomGeo}
              onAdd={() => addCustom("geographies", customGeo, () => setCustomGeo(""))}
              onKey={(e) => handleCustomKey(e, "geographies", customGeo, () => setCustomGeo(""))}
              placeholder="e.g. Texas / Southeast US"
            />
          </Section>

          <Section title="Ownership preference" hint="Who's selling. Multi-select OK.">
            <Chips
              values={state.ownership}
              suggestions={OWNERSHIP_OPTIONS}
              onToggle={(v) => toggle("ownership", v)}
            />
          </Section>

          <Section title="Hard passes" hint="Things that auto-disqualify a deal.">
            <Chips
              values={state.hardPasses}
              suggestions={HARD_PASS_SUGGESTIONS}
              onToggle={(v) => toggle("hardPasses", v)}
            />
            <CustomAdd
              value={customPass}
              setValue={setCustomPass}
              onAdd={() => addCustom("hardPasses", customPass, () => setCustomPass(""))}
              onKey={(e) => handleCustomKey(e, "hardPasses", customPass, () => setCustomPass(""))}
              placeholder="e.g. Single-customer > 30% of revenue"
            />
          </Section>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-border-subtle flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Clear all
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-text-secondary hover:text-text-primary px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#003366" }}
            >
              Use these criteria
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
      {hint && <p className="text-xs text-text-secondary mt-0.5">{hint}</p>}
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Chips({
  values,
  suggestions,
  onToggle,
}: {
  values: string[];
  suggestions: string[];
  onToggle: (v: string) => void;
}) {
  const merged = Array.from(new Set([...suggestions, ...values]));
  return (
    <div className="flex flex-wrap gap-2">
      {merged.map((s) => {
        const selected = values.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onToggle(s)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selected
                ? "bg-primary-light border-primary text-primary"
                : "bg-white border-border text-text-secondary hover:border-primary/40 hover:text-text-primary",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

function CustomAdd({
  value,
  setValue,
  onAdd,
  onKey,
  placeholder,
}: {
  value: string;
  setValue: (v: string) => void;
  onAdd: () => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="flex-1 max-w-sm px-3 py-1.5 text-xs rounded-md border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={!value.trim()}
        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-primary/40 disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

function NumericPair({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-text-secondary">{label}</span>
      <div className="mt-1 relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder={placeholder}
          className="w-full pl-5 pr-8 py-1.5 rounded-md border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary">M</span>
      </div>
    </label>
  );
}

// Build a clean, AI-readable criteria text block from the form state. Designed
// to read like a human wrote it so the agent can parse it without prompting
// gymnastics.
export function buildCriteriaText(s: BuilderState): string {
  const lines: string[] = [];

  if (s.sectors.length > 0) {
    lines.push(`- Sectors in scope: ${s.sectors.join(", ")}`);
  }

  const sizeBits: string[] = [];
  if (s.ebitdaMin || s.ebitdaMax) {
    sizeBits.push(`EBITDA ${formatRange(s.ebitdaMin, s.ebitdaMax)}`);
  }
  if (s.revenueMin || s.revenueMax) {
    sizeBits.push(`revenue ${formatRange(s.revenueMin, s.revenueMax)}`);
  }
  if (sizeBits.length > 0) {
    lines.push(`- Size: ${sizeBits.join("; ")}`);
  }

  if (s.geographies.length > 0) {
    lines.push(`- Geography: ${s.geographies.join(", ")}`);
  }

  const ownership = s.ownership.filter((o) => o !== "No preference");
  if (ownership.length > 0) {
    lines.push(`- Ownership: ${ownership.join(", ")} preferred`);
  }

  if (s.hardPasses.length > 0) {
    lines.push(`- Hard pass: ${s.hardPasses.join("; ")}`);
  }

  return lines.join("\n");
}

function formatRange(min: string, max: string): string {
  if (min && max) return `$${min}M–$${max}M`;
  if (min) return `≥ $${min}M`;
  if (max) return `≤ $${max}M`;
  return "";
}
