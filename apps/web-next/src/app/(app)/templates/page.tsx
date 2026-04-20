"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TemplateSection {
  id: string;
  title: string;
  description: string;
  aiEnabled: boolean;
  mandatory: boolean;
  sortOrder: number;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  isGoldStandard?: boolean;
  isLegacy?: boolean;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt?: string;
  sections: TemplateSection[];
  permissions: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS = [
  { key: "ALL", label: "All" },
  { key: "INVESTMENT_MEMO", label: "Investment Memos" },
  { key: "CHECKLIST", label: "Diligence Checklists" },
  { key: "OUTREACH", label: "Outreach Sequences" },
] as const;

const TEMPLATE_TYPES = [
  { value: "INVESTMENT_MEMO", label: "Investment Memo" },
  { value: "CHECKLIST", label: "Diligence Checklist" },
  { value: "OUTREACH", label: "Outreach Sequence" },
  { value: "CUSTOM", label: "Custom" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("ALL");
  const [search, setSearch] = useState("");

  /* Modal state */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", category: "INVESTMENT_MEMO" });
  const [creating, setCreating] = useState(false);

  /* Context menu */
  const [menuId, setMenuId] = useState<string | null>(null);

  /* Delete confirmation */
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /* ---- Fetch templates ---- */
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Template[]>("/templates");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /* ---- Filtered list ---- */
  const visible = templates.filter((t) => {
    if (activeTab !== "ALL" && t.category !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ---- Create ---- */
  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const created = await api.post<Template>("/templates", createForm);
      setTemplates((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ name: "", description: "", category: "INVESTMENT_MEMO" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  /* ---- Duplicate ---- */
  const handleDuplicate = async (id: string) => {
    setMenuId(null);
    try {
      const dup = await api.post<Template>(`/templates/${id}/duplicate`, {});
      setTemplates((prev) => [dup, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate template");
    }
  };

  /* ---- Delete ---- */
  const confirmDelete = (id: string) => {
    setMenuId(null);
    setDeleteTarget(id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/templates/${deleteTarget}`);
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete template");
    }
    setDeleteTarget(null);
  };

  /* ---- Close menu on outside click ---- */
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuId]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="p-4 md:p-6 mx-auto max-w-[1600px] w-full flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Templates</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {loading ? "Loading..." : `${templates.length} templates`}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity text-sm font-medium"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((tab) => {
          const count =
            tab.key === "ALL"
              ? templates.length
              : templates.filter((t) => t.category === tab.key).length;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-card border border-border-subtle text-text-secondary hover:border-primary/30 hover:text-primary"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                  isActive ? "bg-white/20 text-white" : "bg-background-body text-text-muted"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <span className="material-symbols-outlined text-text-muted text-[20px]">search</span>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="block w-full max-w-md rounded-md border border-border-subtle bg-surface-card py-2 pl-10 pr-4 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all shadow-sm"
          placeholder="Search templates..."
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <span className="material-symbols-outlined text-[18px]">error</span>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-center py-16 text-text-muted">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Loading templates...</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
          <span className="material-symbols-outlined text-4xl text-text-muted">folder_open</span>
          <p className="mt-2 text-sm font-medium text-text-main">No templates found</p>
          <p className="text-xs text-text-muted mt-1">Try a different tab or create a new template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((template) => (
            <div
              key={template.id}
              className="group relative flex flex-col rounded-xl border border-border-subtle bg-surface-card shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all overflow-hidden"
            >
              {/* Card menu */}
              <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId(menuId === template.id ? null : template.id);
                  }}
                  className="h-8 w-8 bg-surface-card/90 backdrop-blur rounded-full flex items-center justify-center text-text-muted hover:text-primary transition-colors shadow-sm border border-border-subtle"
                >
                  <span className="material-symbols-outlined text-[18px]">more_vert</span>
                </button>

                {/* Dropdown */}
                {menuId === template.id && (
                  <div className="absolute right-0 top-10 w-40 bg-surface-card border border-border-subtle rounded-lg shadow-lg py-1 z-20">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(template.id);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-main hover:bg-background-body transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(template.id);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Preview thumbnail */}
              <div className="h-32 bg-background-body flex items-center justify-center relative overflow-hidden">
                <div className="w-3/4 h-[120%] bg-surface-card shadow-sm translate-y-4 rounded-t-sm border border-border-subtle p-3 opacity-80 group-hover:opacity-100 transition-opacity">
                  <div className="h-2 w-1/3 bg-border-subtle rounded-sm mb-2" />
                  <div className="h-2 w-full bg-background-body rounded-sm mb-1" />
                  <div className="h-2 w-full bg-background-body rounded-sm mb-1" />
                  <div className="h-2 w-2/3 bg-background-body rounded-sm" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
              </div>

              {/* Content */}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-text-main text-base leading-tight">{template.name}</h3>
                  <div className="flex gap-1 ml-2 shrink-0">
                    {template.isGoldStandard && (
                      <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Gold Std
                      </span>
                    )}
                    {template.isLegacy && (
                      <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Legacy
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-muted mb-4 line-clamp-2 flex-1">{template.description || "No description"}</p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <span className="material-symbols-outlined text-[14px]">view_list</span>
                    {template.sections?.length || 0} sections
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                    {formatRelativeTime(template.updatedAt || template.createdAt)}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                    <span className="material-symbols-outlined text-[14px]">bar_chart</span>
                    {template.usageCount || 0}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Create from scratch card */}
          <button
            onClick={() => setShowCreate(true)}
            className="group border-2 border-dashed border-border-subtle rounded-xl flex flex-col items-center justify-center text-text-muted hover:border-primary hover:text-primary hover:bg-blue-50/30 transition-all cursor-pointer min-h-[280px]"
          >
            <div className="bg-background-body p-3 rounded-full mb-3 group-hover:bg-blue-50 group-hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-[24px]">add</span>
            </div>
            <span className="font-medium text-sm">Create from Scratch</span>
          </button>
        </div>
      )}

      {/* ---- Delete Confirmation Modal ---- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-surface-card rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-full bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-[20px]">warning</span>
              </div>
              <div>
                <h3 className="font-semibold text-text-main">Delete Template</h3>
                <p className="text-sm text-text-muted">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle text-text-secondary hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Create Template Modal ---- */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-surface-card rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-text-main">New Template</h2>
              <button onClick={() => setShowCreate(false)} className="text-text-muted hover:text-text-main transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-text-main mb-1">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary"
                  placeholder="e.g. SaaS LBO Standard Memo"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-text-main mb-1">Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Brief description of this template's purpose..."
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-text-main mb-1">Type</label>
                <select
                  value={createForm.category}
                  onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary border border-border-subtle hover:bg-background-body transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.name.trim() || creating}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#003366" }}
              >
                {creating && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
                Create Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
