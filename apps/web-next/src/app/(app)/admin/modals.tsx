"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/formatters";
import { Modal } from "./Modal";
import type { AdminDeal, AdminTeamMember } from "./types";

// ─── Shared form primitives ──────────────────────────────────────────

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-border-subtle rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none";
const LABEL_CLS = "block text-sm font-medium text-text-main mb-2";

function DealOptions({ deals }: { deals: AdminDeal[] }) {
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

function UserOptions({ users }: { users: AdminTeamMember[] }) {
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

interface SharedProps {
  open: boolean;
  onClose: () => void;
  deals: AdminDeal[];
  users: AdminTeamMember[];
  onToast: (msg: string, type: "success" | "error") => void;
}

// ─── Assign Deal Modal ───────────────────────────────────────────────

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

// ─── Create Task Modal ───────────────────────────────────────────────

export function CreateTaskModal({
  open,
  onClose,
  deals,
  users,
  onToast,
  onCreated,
}: SharedProps & { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [userId, setUserId] = useState("");
  const [dealId, setDealId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setUserId("");
      setDealId("");
      setDueDate("");
      setPriority("MEDIUM");
      setDescription("");
    }
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      onToast("Please enter a task title", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/tasks", {
        title: t,
        assignedTo: userId || undefined,
        dealId: dealId || undefined,
        dueDate: dueDate || undefined,
        priority,
        description: description.trim() || undefined,
      });
      onToast("Task created successfully", "success");
      onClose();
      onCreated();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to create task", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create New Task"
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
            {saving ? "Creating..." : "Create Task"}
          </button>
        </>
      }
    >
      <div>
        <label className={LABEL_CLS}>Task Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter task title..."
          className={INPUT_CLS}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Assign To</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={INPUT_CLS}>
            <UserOptions users={users} />
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Related Deal</label>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={INPUT_CLS}>
            <DealOptions deals={deals} />
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Description (Optional)</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add task details..."
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
    </Modal>
  );
}

// ─── Schedule Review Modal ───────────────────────────────────────────

export function ScheduleReviewModal({
  open,
  onClose,
  deals,
  users,
  onToast,
  onScheduled,
}: SharedProps & { onScheduled: () => void }) {
  const [title, setTitle] = useState("");
  const [dealId, setDealId] = useState("");
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setDate(tomorrow.toISOString().split("T")[0]);
    } else {
      setTitle("");
      setDealId("");
      setUserId("");
      setDate("");
      setPriority("MEDIUM");
      setNotes("");
    }
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t) {
      onToast("Please enter a review title", "error");
      return;
    }
    if (!date) {
      onToast("Please select a review date", "error");
      return;
    }
    setSaving(true);
    try {
      // Vanilla represents reviews as tasks with a "[Review]" prefix so the
      // Upcoming Reviews card can filter them back out.
      await api.post("/tasks", {
        title: `[Review] ${t}`,
        assignedTo: userId || undefined,
        dealId: dealId || undefined,
        dueDate: date,
        priority,
        description: notes.trim() ? `Review Notes: ${notes.trim()}` : undefined,
      });
      onToast("Review scheduled successfully", "success");
      onClose();
      onScheduled();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to schedule review", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule Review"
      titleIcon={{ name: "calendar_month" }}
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
            {saving ? "Scheduling..." : "Schedule Review"}
          </button>
        </>
      }
    >
      <div>
        <label className={LABEL_CLS}>Review Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., IC Meeting — TechCorp SaaS"
          className={INPUT_CLS}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Related Deal</label>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} className={INPUT_CLS}>
            <DealOptions deals={deals} />
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Review Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Reviewer</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={INPUT_CLS}>
            <UserOptions users={users} />
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={INPUT_CLS}
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>
      <div>
        <label className={LABEL_CLS}>Notes (Optional)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Review agenda or prep notes..."
          className={`${INPUT_CLS} resize-none`}
        />
      </div>
    </Modal>
  );
}

// ─── Send Reminder Modal ─────────────────────────────────────────────

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
