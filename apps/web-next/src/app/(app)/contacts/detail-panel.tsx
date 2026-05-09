"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime, getInitials } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { useToast } from "@/providers/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Contact, Interaction, LinkedDeal, TYPE_CONFIG, SCORE_CONFIG,
  ContactFormData, ContactModal, DeleteConfirmModal,
} from "./components";
import { LinkDealModal, ConnectionModal } from "./detail-modals";

// ─── Config ───────────────────────────────────────────────

const INTERACTION_ICONS: Record<string, string> = {
  NOTE: "edit_note", MEETING: "groups", CALL: "call", EMAIL: "mail", OTHER: "more_horiz",
};

const STAGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  INITIAL_REVIEW: { bg: "bg-blue-50", text: "text-blue-700", label: "Initial Review" },
  DUE_DILIGENCE:  { bg: "bg-blue-50", text: "text-primary", label: "Due Diligence" },
  IOI_SUBMITTED:  { bg: "bg-amber-50", text: "text-amber-700", label: "IOI Submitted" },
  LOI_SUBMITTED:  { bg: "bg-purple-50", text: "text-purple-700", label: "LOI Submitted" },
  NEGOTIATION:    { bg: "bg-orange-50", text: "text-orange-700", label: "Negotiation" },
  CLOSING:        { bg: "bg-teal-50", text: "text-teal-700", label: "Closing" },
  PASSED:         { bg: "bg-gray-100", text: "text-gray-600", label: "Passed" },
  CLOSED_WON:     { bg: "bg-green-50", text: "text-green-700", label: "Closed Won" },
  CLOSED_LOST:    { bg: "bg-red-50", text: "text-red-700", label: "Closed Lost" },
};

const RELATIONSHIP_TYPE_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string }> = {
  KNOWS:         { label: "Knows",         icon: "handshake",    bg: "bg-blue-100",    text: "text-blue-700" },
  REFERRED_BY:   { label: "Referred by",   icon: "share",        bg: "bg-purple-100",  text: "text-purple-700" },
  REPORTS_TO:    { label: "Reports to",    icon: "account_tree", bg: "bg-amber-100",   text: "text-amber-700" },
  COLLEAGUE:     { label: "Colleague",     icon: "group",        bg: "bg-emerald-100", text: "text-emerald-700" },
  INTRODUCED_BY: { label: "Introduced by", icon: "person_add",   bg: "bg-pink-100",    text: "text-pink-700" },
};

interface Connection {
  id: string;
  type: string;
  notes?: string;
  contact: { id: string; firstName: string; lastName: string; type: string; company?: string; title?: string };
}

// ─── Detail Panel ──────────────────────────────────────────

export function DetailPanel({
  contactId, contactScores, onClose, onRefresh,
}: {
  contactId: string;
  contactScores: Record<string, { score: number; label: string }>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [linkDealOpen, setLinkDealOpen] = useState(false);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [unlinkDealId, setUnlinkDealId] = useState<string | null>(null);
  const [removeConnectionId, setRemoveConnectionId] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadContact = useCallback(async () => {
    try {
      const data = await api.get<Contact>(`/contacts/${contactId}`);
      setContact(data);
    } catch (err) {
      console.warn("[contacts] loadContact failed:", err);
    }
    setLoading(false);
  }, [contactId]);

  const loadConnections = useCallback(async () => {
    try {
      const data = await api.get<{ connections: Connection[] }>(`/contacts/${contactId}/connections`);
      setConnections(data.connections || []);
    } catch (err) {
      console.warn("[contacts] loadConnections failed:", err);
      setConnections([]);
    }
  }, [contactId]);

  useEffect(() => { loadContact(); loadConnections(); }, [loadContact, loadConnections]);

  async function handleSaveContact(formData: ContactFormData) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...formData };
      Object.keys(body).forEach((k) => { if (body[k] === "" || body[k] === undefined) delete body[k]; });
      if (formData.tags.length > 0) body.tags = formData.tags; else delete body.tags;
      await api.patch(`/contacts/${contactId}`, body);
      setEditModalOpen(false);
      await loadContact();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save contact", "error");
    }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try {
      await api.delete(`/contacts/${contactId}`);
      setDeleteConfirmOpen(false);
      onClose();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete contact", "error");
    }
  }

  async function performUnlinkDeal(dealId: string) {
    try {
      await api.delete(`/contacts/${contactId}/deals/${dealId}`);
      await loadContact();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to unlink deal", "error");
    } finally {
      setUnlinkDealId(null);
    }
  }

  async function performDeleteConnection(connectionId: string) {
    try {
      await api.delete(`/contacts/${contactId}/connections/${connectionId}`);
      await loadConnections();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove connection", "error");
    } finally {
      setRemoveConnectionId(null);
    }
  }

  if (loading) {
    return (
      <>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
        <div className="fixed top-0 right-0 h-full w-[450px] max-w-full bg-surface-card shadow-2xl z-50 flex flex-col border-l border-border-subtle">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 className="text-lg font-bold text-text-main">Contact Details</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted"><span className="material-symbols-outlined text-[20px]">close</span></button>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center"><span className="material-symbols-outlined text-primary text-3xl animate-spin mb-3">sync</span><p className="text-text-muted text-sm">Loading contact details...</p></div>
          </div>
        </div>
      </>
    );
  }

  if (!contact) return null;
  const tc = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
  const sortedInteractions = [...(contact.interactions || [])].sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  const tags = contact.tags || [];
  const linkedDeals = contact.linkedDeals || [];
  const scoreData = contactScores[contact.id];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[450px] max-w-full bg-surface-card shadow-2xl z-50 flex flex-col border-l border-border-subtle">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-bold text-text-main">Contact Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted hover:text-text-main transition-colors"><span className="material-symbols-outlined text-[20px]">close</span></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {/* Avatar + Name */}
          <div className="flex items-start gap-4 mb-6">
            <div className="size-14 rounded-full flex items-center justify-center shrink-0 text-lg font-bold shadow-sm" style={{ backgroundColor: tc.avatarBg, color: tc.avatarText }}>
              {getInitials(contact.firstName, contact.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-text-main leading-tight">{contact.firstName} {contact.lastName}</h3>
              {contact.title && <p className="text-text-secondary text-sm mt-0.5">{contact.title}</p>}
              {contact.company && <p className="text-text-muted text-sm flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[14px]">business</span>{contact.company}</p>}
              <span className={cn("inline-block mt-2 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider", tc.bg, tc.text)}>{tc.label}</span>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mb-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Contact Information</h4>
            <div className="flex flex-col gap-2">
              {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50"><span className="material-symbols-outlined text-[18px] text-text-muted">mail</span>{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50"><span className="material-symbols-outlined text-[18px] text-text-muted">call</span>{contact.phone}</a>}
              {contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm text-text-secondary hover:text-primary transition-colors p-2 rounded-lg hover:bg-primary-light/50"><span className="material-symbols-outlined text-[18px] text-text-muted">open_in_new</span>LinkedIn Profile</a>}
              {!contact.email && !contact.phone && !contact.linkedinUrl && <p className="text-text-muted text-sm italic p-2">No contact information added</p>}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Tags</h4>
              <div className="flex flex-wrap gap-1.5">{tags.map((t, i) => <span key={i} className="px-2.5 py-1 rounded-full bg-gray-50 text-text-secondary text-xs font-medium border border-border-subtle">{t}</span>)}</div>
            </div>
          )}

          {/* Connections */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">Connections</h4>
              <button onClick={() => setConnectionModalOpen(true)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary-light transition-colors">
                <span className="material-symbols-outlined text-[14px]">add</span> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {connections.length === 0 ? <p className="text-text-muted text-sm italic">No connections yet</p> : connections.map((conn) => {
                const c = conn.contact || {} as Connection["contact"];
                const rtc = RELATIONSHIP_TYPE_CONFIG[conn.type] || { label: conn.type, icon: "link", bg: "bg-gray-100", text: "text-gray-700" };
                const ctc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
                return (
                  <div key={conn.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border-subtle hover:border-primary/30 hover:bg-primary-light/30 transition-all group">
                    <div className="size-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ backgroundColor: ctc.avatarBg, color: ctc.avatarText }}>{getInitials(c.firstName, c.lastName)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-main truncate group-hover:text-primary">{c.firstName} {c.lastName}</p>
                      <p className="text-[10px] text-text-muted truncate">{c.company || ""}{c.title ? " \u00B7 " + c.title : ""}</p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0", rtc.bg, rtc.text)}>{rtc.label}</span>
                    <button onClick={() => setRemoveConnectionId(conn.id)} className="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0" title="Remove">
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          {contact.notes && (
            <div className="mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Notes</h4>
              <div className="p-3 bg-gray-50 rounded-lg border border-border-subtle text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">{contact.notes}</div>
            </div>
          )}

          {/* Linked Deals */}
          <div className="mb-6">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Linked Deals <span className="text-text-muted">({linkedDeals.length})</span></h4>
            {linkedDeals.length === 0 ? <p className="text-text-muted text-sm italic">No linked deals</p> : (
              <div className="flex flex-col gap-2">
                {linkedDeals.map((d) => {
                  const deal = d.deal || {} as LinkedDeal["deal"];
                  const dealId = deal.id || d.dealId;
                  const ss = STAGE_STYLES[deal.stage] || { bg: "bg-gray-100", text: "text-gray-600", label: deal.stage };
                  return (
                    <div key={dealId} className="flex items-center justify-between p-3 rounded-lg border border-border-subtle hover:border-primary/30 hover:bg-primary-light/30 transition-all group">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <span className="material-symbols-outlined text-text-muted text-[18px] group-hover:text-primary">work</span>
                        <span className="text-sm font-medium text-text-main group-hover:text-primary truncate">{deal.name}</span>
                        {deal.stage && <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0", ss.bg, ss.text)}>{ss.label}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {d.role && <span className="text-[10px] text-text-muted">{d.role}</span>}
                        <button onClick={() => setUnlinkDealId(dealId)} className="p-1 rounded hover:bg-red-50 text-text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Unlink deal">
                          <span className="material-symbols-outlined text-[16px]">link_off</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Interaction Stats */}
          {sortedInteractions.length > 0 && <InteractionStats interactions={sortedInteractions} scoreData={scoreData} />}

          {/* Add Interaction Form */}
          {showInteractionForm && <AddInteractionForm contactId={contactId} onDone={() => { setShowInteractionForm(false); loadContact(); onRefresh(); }} onCancel={() => setShowInteractionForm(false)} />}

          {/* Interaction Timeline */}
          <div className="mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Interaction Timeline <span className="text-text-muted">({sortedInteractions.length})</span></h4>
            {sortedInteractions.length === 0 ? <p className="text-text-muted text-sm italic">No interactions recorded</p> : (
              <div className="flex flex-col gap-0">
                {sortedInteractions.map((inter, idx) => {
                  const icon = INTERACTION_ICONS[inter.type] || INTERACTION_ICONS.OTHER;
                  const isLast = idx === sortedInteractions.length - 1;
                  return (
                    <div key={inter.id} className="flex gap-3 relative">
                      {!isLast && <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-border-subtle" />}
                      <div className="size-[30px] rounded-full bg-gray-50 border border-border-subtle flex items-center justify-center shrink-0 z-10">
                        <span className="material-symbols-outlined text-text-muted text-[16px]">{icon}</span>
                      </div>
                      <div className="flex-1 pb-4 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-text-main truncate">{inter.title || inter.type}</p>
                          <span className="text-[11px] text-text-muted shrink-0">{formatRelativeTime(inter.date || inter.createdAt)}</span>
                        </div>
                        {inter.notes && <p className="text-xs text-text-secondary mt-1 leading-relaxed">{inter.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        <div className="shrink-0 border-t border-border-subtle px-6 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowInteractionForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary-light/50 transition-all">
              <span className="material-symbols-outlined text-[16px]">edit_note</span>Add Note
            </button>
            <button onClick={() => setLinkDealOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary-light/50 transition-all">
              <span className="material-symbols-outlined text-[16px]">link</span>Link Deal
            </button>
            <button onClick={() => setEditModalOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-subtle text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:bg-primary-light/50 transition-all">
              <span className="material-symbols-outlined text-[16px]">edit</span>Edit
            </button>
            <button onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-all">
              <span className="material-symbols-outlined text-[16px]">delete</span>Delete
            </button>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {linkDealOpen && <LinkDealModal contactId={contactId} linkedDeals={linkedDeals} onClose={() => setLinkDealOpen(false)} onLinked={() => { setLinkDealOpen(false); loadContact(); onRefresh(); }} />}
      {connectionModalOpen && <ConnectionModal contactId={contactId} onClose={() => setConnectionModalOpen(false)} onCreated={() => { setConnectionModalOpen(false); loadConnections(); }} />}
      {editModalOpen && <ContactModal contact={contact} saving={saving} onSave={handleSaveContact} onClose={() => setEditModalOpen(false)} />}
      {deleteConfirmOpen && <DeleteConfirmModal onConfirm={handleDelete} onCancel={() => setDeleteConfirmOpen(false)} />}
      <ConfirmDialog
        open={unlinkDealId !== null}
        title="Unlink Deal"
        message="Remove this deal link?"
        confirmLabel="Unlink"
        variant="danger"
        onConfirm={() => unlinkDealId && performUnlinkDeal(unlinkDealId)}
        onCancel={() => setUnlinkDealId(null)}
      />
      <ConfirmDialog
        open={removeConnectionId !== null}
        title="Remove Connection"
        message="Remove this connection?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => removeConnectionId && performDeleteConnection(removeConnectionId)}
        onCancel={() => setRemoveConnectionId(null)}
      />
    </>
  );
}

// ─── Interaction Stats ─────────────────────────────────────

function InteractionStats({ interactions, scoreData }: { interactions: Interaction[]; scoreData?: { score: number; label: string } }) {
  const typeCounts: Record<string, number> = { NOTE: 0, MEETING: 0, CALL: 0, EMAIL: 0, OTHER: 0 };
  for (const inter of interactions) typeCounts[inter.type] = (typeCounts[inter.type] || 0) + 1;
  const dates = interactions.map((i) => new Date(i.date || i.createdAt).getTime());
  const oldest = Math.min(...dates);
  const newest = Math.max(...dates);
  const monthSpan = Math.max(1, (newest - oldest) / (30 * 86400000));
  const avgPerMonth = (interactions.length / monthSpan).toFixed(1);

  return (
    <div className="mb-6">
      <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">Interaction Stats</h4>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="p-2.5 rounded-lg bg-gray-50 border border-border-subtle text-center">
          <p className="text-lg font-bold text-text-main">{interactions.length}</p>
          <p className="text-[10px] text-text-muted font-medium uppercase">Total</p>
        </div>
        <div className="p-2.5 rounded-lg bg-gray-50 border border-border-subtle text-center">
          <p className="text-lg font-bold text-text-main">~{avgPerMonth}</p>
          <p className="text-[10px] text-text-muted font-medium uppercase">Per Month</p>
        </div>
        {scoreData ? (() => {
          const sc = SCORE_CONFIG[scoreData.label] || SCORE_CONFIG.Cold;
          return (
            <div className={cn("p-2.5 rounded-lg border border-border-subtle text-center", sc.bg)}>
              <p className={cn("text-lg font-bold", sc.text)}>{scoreData.score}</p>
              <p className={cn("text-[10px] font-medium uppercase", sc.text)}>{scoreData.label}</p>
            </div>
          );
        })() : (
          <div className="p-2.5 rounded-lg bg-gray-50 border border-border-subtle text-center">
            <p className="text-lg font-bold text-text-muted">--</p>
            <p className="text-[10px] text-text-muted font-medium uppercase">Score</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(typeCounts).filter(([, c]) => c > 0).map(([type, count]) => {
          const icon = INTERACTION_ICONS[type] || INTERACTION_ICONS.OTHER;
          return (
            <span key={type} className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 border border-border-subtle text-[11px] text-text-secondary font-medium">
              <span className="material-symbols-outlined text-[14px]">{icon}</span> {count} {type.charAt(0) + type.slice(1).toLowerCase()}{count !== 1 ? "s" : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Add Interaction Form ──────────────────────────────────

function AddInteractionForm({ contactId, onDone, onCancel }: { contactId: string; onDone: () => void; onCancel: () => void }) {
  const [type, setType] = useState("NOTE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { showToast } = useToast();

  async function handleSubmit() {
    if (!title.trim() && !description.trim()) {
      setFormError("Please enter a title or description.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string> = { type };
      if (title.trim()) body.title = title.trim();
      if (description.trim()) body.description = description.trim();
      if (date) body.date = date;
      await api.post(`/contacts/${contactId}/interactions`, body);
      onDone();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add interaction", "error");
    }
    finally { setSubmitting(false); }
  }

  const inputCls = "w-full rounded-md border border-border-subtle bg-white px-2.5 py-1.5 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="mb-4 p-4 rounded-lg border border-primary/20 bg-blue-50/20">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-sm font-semibold text-text-main">New Interaction</h5>
        <button onClick={onCancel} className="p-1 rounded hover:bg-white text-text-muted hover:text-text-main transition-colors"><span className="material-symbols-outlined text-[16px]">close</span></button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
              <option value="NOTE">Note</option><option value="MEETING">Meeting</option>
              <option value="CALL">Call</option><option value="EMAIL">Email</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief summary..." className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Details about this interaction..." className={cn(inputCls, "resize-none")} />
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="self-end px-4 py-1.5 rounded-md text-white text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: "#003366" }}>
          <span className="material-symbols-outlined text-[16px]">save</span>{submitting ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

