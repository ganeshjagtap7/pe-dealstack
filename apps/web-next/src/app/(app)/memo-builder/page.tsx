"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatters";
import { cn } from "@/lib/cn";

import {
  MemoSection,
  Memo,
  ChatMessage,
  DealOption,
  TemplateOption,
  STATUS_STYLES,
  MemoListSidebar,
  MemoChat,
  CreateMemoModal,
} from "./components";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MemoBuilderPage() {
  /* ---- Memo list ---- */
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  /* ---- Selected memo ---- */
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [sections, setSections] = useState<MemoSection[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [loadingMemo, setLoadingMemo] = useState(false);

  /* ---- Section editing ---- */
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  /* ---- Chat ---- */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ---- Create memo modal ---- */
  const [showCreate, setShowCreate] = useState(false);
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [createForm, setCreateForm] = useState({ dealId: "", templateId: "", title: "Investment Committee Memo" });
  const [creatingMemo, setCreatingMemo] = useState(false);

  /* ---- Error ---- */
  const [error, setError] = useState<string | null>(null);

  /* ================================================================ */
  /*  Data loading                                                     */
  /* ================================================================ */

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

  useEffect(() => {
    loadMemos();
  }, [loadMemos]);

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

  /* ---- Scroll chat ---- */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================================================================ */
  /*  Filtered list                                                    */
  /* ================================================================ */

  const filteredMemos = memos.filter((m) => {
    if (listSearch) {
      const q = listSearch.toLowerCase();
      if (!m.title.toLowerCase().includes(q) && !(m.projectName || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ================================================================ */
  /*  Create memo                                                      */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Section actions                                                  */
  /* ================================================================ */

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

  /* ================================================================ */
  /*  Chat                                                             */
  /* ================================================================ */

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
      const res = await api.post<{ role: string; content: string; timestamp?: string }>(`/memos/${selectedMemo.id}/chat`, { content });
      const aiMsg: ChatMessage = {
        id: "a-" + Date.now(),
        role: "assistant",
        content: res.content,
        timestamp: res.timestamp ? formatRelativeTime(res.timestamp) : "Now",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: "err-" + Date.now(), role: "assistant", content: "Sorry, I encountered an error. Please try again.", timestamp: "Now" },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="flex h-full overflow-hidden">
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
      <div className="flex-1 flex overflow-hidden">
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
            <div className="flex-1 flex flex-col overflow-hidden">
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
                </div>
              </div>

              {/* Section outline + content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Section nav */}
                <div className="w-56 shrink-0 border-r border-border-subtle bg-background-body p-3 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-2 px-2">Sections</p>
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left mb-0.5",
                        activeSection === section.id
                          ? "bg-surface-card shadow-sm border border-border-subtle text-primary"
                          : "text-text-secondary hover:bg-surface-card/50"
                      )}
                    >
                      <span
                        className={cn(
                          "material-symbols-outlined text-[14px]",
                          activeSection === section.id ? "text-primary" : "text-text-muted"
                        )}
                      >
                        drag_indicator
                      </span>
                      <span className="truncate">{section.title}</span>
                      {activeSection === section.id && <div className="ml-auto size-1.5 rounded-full bg-primary shrink-0" />}
                    </button>
                  ))}

                  {sections.length === 0 && (
                    <p className="text-[11px] text-text-muted text-center py-6">No sections yet</p>
                  )}
                </div>

                {/* Content editor */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-background-body p-6">
                  {sections.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="material-symbols-outlined text-4xl text-text-muted mb-2">article</span>
                      <p className="text-sm font-medium text-text-main mb-1">No sections</p>
                      <p className="text-xs text-text-muted">This memo has no sections yet. They will be created from the template.</p>
                    </div>
                  ) : (
                    sections.map((section) => (
                      <div
                        key={section.id}
                        id={`section-${section.id}`}
                        className={cn(
                          "mb-6 bg-surface-card rounded-xl border shadow-card p-5 transition-all",
                          activeSection === section.id ? "border-primary/30 shadow-card-hover" : "border-border-subtle"
                        )}
                        onClick={() => setActiveSection(section.id)}
                      >
                        {/* Section header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-text-main">{section.title}</h3>
                            {section.aiGenerated && (
                              <span className="flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                AI
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleGenerate(section.id); }}
                              disabled={generatingSection === section.id}
                              className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                              title="AI Generate"
                            >
                              {generatingSection === section.id ? (
                                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                              )}
                              Generate
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSaveSection(section.id); }}
                              disabled={savingSection === section.id}
                              className="h-7 px-2 rounded-md flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:bg-background-body transition-colors disabled:opacity-50"
                              title="Save section"
                            >
                              {savingSection === section.id ? (
                                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                              ) : (
                                <span className="material-symbols-outlined text-[14px]">save</span>
                              )}
                              Save
                            </button>
                          </div>
                        </div>

                        {/* Content editor */}
                        <textarea
                          value={editingContent[section.id] || ""}
                          onChange={(e) =>
                            setEditingContent((prev) => ({ ...prev, [section.id]: e.target.value }))
                          }
                          rows={8}
                          className="w-full rounded-lg border border-border-subtle bg-background-body px-4 py-3 text-sm text-text-main leading-relaxed placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                          placeholder="Write section content here or click Generate to use AI..."
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
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
    </div>
  );
}
