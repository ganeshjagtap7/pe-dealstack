"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, NotFoundError } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import {
  MemoSection,
  Memo,
  ChatMessage,
  DealOption,
  TemplateOption,
  SECTION_TYPES,
  MemoListSidebar,
  MemoOutlineSidebar,
  MemoEditor,
  MemoChat,
  MemoChatCollapsed,
  CreateMemoModal,
  AddSectionModal,
} from "./components";
import { exportMemoPDF, exportMemoMarkdown, exportMemoClipboard, shareMemoLink } from "./export";
import { DocumentHeaderBar } from "./header-bar";

export default function MemoBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MemoBuilderPageInner />
    </Suspense>
  );
}

function MemoBuilderPageInner() {
  const searchParams = useSearchParams();
  const urlDealId = searchParams.get("dealId");
  /* ---- State ---- */
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [sections, setSections] = useState<MemoSection[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loadingMemo, setLoadingMemo] = useState(false);
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [createForm, setCreateForm] = useState({ dealId: "", templateId: "", title: "Investment Committee Memo" });
  const [creatingMemo, setCreatingMemo] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [addSectionType, setAddSectionType] = useState("CUSTOM");
  const [addSectionTitle, setAddSectionTitle] = useState("");
  const [addSectionAI, setAddSectionAI] = useState(true);
  const [addingSectionLoading, setAddingSectionLoading] = useState(false);
  const [pendingDeleteSection, setPendingDeleteSection] = useState<{ id: string; title: string } | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  /* ---- Data loading ---- */
  const loadMemos = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const data = await api.get<Memo[]>(`/memos${params.toString() ? "?" + params : ""}`);
      setMemos(Array.isArray(data) ? data : []);
    } catch (err) {
      // 404 means the endpoint isn't deployed yet — show empty state silently.
      // Other errors are also swallowed here; the page degrades to an empty list.
      if (!(err instanceof NotFoundError)) {
        // Non-404 errors are unexpected but we still fail gracefully.
      }
      setMemos([]);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadMemos(); }, [loadMemos]);

  const loadMemo = useCallback(async (id: string) => {
    setLoadingMemo(true);
    setError(null);
    try {
      const memo = await api.get<Memo & { sections?: MemoSection[]; conversations?: { messages?: ChatMessage[] }[] }>(`/memos/${id}`);
      setSelectedMemo(memo);

      const sortedSections = (memo.sections || [])
        .map((s) => ({
          ...s,
          hasTable: !!s.tableData,
          hasChart: !!s.chartConfig,
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      setSections(sortedSections);

      // Initialize editing content
      const contentMap: Record<string, string> = {};
      sortedSections.forEach((s) => { contentMap[s.id] = s.content || ""; });
      setEditingContent(contentMap);

      setActiveSection(sortedSections[0]?.id || null);

      // Load chat messages
      if (memo.conversations?.length && memo.conversations[0].messages?.length) {
        setMessages(
          memo.conversations[0].messages.map((m) => ({
            id: m.id || String(Math.random()),
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || formatRelativeTime(new Date().toISOString()),
          }))
        );
      } else {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content: `Welcome to the Memo Builder. I can help you draft and refine sections for "${memo.projectName || memo.title}". Click the AI generate button on any section, or ask me a question below.`,
            timestamp: "Now",
          },
        ]);
      }
    } catch (err) {
      // 404: endpoint not yet deployed — clear selection and return to list.
      if (err instanceof NotFoundError) {
        setSelectedMemo(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load memo");
      }
    } finally {
      setLoadingMemo(false);
    }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  /* ---- Filtered list ---- */
  const filteredMemos = memos.filter((m) => {
    if (listSearch) {
      const q = listSearch.toLowerCase();
      if (!m.title.toLowerCase().includes(q) && !(m.projectName || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ---- Create memo ---- */
  const openCreateModal = useCallback(async (prefillDealId?: string) => {
    setShowCreate(true);
    if (prefillDealId) {
      setCreateForm((f) => ({ ...f, dealId: prefillDealId }));
    }
    try {
      const [dealRes, templateRes] = await Promise.all([
        api.get<{ deals: DealOption[] }>("/deals?limit=50").catch(() => ({ deals: [] })),
        api.get<TemplateOption[]>("/templates").catch(() => []),
      ]);
      setDeals(dealRes.deals || []);
      setTemplates(Array.isArray(templateRes) ? templateRes : []);
    } catch (err) {
      console.warn("[memo-builder] failed to load deals/templates for create modal:", err);
    }
  }, []);

  /* ---- ?dealId=X consumption ----
   * When the page is opened from a deal (e.g. Memo Builder button on the
   * deal analysis panel), we receive ?dealId=X and want to either jump
   * straight into the deal's existing memo, or open the Create modal
   * pre-bound to that deal. Mirrors the legacy apps/web/memo-builder.js
   * dealId-branch behavior, but skips the multi-memo picker overlay since
   * web-next already shows the full memo list in the left sidebar.
   * Consume once per distinct dealId so we don't re-trigger on every render.
   */
  const consumedDealIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlDealId) return;
    if (consumedDealIdRef.current === urlDealId) return;
    consumedDealIdRef.current = urlDealId;

    let cancelled = false;
    (async () => {
      // Always end up in either the existing memo OR the Create modal. If any
      // step throws, fall through to opening the modal — never strand the
      // user on an empty state when they navigated here with a dealId.
      let matches: Memo[] = [];
      try {
        const params = new URLSearchParams({ dealId: urlDealId });
        const result = await api.get<Memo[]>(`/memos?${params}`);
        if (Array.isArray(result)) matches = result;
      } catch (err) {
        console.warn("[memo-builder] dealId-prefill memo lookup failed:", err);
      }
      if (cancelled) return;

      if (matches.length > 0) {
        const best = [...matches].sort((a, b) =>
          (b.updatedAt || "").localeCompare(a.updatedAt || "")
        )[0];
        try {
          await loadMemo(best.id);
        } catch (err) {
          // If the memo can't load (deleted? permissions?), fall through to
          // the create flow rather than leave the user on the empty state.
          console.warn("[memo-builder] loadMemo failed, falling back to create:", err);
          if (!cancelled) openCreateModal(urlDealId);
        }
      } else {
        openCreateModal(urlDealId);
      }
    })();
    return () => { cancelled = true; };
  }, [urlDealId, loadMemo, openCreateModal]);

  const handleCreate = async () => {
    setCreatingMemo(true);
    try {
      const body: Record<string, string> = { title: createForm.title, status: "DRAFT", type: "IC_MEMO" };
      if (createForm.dealId) body.dealId = createForm.dealId;
      if (createForm.templateId) body.templateId = createForm.templateId;
      const created = await api.post<Memo>("/memos", body);
      setMemos((prev) => [created, ...prev]);
      setShowCreate(false);
      setCreateForm({ dealId: "", templateId: "", title: "Investment Committee Memo" });
      loadMemo(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create memo");
    } finally {
      setCreatingMemo(false);
    }
  };

  /* ---- Section actions ---- */
  const handleGenerate = async (sectionId: string) => {
    if (!selectedMemo) return;
    setGeneratingSection(sectionId);
    try {
      const result = await api.post<{ content: string }>(`/memos/${selectedMemo.id}/sections/${sectionId}/generate`, {});
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, content: result.content, aiGenerated: true } : s))
      );
      setEditingContent((prev) => ({ ...prev, [sectionId]: result.content }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGeneratingSection(null);
    }
  };

  const handleSaveSection = async (sectionId: string) => {
    if (!selectedMemo) return;
    setSavingSection(sectionId);
    try {
      await api.patch(`/memos/${selectedMemo.id}/sections/${sectionId}`, {
        content: editingContent[sectionId] || "",
      });
      setSections((prev) =>
        prev.map((s) => (s.id === sectionId ? { ...s, content: editingContent[sectionId] || "" } : s))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save section");
    } finally {
      setSavingSection(null);
    }
  };

  /* ---- Add / Delete / Generate-All ---- */
  const handleAddSection = async () => {
    if (!selectedMemo) return;
    const title = addSectionTitle.trim() || SECTION_TYPES.find((t) => t.value === addSectionType)?.label || "New Section";
    setAddingSectionLoading(true);
    try {
      const body = {
        type: addSectionType,
        title,
        sortOrder: sections.length + 1,
        content: "",
      };
      const created = await api.post<MemoSection>(`/memos/${selectedMemo.id}/sections`, body);
      setSections((prev) => [...prev, created]);
      setEditingContent((prev) => ({ ...prev, [created.id]: "" }));
      setActiveSection(created.id);
      setShowAddSection(false);
      setAddSectionTitle("");
      setAddSectionType("CUSTOM");

      // Auto-generate if checkbox was checked
      if (addSectionAI) {
        handleGenerate(created.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add section");
    } finally {
      setAddingSectionLoading(false);
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!selectedMemo) return;
    setPendingDeleteSection(null);
    try {
      await api.delete(`/memos/${selectedMemo.id}/sections/${sectionId}`);
      setSections((prev) => prev.filter((s) => s.id !== sectionId));
      setEditingContent((prev) => {
        const next = { ...prev };
        delete next[sectionId];
        return next;
      });
      if (activeSection === sectionId) {
        setActiveSection(sections.find((s) => s.id !== sectionId)?.id || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete section");
    }
  };

  const handleGenerateAll = async () => {
    if (!selectedMemo) return;
    setGeneratingAll(true);
    try {
      const result = await api.post<{ sections: MemoSection[] }>(`/memos/${selectedMemo.id}/generate-all`, {});
      if (result.sections) {
        const sorted = result.sections.sort((a, b) => a.sortOrder - b.sortOrder);
        setSections(sorted);
        const contentMap: Record<string, string> = {};
        sorted.forEach((s) => { contentMap[s.id] = s.content || ""; });
        setEditingContent(contentMap);
        setActiveSection(sorted[0]?.id || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate all sections");
    } finally {
      setGeneratingAll(false);
    }
  };

  /* ---- Export + Share ---- */

  // Auto-dismiss success toasts after 3s
  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 3000);
    return () => clearTimeout(t);
  }, [successToast]);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [exportMenuOpen]);

  const handleExportPDF = async () => {
    if (!selectedMemo || sections.length === 0) return;
    setExportMenuOpen(false);
    try {
      await exportMemoPDF(selectedMemo, sections, editingContent);
      setSuccessToast("Memo exported as PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF export failed");
    }
  };

  const handleExportMarkdown = () => {
    if (!selectedMemo || sections.length === 0) return;
    setExportMenuOpen(false);
    try {
      exportMemoMarkdown(selectedMemo, sections, editingContent);
      setSuccessToast("Memo exported as Markdown.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Markdown export failed");
    }
  };

  const handleExportClipboard = async () => {
    if (!selectedMemo || sections.length === 0) return;
    setExportMenuOpen(false);
    try {
      await exportMemoClipboard(sections, editingContent);
      setSuccessToast("Memo content copied to clipboard.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy failed");
    }
  };

  const handleShare = async () => {
    if (!selectedMemo) return;
    try {
      await shareMemoLink();
      setSuccessToast(`Share link for "${selectedMemo.projectName || selectedMemo.title}" copied.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    }
  };

  /* ---- Chat ---- */
  //
  // Agent responses can now carry an "action" field (e788eb3 + b609ebd on
  // main): 'applied' means the agent added, removed, or regenerated a
  // section server-side. When we see it, reload the memo so the new state
  // is visible in the editor — matches the refreshSection/full-reload
  // behavior in apps/web/memo-chat.js without porting all the confirm/undo
  // UI that web-next doesn't have yet.
  type MemoChatResponse = {
    role?: string;
    content: string;
    timestamp?: string;
    action?: string;
    sectionId?: string;
    type?: string;
    sectionType?: string;
    title?: string;
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedMemo) return;
    const content = chatInput.trim();
    setChatInput("");

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      role: "user",
      content,
      timestamp: "Now",
    };
    setMessages((prev) => [...prev, userMsg]);
    setSendingChat(true);

    try {
      const res = await api.post<MemoChatResponse>(`/memos/${selectedMemo.id}/chat`, { content });
      const aiMsg: ChatMessage = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: res.content,
        timestamp: res.timestamp ? formatRelativeTime(res.timestamp) : "Now",
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (res.action === "applied" && selectedMemo) {
        await loadMemo(selectedMemo.id);
        if (res.type === "new_section" && res.title) {
          setSuccessToast(`Section "${res.title}" added.`);
        } else if (res.type === "remove_section") {
          setSuccessToast("Section removed.");
        }
      }
    } catch (err) {
      const msg = err instanceof NotFoundError
        ? "The AI assistant service isn't available for this memo yet."
        : "Sorry, I encountered an error. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "assistant", content: msg, timestamp: "Now" },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  /* ---- Render ---- */

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden min-w-0">
      {/* ---- Left sidebar: memo list ---- */}
      <MemoListSidebar
        memos={memos}
        selectedMemoId={selectedMemo?.id}
        loadingList={loadingList}
        listSearch={listSearch}
        setListSearch={setListSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        onSelectMemo={loadMemo}
        onCreateNew={() => openCreateModal()}
        filteredMemos={filteredMemos}
      />

      {/* ---- Main column: breadcrumb + header + workspace ---- */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Breadcrumb bar */}
        <div className="flex items-center h-10 px-6 border-b border-slate-100 bg-slate-50/80 text-sm shrink-0">
          <nav className="flex items-center gap-1.5">
            <button
              onClick={() => setSelectedMemo(null)}
              className="flex items-center justify-center size-7 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors mr-1"
              title="Back to memo list"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <Link href="/dashboard" className="text-slate-400 hover:text-primary transition-colors">
              Dashboard
            </Link>
            <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
            <span className="text-slate-400">AI Reports</span>
            {selectedMemo && (
              <>
                <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
                <span className="text-slate-900 font-medium">
                  {selectedMemo.projectName || selectedMemo.title}
                </span>
              </>
            )}
          </nav>
        </div>

        {!selectedMemo ? (
          /* Empty state — matches legacy showEmptyMemoState */
          <div className="flex-1 flex items-center justify-center bg-background-body">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">edit_note</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Select or Create a Memo</h3>
              <p className="text-sm text-slate-500 mb-6 max-w-md">
                Choose a memo from the sidebar, or create a new one to get started with the AI-powered memo builder.
              </p>
              <button
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#003366" }}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Memo
              </button>
            </div>
          </div>
        ) : loadingMemo ? (
          <div className="flex-1 flex items-center justify-center bg-background-body">
            <div className="flex flex-col items-center gap-4">
              <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-600 font-medium">Loading memo...</p>
            </div>
          </div>
        ) : (
          <>
            <DocumentHeaderBar
              memo={selectedMemo}
              sections={sections}
              generatingAll={generatingAll}
              exportMenuOpen={exportMenuOpen}
              setExportMenuOpen={setExportMenuOpen}
              exportMenuRef={exportMenuRef}
              onGenerateAll={handleGenerateAll}
              onShare={handleShare}
              onExportPDF={handleExportPDF}
              onExportMarkdown={handleExportMarkdown}
              onExportClipboard={handleExportClipboard}
            />

            {/* Workspace: outline + document canvas + chat */}
            <div className="flex flex-1 overflow-hidden">
              <MemoOutlineSidebar
                sections={sections}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                onAddSection={() => setShowAddSection(true)}
              />
              <MemoEditor
                memo={selectedMemo}
                sections={sections}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                editingContent={editingContent}
                setEditingContent={setEditingContent}
                generatingSection={generatingSection}
                savingSection={savingSection}
                onGenerate={handleGenerate}
                onSave={handleSaveSection}
                onDelete={setPendingDeleteSection}
              />
              {chatOpen ? (
                <MemoChat
                  messages={messages}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  sendingChat={sendingChat}
                  onSend={sendMessage}
                  chatOpen={chatOpen}
                  onToggleChat={() => setChatOpen(false)}
                  chatEndRef={chatEndRef}
                />
              ) : (
                <MemoChatCollapsed onOpen={() => setChatOpen(true)} />
              )}
            </div>
          </>
        )}
      </div>

      {/* ---- Success toast ---- */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-emerald-50 border border-emerald-200 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-emerald-600 text-[20px] mt-0.5">check_circle</span>
          <div className="flex-1">
            <p className="text-sm text-emerald-800">{successToast}</p>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-400 hover:text-emerald-600">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ---- Error toast ---- */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-red-50 border border-red-200 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-red-500 text-[20px] mt-0.5">error</span>
          <div className="flex-1">
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* ---- Create Memo Modal ---- */}
      <CreateMemoModal
        showCreate={showCreate}
        onClose={() => setShowCreate(false)}
        deals={deals}
        templates={templates}
        createForm={createForm}
        setCreateForm={setCreateForm}
        creatingMemo={creatingMemo}
        onCreate={handleCreate}
      />

      {/* ---- Add Section Modal ---- */}
      <AddSectionModal
        open={showAddSection}
        onClose={() => setShowAddSection(false)}
        sectionType={addSectionType}
        setSectionType={setAddSectionType}
        sectionTitle={addSectionTitle}
        setSectionTitle={setAddSectionTitle}
        generateAI={addSectionAI}
        setGenerateAI={setAddSectionAI}
        loading={addingSectionLoading}
        onAdd={handleAddSection}
      />

      {/* ---- Delete Section Confirm ---- */}
      <ConfirmDialog
        open={!!pendingDeleteSection}
        title="Delete Section"
        message={pendingDeleteSection ? `Delete "${pendingDeleteSection.title}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => pendingDeleteSection && handleDeleteSection(pendingDeleteSection.id)}
        onCancel={() => setPendingDeleteSection(null)}
      />
    </div>
  );
}
