"use client";

import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TableRow {
  metric: string;
  values: string[];
  isBold?: boolean;
  isSubMetric?: boolean;
  highlight?: string;
}

export interface TableData {
  headers: string[];
  rows: (TableRow | string[])[];
  footnote?: string;
}

export interface MemoSection {
  id: string;
  type: string;
  title: string;
  sortOrder: number;
  aiGenerated: boolean;
  content: string;
  tableData?: TableData | null;
  chartConfig?: Record<string, unknown> | null;
  hasTable?: boolean;
  hasChart?: boolean;
  hasPlaceholder?: boolean;
  placeholderText?: string;
  citations?: unknown[];
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
  DRAFT: { bg: "bg-amber-100", text: "text-amber-700" },
  REVIEW: { bg: "bg-blue-100", text: "text-blue-700" },
  FINAL: { bg: "bg-green-100", text: "text-green-700" },
  ARCHIVED: { bg: "bg-gray-100", text: "text-gray-500" },
};

export const SECTION_TYPES = [
  { value: "EXECUTIVE_SUMMARY", label: "Executive Summary" },
  { value: "COMPANY_OVERVIEW", label: "Company Overview" },
  { value: "FINANCIAL_PERFORMANCE", label: "Financial Performance" },
  { value: "MARKET_DYNAMICS", label: "Market Dynamics" },
  { value: "COMPETITIVE_LANDSCAPE", label: "Competitive Landscape" },
  { value: "RISK_ASSESSMENT", label: "Risk Assessment" },
  { value: "DEAL_STRUCTURE", label: "Deal Structure" },
  { value: "VALUE_CREATION", label: "Value Creation" },
  { value: "EXIT_STRATEGY", label: "Exit Strategy" },
  { value: "RECOMMENDATION", label: "Recommendation" },
  { value: "APPENDIX", label: "Appendix" },
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
  // Click opens the parent's delete-confirm dialog. The parent owns the
  // pending-delete state and the actual API call.
  onDelete: (memoId: string) => void;
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
  onDelete,
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
            className="block w-full rounded-md border border-border-subtle bg-background-body py-1.5 pl-8 pr-3 text-xs text-text-main placeholder-text-muted focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
            <div className="size-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
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
            // The row is a `div` (not `button`) so we can nest a real <button>
            // for the delete icon without producing invalid button-in-button
            // HTML. We mirror the row's button affordance with role/tabIndex
            // and onKeyDown handling so keyboard users get the same flow.
            return (
              <div
                key={memo.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectMemo(memo.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectMemo(memo.id);
                  }
                }}
                className={cn(
                  "group relative w-full text-left p-3 border-b border-border-subtle transition-colors cursor-pointer focus:outline-none focus:bg-background-body",
                  isSelected ? "bg-blue-50 border-l-2 border-l-primary" : "hover:bg-background-body"
                )}
              >
                <div className="flex items-start justify-between mb-1 pr-7">
                  <p className="text-sm font-medium text-text-main truncate pr-2">
                    {memo.projectName || memo.title}
                  </p>
                  <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase", style.bg, style.text)}>
                    {memo.status}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted truncate pr-7">{memo.title}</p>
                <p className="text-[10px] text-text-muted mt-1">{formatRelativeTime(memo.updatedAt)}</p>

                {/* Delete affordance — bottom-right, only visible on row
                    hover/focus. stopPropagation so clicking it doesn't also
                    select the memo. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(memo.id);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  aria-label={`Delete memo ${memo.projectName || memo.title}`}
                  title="Delete memo"
                  className="absolute bottom-2 right-2 size-6 rounded-md flex items-center justify-center text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// MemoEditor lives in editor.tsx; MemoChat/MemoChatCollapsed in chat.tsx.
// MemoOutlineSidebar (document outline + template/compliance cards) in outline-sidebar.tsx.
export { MemoEditor } from "./editor";
export type { MemoEditorProps } from "./editor";
export { MemoChat, MemoChatCollapsed } from "./chat";
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
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-slate-900">Create New Memo</h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-slate-500">close</span>
            </button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                placeholder="Investment Committee Memo"
              />
            </div>

            {/* Deal — required. Without a deal, "Generate All" can't pull
                financial / extraction context and will 400 on the backend. */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Deal <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.dealId}
                onChange={(e) => setCreateForm((f) => ({ ...f, dealId: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              >
                <option value="">Select a deal…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {!createForm.dealId && (
                <p className="mt-1 text-xs text-slate-500">
                  AI section generation reads the deal&apos;s financials and uploaded documents — pick the deal this memo is for.
                </p>
              )}
            </div>

            {/* Template */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Template (optional)</label>
              <select
                value={createForm.templateId}
                onChange={(e) => setCreateForm((f) => ({ ...f, templateId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              >
                <option value="">Blank memo</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!createForm.title.trim() || !createForm.dealId || creatingMemo}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Add New Section</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section Type</label>
              <select
                value={sectionType}
                onChange={(e) => {
                  setSectionType(e.target.value);
                  if (e.target.value !== "CUSTOM") {
                    setSectionTitle(SECTION_TYPES.find((t) => t.value === e.target.value)?.label || "");
                  }
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              >
                {SECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Section Title</label>
              <input
                type="text"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                placeholder="Enter section title"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-section-ai"
                checked={generateAI}
                onChange={(e) => setGenerateAI(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
              />
              <label htmlFor="new-section-ai" className="text-sm text-slate-700">Generate content with AI</label>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onAdd}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors disabled:opacity-50"
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
