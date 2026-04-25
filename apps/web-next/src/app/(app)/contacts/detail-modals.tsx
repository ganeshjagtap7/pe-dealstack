"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { LinkedDeal, TYPE_CONFIG } from "./components";

// ─── Config ───────────────────────────────────────────────

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

// ─── Link Deal Modal ───────────────────────────────────────

export function LinkDealModal({ contactId, linkedDeals, onClose, onLinked }: { contactId: string; linkedDeals: LinkedDeal[]; onClose: () => void; onLinked: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; stage: string; industry?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedDealName, setSelectedDealName] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: query, limit: "20" });
        const data = await api.get<{ deals: typeof results } | typeof results>(`/deals?${params}`);
        const all = Array.isArray(data) ? data : ((data as { deals: typeof results }).deals || []);
        const linkedIds = new Set(linkedDeals.map((d) => (d.deal || d).id || d.dealId));
        setResults(all.filter((d) => !linkedIds.has(d.id)));
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, linkedDeals]);

  async function handleSubmit() {
    if (!selectedDealId) return;
    try {
      const body: Record<string, string> = { dealId: selectedDealId };
      if (role) body.role = role;
      await api.post(`/contacts/${contactId}/deals`, body);
      onLinked();
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to link deal"); }
  }

  const inputCls = "w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h3 className="text-lg font-bold text-text-main">Link Deal</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted"><span className="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div className="p-4 border-b border-border-subtle shrink-0">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><span className="material-symbols-outlined text-text-muted group-focus-within:text-primary transition-colors text-[18px]">search</span></div>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals..." className="block w-full rounded-lg border border-border-subtle bg-background-body py-2 pl-10 pr-4 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all" autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {searching ? <div className="flex items-center justify-center py-6"><span className="material-symbols-outlined text-primary animate-spin text-xl">sync</span></div>
          : results.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-text-muted text-sm"><span className="material-symbols-outlined text-3xl mb-2 opacity-40">{query.length >= 2 ? "search_off" : "search"}</span>{query.length >= 2 ? "No matching deals found" : "Type to search for deals..."}</div>
          : results.map((deal) => {
            const ss = STAGE_STYLES[deal.stage] || { bg: "bg-gray-100", text: "text-gray-600", label: deal.stage || "Unknown" };
            return (
              <button key={deal.id} onClick={() => { setSelectedDealId(deal.id); setSelectedDealName(deal.name || "Unnamed Deal"); }}
                className={cn("w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary-light/50 transition-colors", selectedDealId === deal.id && "bg-primary-light/50 ring-1 ring-primary/30")}>
                <span className="material-symbols-outlined text-text-muted text-[20px]">work</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{deal.name || "Unnamed Deal"}</p>
                  {deal.industry && <p className="text-xs text-text-muted">{deal.industry}</p>}
                </div>
                <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0", ss.bg, ss.text)}>{ss.label}</span>
              </button>
            );
          })}
        </div>
        {selectedDealId && (
          <div className="shrink-0 border-t border-border-subtle p-4">
            <div className="flex items-center gap-3 mb-3 p-3 bg-primary-light/50 rounded-lg border border-primary/10">
              <span className="material-symbols-outlined text-primary text-[20px]">work</span>
              <span className="text-sm font-medium text-text-main truncate">{selectedDealName}</span>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-text-main mb-1.5">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                <option value="">No specific role</option>
                <option value="Banker">Banker</option><option value="Advisor">Advisor</option>
                <option value="Board Member">Board Member</option><option value="Management">Management</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <button onClick={handleSubmit} className="w-full py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: "#003366" }}>
              <span className="material-symbols-outlined text-[18px]">link</span>Link Deal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Connection Modal ──────────────────────────────────────

export function ConnectionModal({ contactId, onClose, onCreated }: { contactId: string; onClose: () => void; onCreated: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; firstName: string; lastName: string; type: string; company?: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [connType, setConnType] = useState("KNOWS");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: query, limit: "20" });
        const data = await api.get<{ contacts: typeof results } | typeof results>(`/contacts?${params}`);
        const all = Array.isArray(data) ? data : ((data as { contacts: typeof results }).contacts || []);
        setResults(all.filter((c) => c.id !== contactId));
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, contactId]);

  async function handleSubmit() {
    if (!selectedId) return;
    try {
      await api.post(`/contacts/${contactId}/connections`, { relatedContactId: selectedId, type: connType, notes: notes.trim() || undefined });
      onCreated();
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to create connection"); }
  }

  const inputCls = "w-full rounded-lg border border-border-subtle bg-white px-3 py-2 text-sm text-text-main focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h3 className="text-lg font-bold text-text-main">Add Connection</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted"><span className="material-symbols-outlined text-[20px]">close</span></button>
        </div>
        <div className="p-4 border-b border-border-subtle shrink-0">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none"><span className="material-symbols-outlined text-text-muted group-focus-within:text-primary transition-colors text-[18px]">search</span></div>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts..." className="block w-full rounded-lg border border-border-subtle bg-background-body py-2 pl-10 pr-4 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all" autoFocus />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-[150px] max-h-[250px]">
          {searching ? <div className="flex items-center justify-center py-6"><span className="material-symbols-outlined text-primary animate-spin text-xl">sync</span></div>
          : results.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-text-muted text-sm"><span className="material-symbols-outlined text-3xl mb-2 opacity-40">{query.length >= 2 ? "search_off" : "search"}</span>{query.length >= 2 ? "No matching contacts found" : "Type to search for contacts..."}</div>
          : results.map((c) => {
            const ctc = TYPE_CONFIG[c.type] || TYPE_CONFIG.OTHER;
            const name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
            return (
              <button key={c.id} onClick={() => { setSelectedId(c.id); setSelectedName(name); }}
                className={cn("w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-primary-light/50 transition-colors", selectedId === c.id && "bg-primary-light/50 ring-1 ring-primary/30")}>
                <div className="size-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style={{ backgroundColor: ctc.avatarBg, color: ctc.avatarText }}>{getInitials(c.firstName, c.lastName)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{name}</p>
                  <p className="text-xs text-text-muted truncate">{c.company ? c.company + " \u00B7 " : ""}{ctc.label}</p>
                </div>
              </button>
            );
          })}
        </div>
        {selectedId && (
          <div className="shrink-0 border-t border-border-subtle p-4">
            <div className="flex items-center gap-3 mb-3 p-3 bg-primary-light/50 rounded-lg border border-primary/10">
              <span className="material-symbols-outlined text-primary text-[20px]">person</span>
              <span className="text-sm font-medium text-text-main truncate">{selectedName}</span>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-text-main mb-1.5">Relationship Type</label>
              <select value={connType} onChange={(e) => setConnType(e.target.value)} className={inputCls}>
                <option value="KNOWS">Knows</option><option value="REFERRED_BY">Referred by</option>
                <option value="REPORTS_TO">Reports to</option><option value="COLLEAGUE">Colleague</option>
                <option value="INTRODUCED_BY">Introduced by</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium text-text-main mb-1.5">Notes <span className="text-text-muted font-normal">(optional)</span></label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How do they know each other?" className={inputCls} />
            </div>
            <button onClick={handleSubmit} className="w-full py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-colors flex items-center justify-center gap-2" style={{ backgroundColor: "#003366" }}>
              <span className="material-symbols-outlined text-[18px]">link</span>Add Connection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
