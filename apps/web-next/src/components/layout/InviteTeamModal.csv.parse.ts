// CSV parsing helpers for the BulkCsvImportPanel.
// Extracted so InviteTeamModal.csv.tsx stays under the 500-line cap.

// Roles accepted by POST /api/invitations/bulk (must match
// apps/api/src/routes/invitations.ts > bulkInviteSchema).
export type BulkRole = "VIEWER" | "MEMBER" | "ADMIN";
export const VALID_ROLES: BulkRole[] = ["VIEWER", "MEMBER", "ADMIN"];

export const DEFAULT_ROLE: BulkRole = "VIEWER"; // task spec: defaults to ANALYST → VIEWER
export const MAX_BULK_ROWS = 20; // matches API: bulkInviteSchema.emails max(20)

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Map a friendly label from the CSV (case-insensitive) to the API enum.
// Accepts both the new labels (Analyst/Associate/Admin) and the raw enum values.
export function normalizeRole(raw: string | undefined): {
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

export interface ParsedRow {
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
export function parseCsv(text: string): { rows: ParsedRow[]; topError?: string } {
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

export type Stage = "upload" | "preview" | "submitting" | "done";
