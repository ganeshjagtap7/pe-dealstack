"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";
import { DealOptions, UserOptions, INPUT_CLS, LABEL_CLS, type SharedProps } from "./form-primitives";

export function AssignDealModal({
  open,
  onClose,
  deals,
  users,
  onToast,
  onAssigned,
}: SharedProps & { onAssigned: () => void }) {
  const [dealId, setDealId] = useState("");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"lead" | "analyst">("analyst");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setDealId("");
      setUserId("");
      setRole("analyst");
    }
  }, [open]);

  const submit = async () => {
    if (!dealId || !userId) {
      onToast("Please select both a deal and a team member", "error");
      return;
    }
    setSaving(true);
    try {
      // UI uses "lead" / "analyst" but the API expects LEAD / MEMBER / VIEWER.
      const apiRole = role === "lead" ? "LEAD" : "MEMBER";
      await api.post(`/deals/${dealId}/team`, { userId, role: apiRole });
      onToast("Deal assigned successfully", "success");
      onClose();
      onAssigned();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to assign deal", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Deal to Analyst"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Assigning..." : "Assign Deal"}
          </button>
        </>
      }
    >
      <div>
        <label className={LABEL_CLS}>Select Deal</label>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={INPUT_CLS}>
          <DealOptions deals={deals} />
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Assign To</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={INPUT_CLS}>
          <UserOptions users={users} />
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Role</label>
        <div className="flex gap-3">
          {(["lead", "analyst"] as const).map((r) => (
            <label
              key={r}
              className={`flex-1 flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                role === r
                  ? "border-primary bg-primary-light"
                  : "border-border-subtle hover:border-primary/50"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium">
                {r === "lead" ? "Lead Partner" : "Analyst"}
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
