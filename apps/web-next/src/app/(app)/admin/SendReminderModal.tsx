"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Modal } from "./Modal";
import { UserOptions, INPUT_CLS, LABEL_CLS, type SharedProps } from "./form-primitives";

export function SendReminderModal({
  open,
  onClose,
  deals,
  users,
  onToast,
}: SharedProps) {
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [dealId, setDealId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setUserId("");
      setMessage("");
      setDealId("");
    }
  }, [open]);

  const submit = async () => {
    if (!userId) {
      onToast("Please select a team member", "error");
      return;
    }
    const msg = message.trim();
    if (!msg) {
      onToast("Please enter a reminder message", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/notifications", {
        userId,
        type: "SYSTEM",
        title: "Reminder from Admin",
        message: msg,
        dealId: dealId || undefined,
      });
      onToast("Reminder sent successfully", "success");
      onClose();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to send reminder", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Reminder"
      titleIcon={{ name: "notifications_active", className: "text-orange-500" }}
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
            className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Sending..." : "Send Reminder"}
          </button>
        </>
      }
    >
      <div>
        <label className={LABEL_CLS}>Send To</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={INPUT_CLS}>
          <UserOptions users={users} />
        </select>
      </div>
      <div>
        <label className={LABEL_CLS}>Message</label>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g., Please submit the IC memo by EOD..."
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
      <div>
        <label className={LABEL_CLS}>Related Deal (Optional)</label>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={INPUT_CLS}>
          <option value="">No deal</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
