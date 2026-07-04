"use client";

import { TaskModalShell } from "./task-modal-shell";
import { TEAM_ROLES, TeamInvite } from "./types";

// Team invite task — dynamic rows of (email, role). On "Mark as done" the
// parent's completeTask("team") POSTs each valid row to /invitations (see
// page.tsx). The role labels here are visual-only (Analyst/VP/Partner/Admin);
// completeTask maps them to the API enum (ADMIN/MEMBER/VIEWER) — Admin→ADMIN,
// everyone else→MEMBER — and roles can be changed later in Settings → Team.
export function TeamTaskModal({
  invites,
  onChange,
  onClose,
  onComplete,
}: {
  invites: TeamInvite[];
  onChange: (v: TeamInvite[]) => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const updateRow = (i: number, patch: Partial<TeamInvite>) => {
    const next = invites.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
    onChange(next);
  };

  const addRow = () => onChange([...invites, { email: "", role: "Analyst" }]);
  const removeRow = (i: number) => onChange(invites.filter((_, idx) => idx !== i));

  return (
    <TaskModalShell
      icon="group_add"
      title="Invite your team"
      onClose={onClose}
      onComplete={onComplete}
      completeLabel="Mark as done"
    >
      <p className="text-[13.5px] text-text-secondary mb-4">
        Invite your deal team. They&apos;ll see the same AI findings and can comment on any cell.
      </p>

      <div className="space-y-2 mb-3">
        {invites.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="email"
              value={row.email}
              onChange={(e) => updateRow(i, { email: e.target.value })}
              placeholder="teammate@firm.com"
              className="flex-1 px-3 py-2.5 text-[13px] rounded-lg border border-border-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
            />
            <select
              value={row.role}
              onChange={(e) => updateRow(i, { role: e.target.value })}
              className="w-32 px-3 py-2.5 text-[13px] rounded-lg border border-border-subtle focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none bg-white"
            >
              {TEAM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {invites.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="p-2 text-text-muted hover:text-red-500 transition-colors"
                aria-label="Remove invite"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="text-[13px] text-primary font-semibold flex items-center gap-1 hover:text-primary-hover"
      >
        <span className="material-symbols-outlined text-[16px]">add</span>
        Add another
      </button>
    </TaskModalShell>
  );
}
