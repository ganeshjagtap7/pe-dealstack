"use client";

import { formatCurrency } from "@/lib/formatters";
import type { AdminDeal, AdminTeamMember } from "./types";

// ─── Shared form primitives ──────────────────────────────────────────

export const INPUT_CLS =
  "w-full px-3 py-2.5 border border-border-subtle rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none";
export const LABEL_CLS = "block text-sm font-medium text-text-main mb-2";

export function DealOptions({ deals }: { deals: AdminDeal[] }) {
  return (
    <>
      <option value="">Choose a deal...</option>
      {deals.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
          {d.dealSize ? ` - ${formatCurrency(d.dealSize)}` : ""}
        </option>
      ))}
    </>
  );
}

export function UserOptions({ users }: { users: AdminTeamMember[] }) {
  return (
    <>
      <option value="">Choose a team member...</option>
      {users.map((u) => {
        const label = u.name || u.email.split("@")[0];
        const role = u.title || u.role || "";
        return (
          <option key={u.id} value={u.id}>
            {label}
            {role ? ` - ${role}` : ""}
          </option>
        );
      })}
    </>
  );
}

export interface SharedProps {
  open: boolean;
  onClose: () => void;
  deals: AdminDeal[];
  users: AdminTeamMember[];
  onToast: (msg: string, type: "success" | "error") => void;
}
