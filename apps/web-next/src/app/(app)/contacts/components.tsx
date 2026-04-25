"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// ─── Shared Types & Constants ──────────────────────────────

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title?: string;
  type: string;
  notes: string;
  tags?: string[];
  linkedinUrl?: string;
  lastInteractionAt?: string;
  interactions?: Interaction[];
  linkedDeals?: LinkedDeal[];
  createdAt: string;
  updatedAt: string;
}

export interface Interaction {
  id: string;
  type: string;
  title: string;
  notes?: string;
  date: string;
  createdAt: string;
  Contact?: { id: string; firstName: string; lastName: string; type: string; company?: string };
}

export interface LinkedDeal {
  dealId: string;
  role?: string;
  deal: { id: string; name: string; stage: string };
}

export const CONTACT_TYPES = ["BANKER", "ADVISOR", "EXECUTIVE", "LP", "LEGAL", "OTHER"] as const;

export const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; avatarBg: string; avatarText: string }> = {
  BANKER:    { label: "Banker",    bg: "bg-blue-100",    text: "text-blue-700",    avatarBg: "#DBEAFE", avatarText: "#1D4ED8" },
  ADVISOR:   { label: "Advisor",   bg: "bg-purple-100",  text: "text-purple-700",  avatarBg: "#EDE9FE", avatarText: "#6D28D9" },
  EXECUTIVE: { label: "Executive", bg: "bg-emerald-100", text: "text-emerald-700", avatarBg: "#D1FAE5", avatarText: "#047857" },
  LP:        { label: "LP",        bg: "bg-amber-100",   text: "text-amber-700",   avatarBg: "#FEF3C7", avatarText: "#B45309" },
  LEGAL:     { label: "Legal",     bg: "bg-slate-100",   text: "text-slate-700",   avatarBg: "#F1F5F9", avatarText: "#334155" },
  OTHER:     { label: "Other",     bg: "bg-gray-100",    text: "text-gray-700",    avatarBg: "#F3F4F6", avatarText: "#374151" },
};

export const SCORE_CONFIG: Record<string, { bg: string; text: string; dot: string; icon: string }> = {
  Cold:   { bg: "bg-gray-100",    text: "text-gray-600",    dot: "bg-gray-400",    icon: "ac_unit" },
  Warm:   { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500",   icon: "sunny" },
  Hot:    { bg: "bg-red-100",     text: "text-red-700",     dot: "bg-red-500",     icon: "local_fire_department" },
  Active: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", icon: "bolt" },
  Strong: { bg: "bg-green-100",   text: "text-green-800",   dot: "bg-green-600",   icon: "star" },
};

// Imported from shared formatters and re-exported for contacts/page.tsx
import { getInitials } from "@/lib/formatters";
export { getInitials };

export function getRelationshipLabel(score: number | null | undefined): string {
  if (!score && score !== 0) return "Cold";
  if (score >= 75) return "Strong";
  if (score >= 50) return "Active";
  if (score >= 25) return "Warm";
  return "Cold";
}

// ─── Contact Modal ─────────────────────────────────────────

export interface ContactFormData {
  firstName: string; lastName: string; email: string; phone: string;
  title: string; company: string; type: string; linkedinUrl: string;
  tags: string[]; notes: string;
}

export function ContactModal({
  contact, saving, onSave, onClose,
}: {
  contact: Contact | null;
  saving: boolean;
  onSave: (data: ContactFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    firstName: contact?.firstName || "", lastName: contact?.lastName || "",
    email: contact?.email || "", phone: contact?.phone || "",
    title: contact?.title || "", company: contact?.company || "",
    type: contact?.type || "", linkedinUrl: contact?.linkedinUrl || "",
    tagsRaw: (contact?.tags || []).join(", "), notes: contact?.notes || "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim()) return;
    const tags = form.tagsRaw ? form.tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    let linkedinUrl = form.linkedinUrl.trim();
    if (linkedinUrl && !linkedinUrl.startsWith("http")) linkedinUrl = "https://" + linkedinUrl;
    onSave({ firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, title: form.title, company: form.company, type: form.type, linkedinUrl, tags, notes: form.notes });
  }

  const inputCls = "w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle sticky top-0 bg-surface-card z-10">
          <h3 className="text-lg font-bold text-text-main">{contact ? "Edit Contact" : "Add Contact"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">First Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} placeholder="John" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Last Name <span className="text-red-500">*</span></label>
              <input type="text" required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} placeholder="Doe" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} placeholder="john@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+1 (555) 123-4567" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Title</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Managing Director" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Company</label>
              <input type="text" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} className={inputCls} placeholder="Goldman Sachs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">Type <span className="text-red-500">*</span></label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls} required>
                <option value="">Select type...</option>
                {CONTACT_TYPES.map((t) => <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1.5">LinkedIn URL</label>
              <input type="text" value={form.linkedinUrl} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} className={inputCls} placeholder="https://linkedin.com/in/..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5">Tags <span className="text-text-muted font-normal">(comma-separated)</span></label>
            <input type="text" value={form.tagsRaw} onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))} className={inputCls} placeholder="healthcare, m&a, midwest" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className={cn(inputCls, "resize-none")} placeholder="Any additional notes about this contact..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border-subtle text-text-secondary text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving || !form.firstName.trim()} className="px-5 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-2" style={{ backgroundColor: "#003366" }}>
              <span>{saving ? "Saving..." : contact ? "Update Contact" : "Save Contact"}</span>
              {saving && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ─────────────────────────────

export function DeleteConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-surface-card rounded-xl shadow-lg p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-full bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 text-[20px]">warning</span>
          </div>
          <div>
            <h3 className="font-semibold text-text-main">Delete Contact</h3>
            <p className="text-sm text-text-muted">This action cannot be undone.</p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle text-text-secondary hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Insight Cards ─────────────────────────────────────────

// Sections hidden for now: Needs Attention, Recent Activity, Possible Duplicates, Network Stats
export function InsightCards(_props: { totalContacts: number }) {
  return null;
}

