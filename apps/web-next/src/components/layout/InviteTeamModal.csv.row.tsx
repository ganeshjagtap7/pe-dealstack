"use client";

import type { ParsedRow, Stage } from "./InviteTeamModal.csv.parse";

// Per-row status indicator for the preview/submitting/done table.
// Extracted from InviteTeamModal.csv.tsx so the parent module stays under the
// 500-line cap.

export function RowStatus({ row, stage }: { row: ParsedRow; stage: Stage }) {
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
