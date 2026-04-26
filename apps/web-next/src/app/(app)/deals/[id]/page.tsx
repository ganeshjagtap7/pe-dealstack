"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { getDealDisplayName } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useToast } from "@/providers/ToastProvider";
import Link from "next/link";
import { NotificationCenter } from "@/components/layout/NotificationPanel";
import { HelpSupportModal } from "@/components/layout/Header";

import {
  type DealDetail,
  type DocItem,
  type ChatMessage,
  type Activity,
  type Tab,
  TERMINAL_STAGES,
  OverviewTab,
  DocumentsTab,
  ChatTab,
  ActivityTab,
  StageChangeModal,
  StagePipeline,
  DealMetadataRow,
  FinancialMetricsRow,
  FinancialStatementsSection,
  DealAnalysisSection,
  DealActionsMenu,
  TeamAvatarStack,
  DealViewers,
  FinancialStatusBadge,
} from "./components";
import { EditDealModal, TerminalStageModal } from "./deal-panels";
import { useResizablePanel } from "./use-resizable-panel";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const { signOut } = useAuth();
  const { showToast } = useToast();
  const [linkCopied, setLinkCopied] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Resizable panels (drag divider between deal content and chat)
  const {
    containerRef,
    leftRef,
    handleRef,
    leftPanelStyle,
    isDragging,
    onMouseDown,
    onTouchStart,
    onDoubleClick,
  } = useResizablePanel();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  // Stage change modal
  const [stageModal, setStageModal] = useState<{ from: string; to: string } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [stageChanging, setStageChanging] = useState(false);
  const [stageError, setStageError] = useState("");

  // Terminal stage modal (Close Deal: Won/Lost/Passed)
  const [showTerminalModal, setShowTerminalModal] = useState(false);

  // Edit deal modal
  const [showEditModal, setShowEditModal] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat (always visible in sidebar, load eagerly)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Activity (loaded eagerly for inline feed in Overview)
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadDeal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const raw = await api.get<DealDetail & { teamMembers?: Array<{ role: string; user: { id: string; name: string; avatar?: string; email?: string } }> }>(`/deals/${dealId}`);
      // Flatten teamMembers -> team (API returns nested join, frontend expects flat)
      const data: DealDetail = {
        ...raw,
        team: raw.team || raw.teamMembers?.map((tm) => ({
          id: tm.user?.id || "",
          name: tm.user?.name || "",
          avatar: tm.user?.avatar,
          email: tm.user?.email,
          role: tm.role,
        })) || [],
      };
      setDeal(data);
      setDocuments(data.documents || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load deal";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const data = await api.get<{ activities: Activity[]; data?: Activity[] } | Activity[]>(
        `/deals/${dealId}/activities?limit=10`
      );
      if (Array.isArray(data)) {
        setActivities(data);
      } else {
        setActivities(data.data || data.activities || []);
      }
    } catch {
      // non-critical
    } finally {
      setActivitiesLoading(false);
    }
  }, [dealId]);

  const loadChatHistory = useCallback(async () => {
    try {
      const data = await api.get<{ messages: ChatMessage[] } | ChatMessage[]>(
        `/deals/${dealId}/chat/history`
      );
      setMessages(Array.isArray(data) ? data : data.messages || []);
    } catch {
      // non-critical
    }
  }, [dealId]);

  useEffect(() => {
    loadDeal();
  }, [loadDeal]);

  // Chat is always visible in the sidebar -- load eagerly, independently of deal metadata.
  useEffect(() => {
    loadChatHistory();
  }, [loadChatHistory]);

  // Activities loaded eagerly (shown in Overview tab inline feed)
  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Hash-scroll: the onboarding checklist links to /deals/:id#financials-section
  // etc. Sections render async after the deal loads, so the browser's native
  // hash scroll fires before targets exist. Poll up to 8s for the element then
  // smooth-scroll. Ported from apps/web/deal.js scrollToHashWhenReady (ee35074).
  useEffect(() => {
    if (!deal) return;
    const hash = window.location.hash?.slice(1);
    if (!hash) return;

    let attempts = 0;
    const maxAttempts = 40; // ~8 seconds @ 200ms
    const interval = setInterval(() => {
      const el = document.getElementById(hash);
      if (el) {
        clearInterval(interval);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (++attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [deal]);

  // Close user dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // Stage change
  // -----------------------------------------------------------------------

  const handleStageClick = (targetStage: string) => {
    if (!deal || targetStage === deal.stage) return;
    if (TERMINAL_STAGES.includes(deal.stage)) return;
    setStageModal({ from: deal.stage, to: targetStage });
    setStageNote("");
  };

  // "Change Stage" button handler: opens terminal stage modal (like legacy)
  const handleChangeStageBtn = () => {
    if (!deal) return;
    if (TERMINAL_STAGES.includes(deal.stage)) return;
    setShowTerminalModal(true);
  };

  const confirmStageChange = async () => {
    if (!stageModal || !deal) return;
    setStageChanging(true);
    setStageError("");
    try {
      const updated = await api.patch<DealDetail>(`/deals/${dealId}`, {
        stage: stageModal.to,
      });
      setDeal(updated);
      setStageModal(null);
      loadActivities();
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "Failed to update deal stage");
    } finally {
      setStageChanging(false);
    }
  };

  const handleTerminalSelect = async (stage: string) => {
    setShowTerminalModal(false);
    try {
      const updated = await api.patch<DealDetail>(`/deals/${dealId}`, {
        stage,
      });
      setDeal(updated);
      loadActivities();
    } catch {
      // non-critical
    }
  };

  // -----------------------------------------------------------------------
  // Delete deal
  // -----------------------------------------------------------------------

  const handleDeleteDeal = async () => {
    if (!deal) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${deal.name}"?\n\nThis will also delete all associated data room files, documents, and team assignments. This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      await api.delete(`/deals/${dealId}`);
      router.push("/deals");
    } catch {
      // non-critical
    }
  };

  // -----------------------------------------------------------------------
  // Documents
  // -----------------------------------------------------------------------

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));

      const res = await fetch(`/api/deals/${dealId}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const result = await res.json();
      const newDocs: DocItem[] = result.documents || result || [];
      setDocuments((prev) => [...prev, ...newDocs]);
    } catch {
      // ignore
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  // Send a specific text (used by suggestion chips) without relying on
  // chatInput state -- setState is async so a chip click can't setChatInput
  // then immediately read it.
  const sendPrompt = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || chatSending) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatSending(true);

    try {
      const data = await api.post<{
        response: string;
        model?: string;
        updates?: Array<{ field: string; value: unknown }>;
        sideEffects?: Array<{
          type: "note_added" | "extraction_triggered" | "scroll_to";
          section?: string;
          message?: string;
        }>;
      }>(
        `/deals/${dealId}/chat`,
        { message: trimmed }
      );
      const responseText =
        data.response || (data as unknown as { content?: string }).content || "";

      // Show error-styled message if agent returned an error model
      if ((data as unknown as { model?: string }).model === "error") {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `\u26A0\uFE0F ${responseText}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else if (responseText) {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: responseText,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      // If there were deal-field updates, refresh the deal data
      if (data.updates && data.updates.length > 0) {
        showToast("Changes have been applied", "success", { title: "Deal Updated" });
        try { await loadDeal(); } catch { /* ignore */ }
      }

      // Handle side effects (notes, extraction, scroll)
      if (data.sideEffects && data.sideEffects.length > 0) {
        for (const effect of data.sideEffects) {
          if (effect.type === "note_added") {
            showToast("Activity feed updated", "success", { title: "Note Added" });
            try { await loadDeal(); } catch { /* ignore */ }
          }
          if (effect.type === "extraction_triggered") {
            showToast(effect.message || "Financial extraction queued", "info", { title: "Extraction" });
          }
          if (effect.type === "scroll_to") {
            const sectionMap: Record<string, string> = {
              financials: "financials-section",
              analysis: "analysis-section",
              activity: "activity-feed",
              documents: "documents-list",
              risks: "key-risks-list",
            };
            const elId = effect.section ? sectionMap[effect.section] : undefined;
            const el = elId ? document.getElementById(elId) : null;
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const isServerError =
        msg.includes("API error 5") || msg.includes("API error 429");
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: isServerError
            ? "The server is temporarily unavailable. Please try again in a moment."
            : `Sorry, I couldn't process your request. ${msg}`,
        },
      ]);
    } finally {
      setChatSending(false);
    }
  }, [dealId, chatSending, showToast, loadDeal]);

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;
    setChatInput("");
    await sendPrompt(text);
  };

  // Clear chat history (ported from deal-chat.js clearChatConfirm)
  const clearChatHistory = useCallback(async () => {
    try {
      await api.delete(`/deals/${dealId}/chat/history`);
      setMessages([]);
    } catch {
      // non-critical
    }
  }, [dealId]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-text-muted animate-spin">
            progress_activity
          </span>
          <p className="mt-2 text-sm text-text-muted">Loading deal...</p>
        </div>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <span className="material-symbols-outlined text-4xl text-red-400">error</span>
          <h2 className="mt-3 text-lg font-semibold text-text-main">Deal not found</h2>
          <p className="mt-1 text-sm text-text-muted">
            {error || "Could not load this deal."}
          </p>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Deals
          </Link>
        </div>
      </div>
    );
  }

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "";

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      {/* HEADER BAR — breadcrumb + actions, spans full width above both panels */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6 bg-surface-card z-40 relative">
        <div className="flex items-center gap-4 flex-1">
          <nav className="flex items-center gap-1.5 text-sm">
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center size-7 rounded-md hover:bg-primary-light text-text-muted hover:text-primary transition-colors mr-1"
              title="Go back"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <Link href="/deals" className="text-text-muted hover:text-primary transition-colors">
              Deals
            </Link>
            <span className="material-symbols-outlined text-[14px] text-text-muted">chevron_right</span>
            <span className="text-text-main font-medium truncate max-w-[300px]">
              {getDealDisplayName(deal)}
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* Team Avatar Stack */}
          <div className="hidden md:flex items-center cursor-pointer hover:opacity-80 transition-opacity">
            <TeamAvatarStack team={deal.team || []} />
          </div>

          <Link
            href={`/data-room/${dealId}`}
            className="hidden md:flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary hover:bg-primary-light rounded-lg transition-colors border border-border-subtle"
          >
            <span className="material-symbols-outlined text-[18px]">folder_open</span>
            Data Room
          </Link>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.origin + pathname);
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              } catch {
                // Fallback for non-secure contexts
              }
            }}
            className="hidden md:flex items-center justify-center p-2 text-text-secondary hover:text-primary hover:bg-primary-light rounded-lg transition-colors"
            title="Copy share link"
          >
            <span className="material-symbols-outlined text-[20px]">{linkCopied ? "check" : "link"}</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm hover:bg-primary-hover transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">edit_document</span>
            Edit Deal
          </button>

          {/* Divider */}
          <div className="h-6 w-px bg-border-subtle" />

          {/* Notification bell */}
          <NotificationCenter />

          {/* Divider */}
          <div className="h-6 w-px bg-border-subtle" />

          {/* User menu */}
          <div className="relative" ref={userDropdownRef}>
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 text-sm font-medium text-text-main hover:text-primary transition-colors"
              title="Profile & Settings"
            >
              <div
                className="bg-center bg-no-repeat bg-cover rounded-full size-8 border border-gray-200 shadow-sm flex items-center justify-center bg-primary text-white text-xs font-bold"
                style={user?.avatar ? { backgroundImage: `url('${encodeURI(user.avatar)}')` } : {}}
              >
                {initials}
              </div>
              <span className="hidden md:inline">{user?.name || "Loading..."}</span>
              <span
                className={`material-symbols-outlined text-[18px] text-text-muted transition-transform duration-200 ${
                  userDropdownOpen ? "rotate-180" : ""
                }`}
              >
                expand_more
              </span>
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg shadow-lg py-1 z-50 bg-surface-card border border-border-subtle dropdown-animate">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <p className="text-sm font-medium text-text-main">{user?.name}</p>
                  <p className="text-xs text-text-muted truncate">{user?.role}</p>
                </div>
                <div className="py-1">
                  <Link
                    href="/settings"
                    className="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm text-text-secondary transition-colors"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <span className="material-symbols-outlined text-[18px]">person</span>
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    className="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm text-text-secondary transition-colors"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <span className="material-symbols-outlined text-[18px]">settings</span>
                    Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setHelpOpen(true);
                    }}
                    className="user-dropdown-item flex items-center gap-3 px-4 py-2 text-sm w-full text-left text-text-secondary transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">help</span>
                    Help &amp; Support
                  </button>
                </div>
                <div className="border-t border-border-subtle py-1">
                  <button
                    onClick={signOut}
                    className="user-dropdown-item-logout flex items-center gap-3 px-4 py-2 text-sm w-full text-left text-red-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* TWO-COLUMN LAYOUT — below header */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
      {/* LEFT PANEL — deal content, scrolls independently */}
      <section
        ref={leftRef}
        className="w-full lg:w-7/12 xl:w-1/2 flex flex-col overflow-y-auto border-r border-border-subtle bg-surface-card p-6 custom-scrollbar"
        style={leftPanelStyle}
      >

        {/* Deal content */}
        <div className="flex flex-col gap-3">
          {/* Deal header */}
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-4">
              <div className="size-16 rounded-xl bg-white p-1 border border-border-subtle shadow-card">
                <div className="w-full h-full bg-primary-light rounded-lg flex items-center justify-center border border-border-subtle">
                  <span className="material-symbols-outlined text-primary text-3xl">
                    {deal.icon || "business"}
                  </span>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-main leading-tight">
                  {getDealDisplayName(deal)}
                </h1>
                {/* Recently active team members ("@User on this deal") */}
                {(deal.team?.length ?? 0) > 0 && (
                  <DealViewers team={deal.team || []} />
                )}
                <div className="flex flex-wrap gap-2 mt-1">
                  {/* Financial status badge */}
                  <FinancialStatusBadge dealId={dealId} />
                </div>
              </div>
            </div>
            {/* Deal Actions Menu */}
            <DealActionsMenu
              dealId={dealId}
              dealName={deal.name}
              onDelete={handleDeleteDeal}
            />
          </div>

          {/* Stage Pipeline */}
          <StagePipeline
            deal={deal}
            onStageClick={handleStageClick}
            onChangeStage={handleChangeStageBtn}
          />

          {/* Metadata row */}
          <DealMetadataRow deal={deal} />

          {/* Financial metrics row */}
          <FinancialMetricsRow deal={deal} />

          {/* Financial Statements section */}
          <FinancialStatementsSection dealId={dealId} />

          {/* AI Financial Analysis section */}
          <DealAnalysisSection dealId={dealId} />

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border-subtle mt-1">
            {(["Overview", "Documents", "Activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-colors relative",
                  activeTab === tab
                    ? "text-primary"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === "Overview" && (
              <OverviewTab
                deal={deal}
                activities={activities}
                activitiesLoading={activitiesLoading}
                onRefreshActivities={loadActivities}
              />
            )}
            {activeTab === "Documents" && (
              <DocumentsTab
                documents={documents}
                uploading={uploading}
                fileInputRef={fileInputRef}
                onUpload={handleUpload}
              />
            )}
            {activeTab === "Activity" && (
              <ActivityTab activities={activities} loading={activitiesLoading} />
            )}
          </div>
        </div>
      </section>

      {/* RESIZE HANDLE — draggable divider between panels */}
      <div
        ref={handleRef}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={onDoubleClick}
        className={cn(
          "hidden lg:flex w-1.5 cursor-col-resize flex-shrink-0 relative items-center justify-center z-10 transition-colors",
          isDragging
            ? "bg-[rgba(0,51,102,0.15)]"
            : "hover:bg-primary/20 active:bg-primary/40",
        )}
        title="Drag to resize (double-click to reset)"
      >
        {/* Wider invisible hit area for easier grabbing */}
        <div className="absolute inset-y-0 -left-2 -right-2" />
        {/* Visual grip indicator */}
        <div className={cn(
          "w-0.5 h-8 rounded-full transition-colors",
          isDragging ? "bg-primary/50 opacity-100" : "bg-gray-300 opacity-0 hover:opacity-100",
        )} />
      </div>

      {/* RIGHT PANEL — AI Chat (desktop only, fills remaining space) */}
      <section className="hidden lg:flex flex-1 flex-col bg-background-body border-l border-border-subtle/60 shadow-inner relative" style={{ minWidth: 300 }}>
        <ChatTab
          deal={deal}
          messages={messages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatSending={chatSending}
          onSend={sendMessage}
          onSendPrompt={sendPrompt}
          onClearChat={clearChatHistory}
          chatEndRef={chatEndRef}
        />
      </section>
      </div>{/* end two-column */}
    </div>{/* end flex-col container */}

      {/* Stage Change Modal */}
      {stageModal && (
        <StageChangeModal
          from={stageModal.from}
          to={stageModal.to}
          note={stageNote}
          setNote={setStageNote}
          loading={stageChanging}
          error={stageError}
          onConfirm={confirmStageChange}
          onClose={() => {
            setStageModal(null);
            setStageError("");
          }}
        />
      )}

      {/* Terminal Stage Modal (Close Deal) */}
      {showTerminalModal && (
        <TerminalStageModal
          dealName={deal.name}
          onSelect={handleTerminalSelect}
          onClose={() => setShowTerminalModal(false)}
        />
      )}

      {/* Edit Deal Modal */}
      {showEditModal && deal && (
        <EditDealModal
          deal={deal}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            setDeal((prev) => (prev ? { ...prev, ...updated } : updated));
            showToast("Deal details have been saved", "success", { title: "Deal Updated" });
            loadActivities();
          }}
        />
      )}

      {/* Help & Support Modal (opened from user dropdown) */}
      <HelpSupportModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
