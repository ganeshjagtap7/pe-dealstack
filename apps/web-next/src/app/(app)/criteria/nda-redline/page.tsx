"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { DocumentDropzone } from "../_components/DocumentDropzone";
import { useToast } from "@/providers/ToastProvider";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

const CRITERIA_PLACEHOLDER = `e.g.
- Mutual NDA only — no one-way agreements
- Term: max 2 years from effective date
- Carve-outs required: residuals, independent development, info already known
- No non-solicit of employees
- Governing law: Delaware or English law preferred
- Return-of-information: optional certification, no destruction-only
- No clauses prohibiting parallel evaluation of similar opportunities`;

const NDA_PLACEHOLDER = "Paste the counterparty NDA here…";

interface Redline {
  clause: string;
  originalText: string;
  issue: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestedReplacement: string;
}

interface MissingClause {
  clauseName: string;
  why: string;
  suggestedAddition: string;
}

interface NdaRedlineResult {
  status: "ok" | "failed";
  acceptable: boolean;
  summary: string;
  redlines: Redline[];
  missingClauses: MissingClause[];
  error?: string | null;
}

export default function NdaRedlinePage() {
  const { showToast } = useToast();
  const [firmCriteria, setFirmCriteria] = useState("");
  const [firmFilename, setFirmFilename] = useState<string | null>(null);
  const [counterpartyNda, setCounterpartyNda] = useState("");
  const [ndaFilename, setNdaFilename] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NdaRedlineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveForNextTime, setSaveForNextTime] = useState(false);
  const [hasSavedPolicy, setHasSavedPolicy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<{ firmProfile: { ndaCriteria?: string } }>(
          "/onboarding/firm-profile",
        );
        if (cancelled) return;
        const saved = data?.firmProfile?.ndaCriteria;
        if (saved && saved.trim().length > 0) {
          setFirmCriteria(saved);
          setHasSavedPolicy(true);
          setSaveForNextTime(true);
        }
      } catch {
        // No profile yet — start blank.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit =
    !loading && firmCriteria.trim().length >= 20 && counterpartyNda.trim().length >= 200;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (saveForNextTime) {
        api.post("/onboarding/firm-profile", { ndaCriteria: firmCriteria }).then(
          () => {
            if (!hasSavedPolicy) {
              showToast("Saved to your firm profile.", "success");
              setHasSavedPolicy(true);
            }
          },
          (err) => {
            console.warn("[criteria/nda] save policy failed:", err);
          },
        );
      }
      const res = await api.post<NdaRedlineResult>("/ai/redline-nda", {
        firmCriteria,
        counterpartyNdaText: counterpartyNda,
      });
      setResult(res);
      if (res.status !== "ok") setError(res.error || "Red-line failed");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not red-line — please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Breadcrumbs />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">NDA Red-Line</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Paste your firm&apos;s NDA criteria, drop in the counterparty NDA, and get a clause-by-clause red-line.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-text-primary">Your firm&apos;s NDA criteria</label>
          <p className="mt-0.5 text-xs text-text-secondary">Drop your NDA template/policy doc, or paste the rules below. We don&apos;t store this — only used for this red-line.</p>
          <div className="mt-2">
            <DocumentDropzone
              hasText={!!firmFilename && firmCriteria.length > 0}
              onText={(text, filename) => {
                setFirmCriteria(text);
                setFirmFilename(filename);
              }}
              onClear={() => {
                setFirmCriteria("");
                setFirmFilename(null);
              }}
              hint="PDF, DOCX, up to 50MB"
            />
          </div>
          <textarea
            value={firmCriteria}
            onChange={(e) => {
              setFirmCriteria(e.target.value);
              if (firmFilename) setFirmFilename(null);
            }}
            placeholder={CRITERIA_PLACEHOLDER}
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-border bg-white p-3 font-mono text-xs leading-relaxed text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ minHeight: 200 }}
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-text-secondary">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveForNextTime}
                onChange={(e) => setSaveForNextTime(e.target.checked)}
                className="size-3.5 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0"
              />
              <span>
                {hasSavedPolicy
                  ? "Update saved policy on submit"
                  : "Save this policy to my firm profile"}
              </span>
            </label>
            <span>{firmCriteria.length.toLocaleString()} chars</span>
          </div>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-text-primary">Counterparty NDA</label>
          <p className="mt-0.5 text-xs text-text-secondary">Drop a PDF/Word doc, or paste the text below.</p>
          <div className="mt-2">
            <DocumentDropzone
              hasText={!!ndaFilename && counterpartyNda.length > 0}
              onText={(text, filename) => {
                setCounterpartyNda(text);
                setNdaFilename(filename);
              }}
              onClear={() => {
                setCounterpartyNda("");
                setNdaFilename(null);
              }}
              hint="PDF, DOCX, up to 50MB"
            />
          </div>
          <textarea
            value={counterpartyNda}
            onChange={(e) => {
              setCounterpartyNda(e.target.value);
              if (ndaFilename) setNdaFilename(null);
            }}
            placeholder={NDA_PLACEHOLDER}
            spellCheck={false}
            className="mt-2 w-full rounded-lg border border-border bg-white p-3 font-mono text-xs leading-relaxed text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ minHeight: 200 }}
          />
          <p className="mt-1 text-right text-[10px] text-text-secondary">
            {counterpartyNda.length.toLocaleString()} chars
          </p>
        </div>
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
              Red-lining…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">rule</span>
              Generate red-line
            </>
          )}
        </button>
        {!canSubmit && !loading && (
          <p className="text-xs text-text-secondary">
            Paste at least your criteria (≥20 chars) and the NDA (≥200 chars).
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
      <span className="text-text-primary">NDA Red-Line</span>
    </nav>
  );
}

function ResultPanel({ result }: { result: NdaRedlineResult }) {
  const { acceptable, summary, redlines, missingClauses } = result;

  return (
    <section className="mt-8">
      <div
        className={`rounded-xl border p-5 ${
          acceptable
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined text-[22px] ${
              acceptable ? "text-green-700" : "text-amber-700"
            }`}
          >
            {acceptable ? "check_circle" : "edit_note"}
          </span>
          <h2 className="text-base font-semibold text-text-primary">
            {acceptable ? "Acceptable as-is" : `${redlines.length} red-lines, ${missingClauses.length} missing clauses`}
          </h2>
        </div>
        <p className="mt-2 text-sm text-text-secondary">{summary}</p>
      </div>

      {redlines.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Clauses to red-line
          </h3>
          <ul className="mt-3 space-y-3">
            {redlines.map((r, i) => (
              <RedlineCard key={i} redline={r} />
            ))}
          </ul>
        </div>
      )}

      {missingClauses.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
            Missing clauses to add
          </h3>
          <ul className="mt-3 space-y-3">
            {missingClauses.map((m, i) => (
              <MissingCard key={i} missing={m} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function RedlineCard({ redline }: { redline: Redline }) {
  const severityClass = SEVERITY_STYLES[redline.severity] || SEVERITY_STYLES.medium;
  return (
    <li className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">{redline.clause}</h4>
          <p className="mt-1 text-xs text-text-secondary">{redline.issue}</p>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${severityClass}`}
        >
          {redline.severity}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-md bg-red-50 p-3 ring-1 ring-red-100">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700">Original</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-red-900">
            {redline.originalText}
          </p>
        </div>
        <div className="rounded-md bg-green-50 p-3 ring-1 ring-green-100">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-green-700">Suggested</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-green-900">
            {redline.suggestedReplacement}
          </p>
        </div>
      </div>
    </li>
  );
}

function MissingCard({ missing }: { missing: MissingClause }) {
  return (
    <li className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-text-primary">{missing.clauseName}</h4>
      <p className="mt-1 text-xs text-text-secondary">{missing.why}</p>
      <div className="mt-3 rounded-md bg-blue-50 p-3 ring-1 ring-blue-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Add</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-blue-900">
          {missing.suggestedAddition}
        </p>
      </div>
    </li>
  );
}
