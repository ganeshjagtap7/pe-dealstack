"use client";

import { cn } from "@/lib/cn";

// Lightweight Document shape — we only need id/name/type to render the
// per-doc Re-extract row. Mirrors the relevant fields from DocItem in
// ./components.tsx without taking a hard dependency on the full type.
export interface FinancialDocLite {
  id: string;
  name: string;
  type?: string | null;
  fileUrl?: string | null;
}

// "Financial-shaped" predicate — mirrors isFinancialDoc in
// apps/api/src/routes/financials-extraction.ts:40-53. Kept in sync so the
// docs we render Re-extract buttons for are exactly the docs the API would
// process under mode='all_financials'. mimeType isn't surfaced to the
// client, so we fall back to filename + type tag only.
export function isFinancialShaped(d: FinancialDocLite): boolean {
  const t = (d.type ?? "").toUpperCase();
  if (t === "CIM" || t === "FINANCIALS" || t === "EXCEL") return true;
  const n = (d.name ?? "").toLowerCase();
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return true;
  return false;
}

interface DealFinancialsReextractListProps {
  /** Financial-shaped docs (already filtered through isFinancialShaped). */
  financialDocs: FinancialDocLite[];
  /** True while ANY extraction is in flight — disables every per-doc button. */
  extracting: boolean;
  /** ID of the doc whose single-doc extraction is currently running, if any. */
  extractingDocId: string | null;
  /** Single-doc re-extract handler — forwards to the parent's handleExtract. */
  onReextract: (docId: string, docName: string) => void;
}

/**
 * Per-document Re-extract list — collapsible. Lets the user re-run the
 * agent against a single doc when one large file (e.g. a 36-month XLSX)
 * is timing out under the bulk multi-doc loop and shedding data for the
 * other docs. The bulk button in the parent toolbar stays unchanged.
 */
export function DealFinancialsReextractList({
  financialDocs,
  extracting,
  extractingDocId,
  onReextract,
}: DealFinancialsReextractListProps) {
  if (financialDocs.length === 0) return null;

  return (
    <details className="mb-4 rounded-lg border border-gray-100 bg-gray-50/60">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 select-none flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm">description</span>
        Re-extract a single document
        <span className="text-gray-400 font-normal">
          ({financialDocs.length} financial doc{financialDocs.length === 1 ? "" : "s"})
        </span>
      </summary>
      <ul className="px-2 pb-2 pt-0 divide-y divide-gray-100">
        {financialDocs.map((doc) => {
          const busy = extracting && extractingDocId === doc.id;
          return (
            <li key={doc.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="material-symbols-outlined text-[14px] text-gray-400 shrink-0">
                description
              </span>
              <span className="text-xs text-gray-700 truncate flex-1">
                {doc.name}
              </span>
              <button
                onClick={() => onReextract(doc.id, doc.name)}
                disabled={extracting}
                aria-label="Re-extract this document"
                title="Re-extract this document"
                className="flex items-center justify-center text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-md transition-all hover:bg-gray-50 disabled:opacity-60 disabled:pointer-events-none"
                style={{ width: 26, height: 26 }}
              >
                <span className={cn(
                  "material-symbols-outlined text-sm",
                  busy && "animate-spin",
                )}>
                  {busy ? "progress_activity" : "refresh"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
