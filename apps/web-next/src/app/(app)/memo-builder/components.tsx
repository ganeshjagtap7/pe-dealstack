"use client";

import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MemoSection {
  id: string;
  type: string;
  title: string;
  sortOrder: number;
  aiGenerated: boolean;
  content: string;
}

export interface Memo {
  id: string;
  title: string;
  projectName: string;
  type: string;
  status: string;
  updatedAt: string;
  sponsor?: string;
  dealId?: string;
  sections?: MemoSection[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface DealOption {
  id: string;
  name: string;
}

export interface TemplateOption {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const STATUS_FILTERS = ["ALL", "DRAFT", "REVIEW", "FINAL"] as const;

export const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-amber-50", text: "text-amber-700" },
  REVIEW: { bg: "bg-blue-50", text: "text-blue-700" },
  FINAL: { bg: "bg-green-50", text: "text-green-700" },
};

export const SECTION_TYPES = [
  { value: "EXECUTIVE_SUMMARY", label: "Executive Summary" },
  { value: "COMPANY_OVERVIEW", label: "Company Overview" },
  { value: "FINANCIAL_PERFORMANCE", label: "Financial Performance" },
  { value: "MARKET_DYNAMICS", label: "Market Dynamics" },
  { value: "RISK_ASSESSMENT", label: "Risk Assessment" },
  { value: "DEAL_STRUCTURE", label: "Deal Structure" },
  { value: "VALUE_CREATION", label: "Value Creation" },
  { value: "RECOMMENDATION", label: "Recommendation" },
  { value: "CUSTOM", label: "Custom" },
];

/* ------------------------------------------------------------------ */
/*  MemoListSidebar                                                    */
/* ------------------------------------------------------------------ */

interface MemoListSidebarProps {
  memos: Memo[];
  selectedMemoId: string | undefined;
  loadingList: boolean;
  listSearch: string;
  setListSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  onSelectMemo: (id: string) => void;
  onCreateNew: () => void;
  filteredMemos: Memo[];
}

export function MemoListSidebar({
  selectedMemoId,
  loadingList,
  listSearch,
  setListSearch,
  statusFilter,
  setStatusFilter,
  onSelectMemo,
  onCreateNew,
  filteredMemos,
}: MemoListSidebarProps) {
  return (
    <div className="hidden lg:flex w-64 shrink-0 border-r border-border-subtle bg-surface-card flex-col overflow-hidden">
      {/* Sidebar header */}
      <div className="p-4 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-text-main">AI Reports</h2>
          <button
            onClick={onCreateNew}
            className="h-7 w-7 rounded-md flex items-center justify-center text-white hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#003366" }}
            title="New Memo"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
            <span className="material-symbols-outlined text-text-muted text-[16px]">search</span>
          </div>
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className="block w-full rounded-md border border-border-subtle bg-background-body py-1.5 pl-8 pr-3 text-xs text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
            placeholder="Search memos..."
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                statusFilter === s
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text-main hover:bg-background-body"
              )}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Memo list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loadingList ? (
          <div className="flex items-center justify-center py-12">
            <span className="material-symbols-outlined text-2xl text-text-muted animate-spin">progress_activity</span>
          </div>
        ) : filteredMemos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <span className="material-symbols-outlined text-3xl text-text-muted mb-2">description</span>
            <p className="text-xs font-medium text-text-main mb-1">No memos found</p>
            <p className="text-[11px] text-text-muted mb-3">Create your first investment memo.</p>
            <button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#003366" }}
            >
              <span className="material-symbols-outlined text-[14px]">add</span>
              New Memo
            </button>
          </div>
        ) : (
          filteredMemos.map((memo) => {
            const isSelected = selectedMemoId === memo.id;
            const style = STATUS_STYLES[memo.status] || STATUS_STYLES.DRAFT;
            return (
              <button
                key={memo.id}
                onClick={() => onSelectMemo(memo.id)}
                className={cn(
                  "w-full text-left p-3 border-b border-border-subtle transition-colors",
                  isSelected ? "bg-blue-50 border-l-2 border-l-primary" : "hover:bg-background-body"
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-medium text-text-main truncate pr-2">
                    {memo.projectName || memo.title}
                  </p>
                  <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium", style.bg, style.text)}>
                    {memo.status}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted truncate">{memo.title}</p>
                <p className="text-[10px] text-text-muted mt-1">{formatRelativeTime(memo.updatedAt)}</p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// MemoEditor, MemoChat, and MemoChatCollapsed live in editor.tsx.
// MemoOutlineSidebar (document outline + template/compliance cards) in outline-sidebar.tsx.
export { MemoEditor, MemoChat, MemoChatCollapsed } from "./editor";
export type { MemoEditorProps } from "./editor";
export { MemoOutlineSidebar } from "./outline-sidebar";

/* ------------------------------------------------------------------ */
/*  CreateMemoModal                                                    */
/* ------------------------------------------------------------------ */

interface CreateMemoModalProps {
  showCreate: boolean;
  onClose: () => void;
  deals: DealOption[];
  templates: TemplateOption[];
  createForm: { dealId: string; templateId: string; title: string };
  setCreateForm: (fn: (prev: { dealId: string; templateId: string; title: string }) => { dealId: string; templateId: string; title: string }) => void;
  creatingMemo: boolean;
  onCreate: () => void;
}

export function CreateMemoModal({
  showCreate,
  onClose,
  deals,
  templates,
  createForm,
  setCreateForm,
  creatingMemo,
  onCreate,
}: CreateMemoModalProps) {
  if (!showCreate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface-card rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-main">Create New Memo</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">Title</label>
            <input
              type="text"
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder="Investment Committee Memo"
            />
          </div>

          {/* Deal */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">Deal (optional)</label>
            <select
              value={createForm.dealId}
              onChange={(e) => setCreateForm((f) => ({ ...f, dealId: e.target.value }))}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">No deal selected</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">Template (optional)</label>
            <select
              value={createForm.templateId}
              onChange={(e) => setCreateForm((f) => ({ ...f, templateId: e.target.value }))}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">Blank memo</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-background-body transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!createForm.title.trim() || creatingMemo}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#003366" }}
          >
            {creatingMemo && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
            Create Memo
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AddSectionModal                                                    */
/* ------------------------------------------------------------------ */

interface AddSectionModalProps {
  open: boolean;
  onClose: () => void;
  sectionType: string;
  setSectionType: (v: string) => void;
  sectionTitle: string;
  setSectionTitle: (v: string) => void;
  generateAI: boolean;
  setGenerateAI: (v: boolean) => void;
  loading: boolean;
  onAdd: () => void;
}

export function AddSectionModal({
  open,
  onClose,
  sectionType,
  setSectionType,
  sectionTitle,
  setSectionTitle,
  generateAI,
  setGenerateAI,
  loading,
  onAdd,
}: AddSectionModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface-card rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-text-main">Add Section</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">Section Type</label>
            <select
              value={sectionType}
              onChange={(e) => {
                setSectionType(e.target.value);
                if (e.target.value !== "CUSTOM") {
                  setSectionTitle(SECTION_TYPES.find((t) => t.value === e.target.value)?.label || "");
                }
              }}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary"
            >
              {SECTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-main mb-1">Title</label>
            <input
              type="text"
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              placeholder={SECTION_TYPES.find((t) => t.value === sectionType)?.label || "Section title"}
              className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={generateAI}
              onChange={(e) => setGenerateAI(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-text-secondary">Generate content with AI</span>
          </label>
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-background-body transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAdd}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: "#003366" }}
          >
            {loading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
            Add Section
          </button>
        </div>
      </div>
    </div>
  );
}
