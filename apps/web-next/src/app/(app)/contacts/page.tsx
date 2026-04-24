"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import {
  Contact, ContactFormData, CONTACT_TYPES, TYPE_CONFIG, SCORE_CONFIG,
  getInitials, getRelationshipLabel,
  ContactModal, InsightCards,
} from "./components";
import { DetailPanel } from "./detail-panel";
import { CSVImportModal } from "./csv-import-modal";

// ─── Constants ─────────────────────────────────────────────

const PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { sortBy: "createdAt", sortOrder: "desc", label: "Newest First" },
  { sortBy: "createdAt", sortOrder: "asc",  label: "Oldest First" },
  { sortBy: "name",      sortOrder: "asc",  label: "Name A-Z" },
  { sortBy: "name",      sortOrder: "desc", label: "Name Z-A" },
  { sortBy: "company",   sortOrder: "asc",  label: "Company A-Z" },
  { sortBy: "lastContactedAt", sortOrder: "desc", label: "Last Contacted" },
];

// ─── Page Component ────────────────────────────────────────

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [contactScores, setContactScores] = useState<Record<string, { score: number; label: string }>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filters, setFilters] = useState({ search: "", type: "", sortBy: "createdAt", sortOrder: "desc" });
  const [currentOffset, setCurrentOffset] = useState(0);

  // Modal / panel state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [groupByCompany, setGroupByCompany] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Data Loading ─────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", "0");

      const [data, scores] = await Promise.all([
        api.get<{ contacts: Contact[]; total: number }>(`/contacts?${params}`),
        api.get<{ scores: Record<string, { score: number; label: string }> }>("/contacts/insights/scores").catch(() => ({ scores: {} })),
      ]);

      const fetched = data.contacts || [];
      setContacts(fetched);
      setTotalContacts(data.total || 0);
      setContactScores(scores.scores || {});
      setCurrentOffset(fetched.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => { setMoreOpen(false); setSortOpen(false); setTypeOpen(false); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (importModalOpen) { setImportModalOpen(false); return; }
        if (modalOpen) { setModalOpen(false); setEditingContact(null); return; }
        if (detailContactId) { setDetailContactId(null); return; }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [importModalOpen, modalOpen, detailContactId]);

  // ─── Load More ────────────────────────────────────────────

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(currentOffset));

      const data = await api.get<{ contacts: Contact[]; total: number }>(`/contacts?${params}`);
      const newContacts = data.contacts || [];
      setContacts((prev) => [...prev, ...newContacts]);
      setCurrentOffset((prev) => prev + newContacts.length);
    } catch (err) {
      console.error("Error loading more:", err);
    } finally {
      setLoadingMore(false);
    }
  }

  // ─── Handlers ─────────────────────────────────────────────

  function handleSearchChange(value: string) {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setFilters((f) => ({ ...f, search: value })), 300);
  }

  function openAddModal() { setEditingContact(null); setModalOpen(true); }

  async function handleSaveContact(formData: ContactFormData) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...formData };
      // Remove empty optional fields
      Object.keys(body).forEach((k) => { if (body[k] === "" || body[k] === undefined) delete body[k]; });
      if (formData.tags.length > 0) body.tags = formData.tags; else delete body.tags;

      if (editingContact) await api.patch(`/contacts/${editingContact.id}`, body);
      else await api.post("/contacts", body);
      setModalOpen(false); setEditingContact(null); loadContacts();
    } catch (err) { alert(err instanceof Error ? err.message : "Failed to save contact"); }
    finally { setSaving(false); }
  }

  async function handleExportCSV() {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      // Pass current filters to export (matches legacy behavior)
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.type) params.set("type", filters.type);
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);
      const res = await fetch(`/api/contacts/export?${params}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `contacts-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Failed to export contacts"); }
  }

  const currentSortLabel = SORT_OPTIONS.find((o) => o.sortBy === filters.sortBy && o.sortOrder === filters.sortOrder)?.label || "Newest First";

  // ─── Group by Company helper ──────────────────────────────

  function groupContacts(list: Contact[]): Record<string, Contact[]> {
    const groups: Record<string, Contact[]> = {};
    for (const c of list) {
      const key = (c.company || "").trim() || "No Company";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }

  const sortedGroupKeys = groupByCompany
    ? Object.keys(groupContacts(contacts)).sort((a, b) => {
        if (a === "No Company") return 1;
        if (b === "No Company") return -1;
        return groupContacts(contacts)[b].length - groupContacts(contacts)[a].length;
      })
    : [];

  const grouped = groupByCompany ? groupContacts(contacts) : {};
  const hasMore = contacts.length < totalContacts;
  const remaining = totalContacts - contacts.length;

  // ─── Render ───────────────────────────────────────────────

  function renderContactCard(contact: Contact) {
    const ts = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
    const sd = contactScores[contact.id];
    const scoreLabel = sd ? sd.label : getRelationshipLabel(undefined);
    const sc = SCORE_CONFIG[scoreLabel] || SCORE_CONFIG.Cold;
    // Filter out enriched: tags (matches legacy)
    const visibleTags = (contact.tags || []).filter((t) => !t.startsWith("enriched:"));
    const tags = visibleTags.slice(0, 4);
    const overflow = visibleTags.length - 4;
    const lastContacted = contact.lastInteractionAt ? `Contacted ${formatRelativeTime(contact.lastInteractionAt)}` : "Never contacted";
    const linkedDealsCount = contact.linkedDeals ? contact.linkedDeals.length : 0;

    return (
      <div key={contact.id} onClick={() => setDetailContactId(contact.id)} className="cursor-pointer">
        <article className="bg-surface-card rounded-lg border border-border-subtle p-5 hover:border-primary/30 transition-all flex flex-col h-full shadow-card hover:shadow-card-hover relative group">
          <div className="flex items-start gap-3.5 mb-4">
            <div className="size-11 rounded-full flex items-center justify-center shrink-0 text-sm font-bold shadow-sm" style={{ backgroundColor: ts.avatarBg, color: ts.avatarText }}>
              {getInitials(contact.firstName, contact.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-text-main font-bold text-[15px] leading-tight group-hover:text-primary transition-colors truncate">{contact.firstName} {contact.lastName}</h3>
              {contact.title && <p className="text-text-secondary text-xs mt-0.5 truncate">{contact.title}</p>}
            </div>
            <span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0", ts.bg, ts.text)}>{ts.label}</span>
          </div>
          {contact.company && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="material-symbols-outlined text-text-muted text-[16px]">business</span>
              <span className="text-sm text-text-secondary truncate">{contact.company}</span>
            </div>
          )}
          <div className="flex flex-col gap-1.5 mb-3">
            {contact.email && (
              <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors truncate">
                <span className="material-symbols-outlined text-[14px]">mail</span><span className="truncate">{contact.email}</span>
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[14px]">call</span>{contact.phone}
              </a>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {tags.map((t, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-gray-50 text-text-muted text-[10px] font-medium border border-border-subtle">{t}</span>)}
              {overflow > 0 && <span className="text-[10px] text-text-muted">+{overflow}</span>}
            </div>
          )}
          <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
            <span className="text-[11px] text-text-muted font-medium">{lastContacted}</span>
            <div className="flex items-center gap-2">
              {sd && <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold", sc.bg, sc.text)}><span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{sd.score}</span>}
              {linkedDealsCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-text-muted font-medium">
                  <span className="material-symbols-outlined text-[14px]">work</span>{linkedDealsCount}
                </span>
              )}
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderContactRow(contact: Contact) {
    const ts = TYPE_CONFIG[contact.type] || TYPE_CONFIG.OTHER;
    const sd = contactScores[contact.id];
    const scoreLabel = sd ? sd.label : "Cold";
    const sc = SCORE_CONFIG[scoreLabel] || SCORE_CONFIG.Cold;
    const lastContacted = contact.lastInteractionAt ? formatRelativeTime(contact.lastInteractionAt) : "--";

    return (
      <tr key={contact.id} onClick={() => setDetailContactId(contact.id)} className="hover:bg-slate-50/80 cursor-pointer transition-colors border-b border-border-subtle">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ backgroundColor: ts.avatarBg, color: ts.avatarText }}>{getInitials(contact.firstName, contact.lastName)}</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-main truncate">{contact.firstName} {contact.lastName}</p>
              {contact.title && <p className="text-xs text-text-muted truncate">{contact.title}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary truncate max-w-[180px]">{contact.company || "--"}</td>
        <td className="px-4 py-3"><span className={cn("px-2 py-0.5 rounded-md text-[10px] font-bold uppercase", ts.bg, ts.text)}>{ts.label}</span></td>
        <td className="px-4 py-3 text-sm text-text-muted truncate max-w-[200px]">{contact.email || "--"}</td>
        <td className="px-4 py-3 text-sm text-text-muted">{lastContacted}</td>
        <td className="px-4 py-3">{sd ? <span className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold", sc.bg, sc.text)}><span className={cn("w-1.5 h-1.5 rounded-full", sc.dot)} />{sd.score}</span> : <span className="text-text-muted text-xs">--</span>}</td>
      </tr>
    );
  }

  const thCls = "px-4 py-3 text-left text-[11px] font-bold text-text-muted uppercase tracking-wider";
  const tableHeaders = ["Name", "Company", "Type", "Email", "Last Contact", "Score"];
  const tableHead = <thead><tr className="border-b border-border-subtle bg-slate-50/50">{tableHeaders.map((h) => <th key={h} className={thCls}>{h}</th>)}</tr></thead>;

  return (
    <div className="p-4 md:p-6 mx-auto max-w-[1600px] w-full flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-main tracking-tight font-display">Contacts</h1>
            {!loading && <span className="px-2.5 py-0.5 rounded-full bg-primary-light text-primary text-xs font-bold">{totalContacts}</span>}
          </div>
          <p className="text-text-secondary text-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(5,150,105,0.4)]" />
            {loading ? "Loading contacts..." : `${totalContacts} contact${totalContacts !== 1 ? "s" : ""} in your network`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="material-symbols-outlined text-text-muted group-focus-within:text-primary transition-colors text-[18px]">search</span>
            </div>
            <input type="text" defaultValue={filters.search} onChange={(e) => handleSearchChange(e.target.value)}
              className="block w-64 rounded-lg border border-border-subtle bg-surface-card py-2 pl-10 pr-4 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm" placeholder="Search contacts..." />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setTypeOpen(!typeOpen); setSortOpen(false); setMoreOpen(false); }}
              className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-surface-card border border-border-subtle px-3.5 hover:border-primary/30 hover:shadow-sm transition-all group text-sm font-medium text-text-secondary">
              {filters.type ? TYPE_CONFIG[filters.type]?.label : "All Types"}
              <span className="material-symbols-outlined text-text-muted text-[16px]">keyboard_arrow_down</span>
            </button>
            {typeOpen && (
              <div className="absolute top-full left-0 mt-2 bg-surface-card border border-border-subtle rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                <button onClick={() => { setFilters((f) => ({ ...f, type: "" })); setTypeOpen(false); }} className={cn("w-full text-left px-4 py-2 text-sm hover:bg-primary-light", !filters.type && "font-medium")}>All Types</button>
                {CONTACT_TYPES.map((t) => (
                  <button key={t} onClick={() => { setFilters((f) => ({ ...f, type: t })); setTypeOpen(false); }} className={cn("w-full text-left px-4 py-2 text-sm hover:bg-primary-light", filters.type === t && "font-medium text-primary")}>{TYPE_CONFIG[t].label}</button>
                ))}
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setSortOpen(!sortOpen); setTypeOpen(false); setMoreOpen(false); }}
              className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-surface-card border border-border-subtle px-3.5 hover:border-primary/30 hover:shadow-sm transition-all group text-sm font-medium text-text-secondary">
              <span className="material-symbols-outlined text-text-muted text-[16px]">swap_vert</span>
              <span className="whitespace-nowrap">{currentSortLabel}</span>
              <span className="material-symbols-outlined text-text-muted text-[16px]">keyboard_arrow_down</span>
            </button>
            {sortOpen && (
              <div className="absolute top-full left-0 mt-2 bg-surface-card border border-border-subtle rounded-lg shadow-lg z-50 min-w-[200px] py-1">
                <div className="px-3 py-1.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Sort by</div>
                {SORT_OPTIONS.map((opt) => (
                  <button key={`${opt.sortBy}-${opt.sortOrder}`} onClick={() => { setFilters((f) => ({ ...f, sortBy: opt.sortBy, sortOrder: opt.sortOrder })); setSortOpen(false); }}
                    className={cn("w-full text-left px-4 py-2 text-sm hover:bg-primary-light flex items-center justify-between", filters.sortBy === opt.sortBy && filters.sortOrder === opt.sortOrder && "font-medium text-primary")}>
                    {opt.label}
                    {filters.sortBy === opt.sortBy && filters.sortOrder === opt.sortOrder && <span className="material-symbols-outlined text-primary text-[16px]">check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex h-9 rounded-lg border border-border-subtle overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={cn("flex items-center justify-center w-9 h-full transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "bg-surface-card text-text-muted hover:text-text-secondary")} title="Grid view">
              <span className="material-symbols-outlined text-[18px]">grid_view</span>
            </button>
            <button onClick={() => setViewMode("list")} className={cn("flex items-center justify-center w-9 h-full transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "bg-surface-card text-text-muted hover:text-text-secondary")} title="List view">
              <span className="material-symbols-outlined text-[18px]">view_list</span>
            </button>
          </div>

          {/* More Actions */}
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); setTypeOpen(false); setSortOpen(false); }}
              className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-surface-card border border-border-subtle px-3.5 hover:border-primary/30 hover:shadow-sm transition-all group text-sm font-medium text-text-secondary">
              <span className="material-symbols-outlined text-text-muted text-[16px]">more_horiz</span>
              <span className="group-hover:text-text-main">More</span>
              <span className="material-symbols-outlined text-text-muted text-[16px]">keyboard_arrow_down</span>
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-2 bg-surface-card border border-border-subtle rounded-lg shadow-lg z-50 min-w-[200px] py-1">
                <button onClick={() => { setGroupByCompany(!groupByCompany); setMoreOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-primary-light hover:text-text-main transition-colors">
                  <span className="material-symbols-outlined text-[18px]">corporate_fare</span>{groupByCompany ? "Ungroup Contacts" : "Group by Company"}
                </button>
                <button onClick={() => { handleExportCSV(); setMoreOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-primary-light hover:text-text-main transition-colors">
                  <span className="material-symbols-outlined text-[18px]">download</span>Export to CSV
                </button>
                <button onClick={() => { setImportModalOpen(true); setMoreOpen(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:bg-primary-light hover:text-text-main transition-colors">
                  <span className="material-symbols-outlined text-[18px]">upload_file</span>Import from CSV
                </button>
              </div>
            )}
          </div>

          {/* Add Contact */}
          <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm hover:bg-[#002855] transition-colors text-sm font-medium" style={{ backgroundColor: "#003366" }}>
            <span className="material-symbols-outlined text-[18px]">person_add</span>Add Contact
          </button>
        </div>
      </div>

      {/* Insight Cards */}
      {!loading && <InsightCards totalContacts={totalContacts} />}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-primary text-4xl animate-spin mb-4">sync</span>
          <p className="text-text-muted text-sm font-medium">Loading contacts...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
          <p className="text-text-main font-medium mb-2">Failed to load contacts</p>
          <p className="text-text-muted text-sm mb-4">{error}</p>
          <button onClick={loadContacts} className="px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors" style={{ backgroundColor: "#003366" }}>Try Again</button>
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          {filters.search || filters.type ? (
            <>
              <span className="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
              <p className="text-text-main font-medium mb-2">No contacts found</p>
              <p className="text-text-muted text-sm">Try adjusting your search or filters</p>
            </>
          ) : (
            <>
              <div className="size-16 rounded-full bg-blue-50/60 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-[#003366] text-3xl">groups</span>
              </div>
              <h3 className="text-base font-bold text-text-main mb-2">Start building your network</h3>
              <p className="text-text-muted text-sm mb-5 text-center max-w-xs">Add contacts to track relationships with bankers, advisors, executives, and LPs.</p>
              <button onClick={openAddModal} className="flex items-center gap-2 px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-medium" style={{ backgroundColor: "#003366" }}>
                <span className="material-symbols-outlined text-[18px]">person_add</span>Add Your First Contact
              </button>
            </>
          )}
        </div>
      ) : groupByCompany ? (
        <div className="flex flex-col gap-5">
          {sortedGroupKeys.map((company) => (
            <div key={company}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-text-muted text-[18px]">corporate_fare</span>
                  <h3 className="text-sm font-bold text-text-main">{company}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-text-muted text-[11px] font-bold">{grouped[company].length}</span>
                <div className="flex-1 border-t border-border-subtle" />
              </div>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{grouped[company].map(renderContactCard)}</div>
              ) : (
                <div className="bg-surface-card rounded-lg border border-border-subtle shadow-card overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[600px]">{tableHead}<tbody>{grouped[company].map(renderContactRow)}</tbody></table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{contacts.map(renderContactCard)}</div>
      ) : (
        <div className="bg-surface-card rounded-lg border border-border-subtle shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]">{tableHead}<tbody>{contacts.map(renderContactRow)}</tbody></table>
        </div>
      )}

      {/* Pagination Bar */}
      {!loading && totalContacts > 0 && (
        <div className="flex items-center justify-between py-4 pb-6">
          <p className="text-sm text-text-muted font-medium">
            Showing {Math.min(contacts.length, totalContacts)} of {totalContacts} contact{totalContacts !== 1 ? "s" : ""}
          </p>
          {hasMore && (
            <button onClick={handleLoadMore} disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-2 rounded-lg border border-border-subtle bg-surface-card text-sm font-medium text-text-secondary hover:border-primary/30 hover:text-primary hover:shadow-sm transition-all disabled:opacity-50">
              {loadingMore ? (
                <><span className="material-symbols-outlined text-[18px] animate-spin">sync</span>Loading...</>
              ) : (
                <><span className="material-symbols-outlined text-[18px]">expand_more</span>Load More ({remaining} remaining)</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Modals & Panels */}
      {modalOpen && <ContactModal contact={editingContact} saving={saving} onSave={handleSaveContact} onClose={() => { setModalOpen(false); setEditingContact(null); }} />}
      {detailContactId && <DetailPanel contactId={detailContactId} contactScores={contactScores} onClose={() => setDetailContactId(null)} onRefresh={loadContacts} />}
      {importModalOpen && <CSVImportModal onClose={() => setImportModalOpen(false)} onDone={loadContacts} />}
    </div>
  );
}
