"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";

const DECISION_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  GO: { bg: "bg-green-50", text: "text-green-800", border: "border-green-300", label: "GO" },
  NO_GO: { bg: "bg-red-50", text: "text-red-800", border: "border-red-300", label: "NO-GO" },
  MAYBE: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-300", label: "MAYBE" },
};

const STATUS_STYLES: Record<string, string> = {
  pass: "bg-green-50 text-green-700 border-green-200",
  fail: "bg-red-50 text-red-700 border-red-200",
  unclear: "bg-slate-50 text-slate-600 border-slate-200",
};

const CRITERIA_PLACEHOLDER = `e.g.
- Sectors in scope: B2B SaaS, healthtech, fintech, business services
- Excluded: restructuring / turnaround, pre-revenue startups, crypto
- Size: $1–5M EBITDA; revenue $5–50M
- Geography: North America and Western Europe only
- Ownership: founder-led or family-owned succession preferred
- Hard pass: customer concentration > 40%, asset-heavy industrials`;

const TEASER_PLACEHOLDER = "Paste the teaser or short CIM text here…";

interface CriterionCheck {
  criterion: string;
  status: "pass" | "fail" | "unclear";
  finding: string;
}

interface ExtractedFacts {
  company: string | null;
  sector: string | null;
  geography: string | null;
  revenue: string | null;
  ebitda: string | null;
  askingPrice: string | null;
  ownership: string | null;
  notes: string | null;
}

interface TeaserFilterResult {
  status: "ok" | "failed";
  decision: "GO" | "NO_GO" | "MAYBE";
  score: number;
  summary: string;
  extractedFacts: ExtractedFacts;
  criteriaChecks: CriterionCheck[];
  flags: string[];
  error?: string | null;
}

export default function TeaserFilterPage() {
  const [investmentCriteria, setInvestmentCriteria] = useState("");
  const [teaserText, setTeaserText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TeaserFilterResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !loading && investmentCriteria.trim().length >= 20 && teaserText.trim().length >= 100;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<TeaserFilterResult>("/ai/filter-teaser", {
        investmentCriteria,
        teaserText,
      });
      setResult(res);
      if (res.status !== "ok") setError(res.error || "Filter failed");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not run filter — please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Breadcrumbs />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Teaser Go / No-Go</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Paste your investment criteria, drop in a teaser or short CIM, and get a decision in seconds.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CriteriaTextarea
          label="Your investment criteria"
          hint="Paste once. Sectors in / out, size band, geography, exclusions."
          value={investmentCriteria}
          onChange={setInvestmentCriteria}
          placeholder={CRITERIA_PLACEHOLDER}
          minHeight={260}
        />
        <CriteriaTextarea
          label="Teaser / short CIM"
          hint="Paste the full text. PDF / Word import coming soon."
          value={teaserText}
          onChange={setTeaserText}
          placeholder={TEASER_PLACEHOLDER}
          minHeight={260}
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "#003366" }}
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              Triaging…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">fact_check</span>
              Run filter
            </>
          )}
        </button>
        {!canSubmit && !loading && (
          <p className="text-xs text-text-secondary">
            Paste at least your criteria (≥20 chars) and the teaser (≥100 chars).
          </p>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && result.status === "ok" && <ResultPanel result={result} />}
    </div>
  );
}

function Breadcrumbs() {
  return (
    <nav className="mb-4 text-sm text-text-secondary">
      <Link href="/criteria" className="hover:text-primary">
        Criteria Engine
      </Link>
      <span className="mx-2">/</span>
      <span className="text-text-primary">Teaser Go / No-Go</span>
    </nav>
  );
}

interface CriteriaTextareaProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  minHeight: number;
}

function CriteriaTextarea({ label, hint, value, onChange, placeholder, minHeight }: CriteriaTextareaProps) {
  return (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="mt-2 w-full rounded-lg border border-border bg-white p-3 font-mono text-xs leading-relaxed text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ minHeight }}
      />
      <p className="mt-1 text-right text-[10px] text-text-secondary">
        {value.length.toLocaleString()} chars
      </p>
    </div>
  );
}

function ResultPanel({ result }: { result: TeaserFilterResult }) {
  const decision = DECISION_STYLES[result.decision] || DECISION_STYLES.MAYBE;
  return (
    <section className="mt-8">
      <div className={`rounded-xl border-2 p-5 ${decision.bg} ${decision.border}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider ${decision.text}`}>
              Decision
            </p>
            <p className={`mt-1 text-3xl font-bold ${decision.text}`}>{decision.label}</p>
            <p className="mt-3 max-w-2xl text-sm text-text-secondary">{result.summary}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Confidence
            </p>
            <p className="mt-1 text-3xl font-bold text-text-primary">{result.score}</p>
          </div>
        </div>
      </div>

      <FactsPanel facts={result.extractedFacts} />

      {result.criteriaChecks.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Criterion checks
          </h3>
          <ul className="mt-3 space-y-2">
            {result.criteriaChecks.map((c, i) => (
              <CheckRow key={i} check={c} />
            ))}
          </ul>
        </div>
      )}

      {result.flags.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Other flags
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm text-text-primary">
            {result.flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-text-secondary">flag</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const FACT_LABELS: Array<[keyof ExtractedFacts, string]> = [
  ["company", "Company"],
  ["sector", "Sector"],
  ["geography", "Geography"],
  ["revenue", "Revenue"],
  ["ebitda", "EBITDA"],
  ["askingPrice", "Asking"],
  ["ownership", "Ownership"],
];

function FactsPanel({ facts }: { facts: ExtractedFacts }) {
  return (
    <div className="mt-6 rounded-lg border border-border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
        Extracted facts
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
        {FACT_LABELS.map(([key, label]) => (
          <div key={key}>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              {label}
            </dt>
            <dd className="text-sm text-text-primary">
              {facts[key] || <span className="text-text-secondary">—</span>}
            </dd>
          </div>
        ))}
      </dl>
      {facts.notes && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-text-secondary">
          {facts.notes}
        </p>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: CriterionCheck }) {
  const cls = STATUS_STYLES[check.status] || STATUS_STYLES.unclear;
  return (
    <li className="rounded-lg border border-border bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
        >
          {check.status}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{check.criterion}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{check.finding}</p>
        </div>
      </div>
    </li>
  );
}
