"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

import {
  MemoSection,
  Memo,
  ChatMessage,
  DealOption,
  TemplateOption,
  STATUS_STYLES,
  SECTION_TYPES,
  MemoListSidebar,
  MemoEditor,
  MemoChat,
  CreateMemoModal,
  AddSectionModal,
} from "./components";
import { exportMemoPDF, exportMemoMarkdown, exportMemoClipboard, shareMemoLink } from "./export";

export default function MemoBuilderPage() {
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
    } catch {
      // API may not be available
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
      setError(err instanceof Error ? err.message : "Failed to load memo");
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
  const openCreateModal = async () => {
    setShowCreate(true);
    try {
      const [dealRes, templateRes] = await Promise.all([
        api.get<{ deals: DealOption[] }>("/deals?limit=50").catch(() => ({ deals: [] })),
        api.get<TemplateOption[]>("/templates").catch(() => []),
      ]);
      setDeals(dealRes.deals || []);
      setTemplates(Array.isArray(templateRes) ? templateRes : []);
    } catch {
      // Ignore
    }
  };

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
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: "Now" },
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
        onCreateNew={openCreateModal}
        filteredMemos={filteredMemos}
      />

      {/* ---- Right: editor + chat ---- */}
      <div className="flex-1 flex overflow-hidden min-w-0">
        {!selectedMemo ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center bg-background-body">
            <div className="text-center max-w-sm">
              <span className="material-symbols-outlined text-5xl text-text-muted mb-3 block">edit_note</span>
              <h3 className="text-lg font-semibold text-text-main mb-2">Select or Create a Memo</h3>
              <p className="text-sm text-text-muted mb-4">
                Choose a memo from the sidebar, or create a new one to get started with the AI-powered memo builder.
              </p>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#003366" }}
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New Memo
              </button>
            </div>
          </div>
        ) : loadingMemo ? (
          <div className="flex-1 flex items-center justify-center bg-background-body">
            <div className="flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
              <p className="text-sm text-text-muted">Loading memo...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Editor area */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              {/* Editor header */}
              <div className="border-b border-border-subtle bg-surface-card px-6 py-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-main">{selectedMemo.projectName || selectedMemo.title}</h2>
                  <p className="text-xs text-text-muted">{selectedMemo.title} &middot; {formatRelativeTime(selectedMemo.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-2 py-1 rounded text-[11px] font-medium",
                      (STATUS_STYLES[selectedMemo.status] || STATUS_STYLES.DRAFT).bg,
                      (STATUS_STYLES[selectedMemo.status] || STATUS_STYLES.DRAFT).text
                    )}
                  >
                    {selectedMemo.status}
                  </span>
                  <button
                    onClick={() => setChatOpen(!chatOpen)}
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center transition-colors border",
                      chatOpen ? "bg-primary text-white border-primary" : "bg-surface-card text-text-muted border-border-subtle hover:text-primary"
                    )}
                    title={chatOpen ? "Close AI chat" : "Open AI chat"}
                  >
                    <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                  </button>
                  {sections.length > 0 && (
                    <>
                      <button
                        onClick={handleGenerateAll}
                        disabled={generatingAll}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium border border-border-subtle text-text-secondary hover:text-primary hover:border-primary transition-colors disabled:opacity-50"
                        title="Generate all sections with AI"
                      >
                        {generatingAll ? (
                          <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                        )}
                        {generatingAll ? "Generating..." : "Generate All"}
                      </button>
                      <button
                        onClick={handleShare}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium border border-border-subtle text-text-secondary hover:text-primary hover:border-primary transition-colors"
                        title="Copy share link"
                      >
                        <span className="material-symbols-outlined text-[14px]">share</span>
                        Share
                      </button>
                      <div className="relative" ref={exportMenuRef}>
                        <div className="flex items-center rounded-lg overflow-visible" style={{ backgroundColor: "#003366" }}>
                          <button
                            onClick={handleExportPDF}
                            className="h-8 px-3 flex items-center gap-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity rounded-l-lg"
                          >
                            <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                            Export PDF
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExportMenuOpen((v) => !v);
                            }}
                            className="h-8 px-1.5 flex items-center text-white hover:opacity-90 transition-opacity rounded-r-lg border-l border-white/20"
                            aria-label="Export options"
                          >
                            <span className="material-symbols-outlined text-[18px]">arrow_drop_down</span>
                          </button>
                        </div>
                        {exportMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-50">
                            <button
                              onClick={handleExportPDF}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
                            >
                              <span className="material-symbols-outlined text-[18px] text-red-500">picture_as_pdf</span>
                              Export as PDF
                            </button>
                            <button
                              onClick={handleExportMarkdown}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
                            >
                              <span className="material-symbols-outlined text-[18px] text-text-muted">code</span>
                              Export as Markdown
                            </button>
                            <button
                              onClick={handleExportClipboard}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-main hover:bg-background-body transition-colors text-left"
                            >
                              <span className="material-symbols-outlined text-[18px] text-blue-500">content_copy</span>
                              Copy to Clipboard
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Section outline + content */}
              <MemoEditor
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
                onAddSection={() => setShowAddSection(true)}
              />
            </div>

            {/* ---- Chat panel ---- */}
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
