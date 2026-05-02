"use client";

import { useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

// Roles accepted by POST /api/invitations/bulk (must match
// apps/api/src/routes/invitations.ts > bulkInviteSchema).
type BulkRole = "VIEWER" | "MEMBER" | "ADMIN";
const VALID_ROLES: BulkRole[] = ["VIEWER", "MEMBER", "ADMIN"];

const DEFAULT_ROLE: BulkRole = "VIEWER"; // task spec: defaults to ANALYST → VIEWER
const MAX_BULK_ROWS = 20; // matches API: bulkInviteSchema.emails max(20)

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Map a friendly label from the CSV (case-insensitive) to the API enum.
// Accepts both the new labels (Analyst/Associate/Admin) and the raw enum values.
function normalizeRole(raw: string | undefined): {
  role: BulkRole;
  warning?: string;
} {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return { role: DEFAULT_ROLE };
  // Friendly aliases
  const aliasMap: Record<string, BulkRole> = {
    ANALYST: "VIEWER",
    VIEWER: "VIEWER",
    ASSOCIATE: "MEMBER",
    MEMBER: "MEMBER",
    PARTNER: "MEMBER",
    PRINCIPAL: "MEMBER",
    ADMIN: "ADMIN",
  };
  const mapped = aliasMap[v];
  if (mapped) return { role: mapped };
  return {
    role: DEFAULT_ROLE,
    warning: `Unknown role "${raw}", defaulted to Analyst`,
  };
}

interface ParsedRow {
  rowNumber: number; // 1-indexed CSV row (excluding header)
  email: string;
  role: BulkRole;
  deal: string;
  // Validation status — when set, the row will not be submitted.
  invalid?: string;
  // Non-fatal note (e.g. unknown role coerced to default).
  note?: string;
  // Result after submission.
  result?:
    | { kind: "sent" }
    | { kind: "exists" }
    | { kind: "pending" }
    | { kind: "error"; error?: string }
    | { kind: "skipped"; reason: string };
}

// Strip BOM, trim CR, treat blank lines as skipped.
function parseCsv(text: string): { rows: ParsedRow[]; topError?: string } {
  const cleaned = text.replace(/^﻿/, "");
  const lines = cleaned.split(/\r?\n/);
  // Find first non-empty line as header.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { rows: [], topError: "CSV is empty" };
  }
  const header = lines[headerIdx]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const emailCol = header.indexOf("email");
  if (emailCol === -1) {
    return {
      rows: [],
      topError: 'CSV must contain an "email" column in the header row.',
    };
  }
  const roleCol = header.indexOf("role");
  const dealCol = header.indexOf("deal");

  const rows: ParsedRow[] = [];
  let csvRowNum = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim().length === 0) continue;
    csvRowNum++;
    const cells = raw
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const email = (cells[emailCol] ?? "").trim();
    const roleRaw = roleCol === -1 ? "" : cells[roleCol] ?? "";
    const deal = dealCol === -1 ? "" : (cells[dealCol] ?? "").trim();
    const { role, warning } = normalizeRole(roleRaw);

    let invalid: string | undefined;
    if (!email) invalid = "Missing email";
    else if (!isValidEmail(email)) invalid = "Invalid email";

    rows.push({
      rowNumber: csvRowNum,
      email,
      role,
      deal,
      invalid,
      note: warning,
    });
  }
  return { rows };
}

type Stage = "upload" | "preview" | "submitting" | "done";

export function BulkCsvImportPanel({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [topError, setTopError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validRows = useMemo(() => rows.filter((r) => !r.invalid), [rows]);
  const tooMany = validRows.length > MAX_BULK_ROWS;

  const handleFile = (file: File) => {
    setSubmitError(null);
    setTopError(null);
    if (
      !file.name.toLowerCase().endsWith(".csv") &&
      file.type !== "text/csv"
    ) {
      setTopError("Please upload a .csv file.");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const { rows: parsed, topError: err } = parseCsv(text);
      if (err) {
        setTopError(err);
        setRows([]);
        setStage("upload");
        return;
      }
      if (parsed.length === 0) {
        setTopError("No rows found in CSV.");
        setRows([]);
        setStage("upload");
        return;
      }
      setRows(parsed);
      setStage("preview");
    };
    reader.onerror = () => {
      setTopError("Could not read file.");
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (validRows.length === 0 || tooMany) return;
    setStage("submitting");
    setSubmitError(null);

    // The API takes one role per call. Group rows by role and call
    // POST /api/invitations/bulk once per role group; merge results
    // back onto the originating rows.
    const groups = new Map<BulkRole, ParsedRow[]>();
    for (const r of validRows) {
      const list = groups.get(r.role) ?? [];
      list.push(r);
      groups.set(r.role, list);
    }

    const updated = new Map<string, ParsedRow["result"]>();
    let hadFatalError = false;

    for (const [role, group] of groups.entries()) {
      try {
        const data = await api.post<{
          total: number;
          sent: number;
          results: {
            email: string;
            status: "sent" | "exists" | "pending" | "error";
            error?: string;
          }[];
        }>("/invitations/bulk", {
          emails: group.map((r) => r.email),
          role,
        });
        const byEmail = new Map(
          (data.results ?? []).map((r) => [r.email.toLowerCase(), r]),
        );
        for (const row of group) {
          const r = byEmail.get(row.email.toLowerCase());
          if (!r) {
            updated.set(`${row.rowNumber}|${row.email}`, {
              kind: "error",
              error: "No response for this email",
            });
            continue;
          }
          if (r.status === "sent")
            updated.set(`${row.rowNumber}|${row.email}`, { kind: "sent" });
          else if (r.status === "exists")
            updated.set(`${row.rowNumber}|${row.email}`, { kind: "exists" });
          else if (r.status === "pending")
            updated.set(`${row.rowNumber}|${row.email}`, { kind: "pending" });
          else
            updated.set(`${row.rowNumber}|${row.email}`, {
              kind: "error",
              error: r.error,
            });
        }
      } catch (err) {
        hadFatalError = true;
        const msg = err instanceof Error ? err.message : "Request failed";
        for (const row of group) {
          updated.set(`${row.rowNumber}|${row.email}`, {
            kind: "error",
            error: msg,
          });
        }
        // Surface the first network/permission error to the top, but keep
        // looping the remaining groups so the user sees per-group results.
        if (!submitError) setSubmitError(msg);
      }
    }

    setRows((prev) =>
      prev.map((r) => {
        if (r.invalid) {
          return {
            ...r,
            result: { kind: "skipped", reason: r.invalid },
          };
        }
        const k = `${r.rowNumber}|${r.email}`;
        return updated.has(k) ? { ...r, result: updated.get(k) } : r;
      }),
    );
    setStage("done");
    // Hint that something went wrong even if a group succeeded.
    if (hadFatalError && !submitError) {
      setSubmitError("Some invitations could not be processed. See per-row results.");
    }
  };

  const reset = () => {
    setStage("upload");
    setRows([]);
    setFileName(null);
    setTopError(null);
    setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sentCount = rows.filter((r) => r.result?.kind === "sent").length;

  return (
    <div className="space-y-4">
      {/* Sub-header with breadcrumb back to row entry */}
      <div className="flex items-center justify-between border-b border-[#EBEBEB] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stage === "done" ? reset : onBack}
            className="flex items-center gap-1 text-sm text-[#003366] hover:text-blue-700 font-medium px-2 py-1 rounded-md hover:bg-[#E6EDF5] transition-colors"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {stage === "done" ? "Import another file" : "Back to manual entry"}
          </button>
        </div>
        <div className="text-xs text-[#868E96]">
          {stage === "upload" && "Step 1 of 2 — Upload"}
          {stage === "preview" && "Step 2 of 2 — Preview & Send"}
          {stage === "submitting" && "Sending..."}
          {stage === "done" && "Results"}
        </div>
      </div>

      {stage === "upload" && (
        <div className="space-y-4">
          {/* Format reference */}
          <div className="bg-[#F0F4F8] border border-[#E0E8F0] rounded-lg p-4">
            <div className="flex gap-3 items-start">
              <span className="material-symbols-outlined text-[#003366] text-xl mt-0.5">
                description
              </span>
              <div className="flex-1 text-sm text-[#343A40]">
                <div className="font-medium mb-1">Expected CSV format</div>
                <div className="text-[#868E96] text-xs mb-2">
                  Headers required: <code>email</code> (required),{" "}
                  <code>role</code> (optional, defaults to Analyst),{" "}
                  <code>deal</code> (optional). Roles: Analyst, Associate, Admin.
                </div>
                <pre className="bg-white border border-[#EBEBEB] rounded-md p-2 text-xs text-[#343A40] overflow-x-auto whitespace-pre">{`email,role,deal
analyst1@firm.com,ANALYST,
partner@firm.com,ASSOCIATE,Project Atlas`}</pre>
                <div className="text-[#868E96] text-xs mt-2">
                  Up to {MAX_BULK_ROWS} valid rows per import. Deal names in CSV
                  are shown for reference but cannot be auto-attached during
                  bulk import.
                </div>
              </div>
            </div>
          </div>

          {/* Drop zone */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
            className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-[#003366] bg-[#E6EDF5]"
                : "border-[#EBEBEB] bg-white hover:border-[#003366]/40 hover:bg-[#F0F4F8]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <span className="material-symbols-outlined text-4xl text-[#003366]">
              upload_file
            </span>
            <div className="mt-2 text-sm font-medium text-[#343A40]">
              Drop your CSV here, or click to browse
            </div>
            <div className="text-xs text-[#868E96] mt-1">.csv files only</div>
          </label>

          {topError && (
            <div className="rounded-lg p-3 text-sm border bg-red-50 border-red-200 text-red-700">
              {topError}
            </div>
          )}
        </div>
      )}

      {(stage === "preview" || stage === "submitting" || stage === "done") && (
        <div className="space-y-4">
          {fileName && (
            <div className="flex items-center gap-2 text-sm text-[#868E96]">
              <span className="material-symbols-outlined text-base text-[#003366]">
                description
              </span>
              <span className="text-[#343A40] font-medium">{fileName}</span>
              <span>·</span>
              <span>
                {validRows.length} valid row{validRows.length !== 1 ? "s" : ""},{" "}
                {rows.length - validRows.length} skipped
              </span>
            </div>
          )}

          {tooMany && stage === "preview" && (
            <div className="rounded-lg p-3 text-sm border bg-red-50 border-red-200 text-red-700">
              Bulk import is limited to {MAX_BULK_ROWS} valid rows per file.
              You have {validRows.length}. Split your CSV into smaller files.
            </div>
          )}

          {submitError && (
            <div className="rounded-lg p-3 text-sm border bg-red-50 border-red-200 text-red-700">
              {submitError}
            </div>
          )}

          {stage === "done" && sentCount > 0 && (
            <div className="rounded-lg p-3 text-sm border bg-green-50 border-green-200 text-green-700">
              {sentCount} invitation{sentCount > 1 ? "s" : ""} sent successfully.
            </div>
          )}

          <div className="border border-[#EBEBEB] rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8F9FA] text-[#868E96]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-10">#</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className="px-3 py-2 text-left font-medium">Deal</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.rowNumber}-${r.email}`}
                      className="border-t border-[#EBEBEB]"
                    >
                      <td className="px-3 py-2 text-[#868E96]">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-[#343A40] font-medium">
                        {r.email || (
                          <span className="text-[#868E96] italic">empty</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#343A40]">
                        {r.role === "VIEWER"
                          ? "Analyst"
                          : r.role === "MEMBER"
                            ? "Associate"
                            : "Admin"}
                      </td>
                      <td className="px-3 py-2 text-[#868E96]">
                        {r.deal || <span className="italic">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <RowStatus row={r} stage={stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex justify-end gap-3 pt-2">
        {stage === "upload" && (
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-lg border border-[#EBEBEB] text-[#343A40] font-medium text-sm hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>
        )}
        {stage === "preview" && (
          <>
            <button
              type="button"
              onClick={reset}
              className="px-5 py-2.5 rounded-lg border border-[#EBEBEB] text-[#343A40] font-medium text-sm hover:bg-black/5 transition-colors"
            >
              Choose another file
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={validRows.length === 0 || tooMany}
              className="px-5 py-2.5 rounded-lg text-white font-medium text-sm shadow-lg transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "#003366" }}
            >
              <span className="material-symbols-outlined text-lg">send</span>
              Send {validRows.length} invitation
              {validRows.length === 1 ? "" : "s"}
            </button>
          </>
        )}
        {stage === "submitting" && (
          <button
            type="button"
            disabled
            className="px-5 py-2.5 rounded-lg text-white font-medium text-sm shadow-lg flex items-center gap-2 opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            Sending...
          </button>
        )}
        {stage === "done" && (
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-white font-medium text-sm shadow-lg transition-all active:scale-95"
            style={{ backgroundColor: "#003366" }}
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}

function RowStatus({ row, stage }: { row: ParsedRow; stage: Stage }) {
  if (row.invalid) {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 text-xs">
        <span className="material-symbols-outlined text-sm">error</span>
        {row.invalid}
      </span>
    );
  }
  if (stage === "preview") {
    if (row.note) {
      return (
        <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
          <span className="material-symbols-outlined text-sm">info</span>
          {row.note}
        </span>
      );
    }
    return <span className="text-[#868E96] text-xs">Ready</span>;
  }
  if (stage === "submitting") {
    return <span className="text-[#868E96] text-xs">Sending…</span>;
  }
  // done
  const r = row.result;
  if (!r) return <span className="text-[#868E96] text-xs">No result</span>;
  if (r.kind === "sent")
    return (
      <span className="inline-flex items-center gap-1 text-green-700 text-xs">
        <span className="material-symbols-outlined text-sm">check_circle</span>
        Invitation sent
      </span>
    );
  if (r.kind === "exists")
    return (
      <span className="inline-flex items-center gap-1 text-[#868E96] text-xs">
        <span className="material-symbols-outlined text-sm">person</span>
        Already on the team
      </span>
    );
  if (r.kind === "pending")
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
        <span className="material-symbols-outlined text-sm">schedule</span>
        Invite already pending
      </span>
    );
  if (r.kind === "skipped")
    return (
      <span className="inline-flex items-center gap-1 text-[#868E96] text-xs">
        <span className="material-symbols-outlined text-sm">block</span>
        Skipped: {r.reason}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-red-600 text-xs">
      <span className="material-symbols-outlined text-sm">error</span>
      {r.error || "Failed"}
    </span>
  );
}
