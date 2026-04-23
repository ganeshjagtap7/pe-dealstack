"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { useUser } from "@/providers/UserProvider";
import Link from "next/link";

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
  DealActionsMenu,
  TeamAvatarStack,
} from "./components";
import { TerminalStageModal } from "./deal-panels";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useUser();
  const [linkCopied, setLinkCopied] = useState(false);

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
      const data = await api.post<{ response: string; model?: string }>(
        `/deals/${dealId}/chat`,
        { message: trimmed }
      );
      const responseText =
        data.response || (data as unknown as { content?: string }).content || "";
      if (responseText) {
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
  }, [dealId, chatSending]);

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
          <span className="material-symbols-outlined text-5xl text-red-400">error</span>
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

  const stageStyle = STAGE_STYLES[deal.stage] || STAGE_STYLES.INITIAL_REVIEW;

  return (
    <div className="p-4 md:p-6 mx-auto max-w-[1400px] w-full flex flex-col gap-5">
      {/* Breadcrumb bar with actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Link href="/deals" className="hover:text-primary transition-colors">
            Deals
          </Link>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-text-main font-medium truncate max-w-[300px]">
            {deal.name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Team Avatar Stack */}
          <div className="hidden md:flex items-center cursor-pointer hover:opacity-80 transition-opacity">
            <TeamAvatarStack team={deal.team || []} />
          </div>

          <Link
            href={`/data-room/${dealId}`}
            className="hidden md:flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary hover:text-primary border border-border-subtle rounded-lg hover:bg-blue-50 transition-colors"
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
            className="hidden md:flex items-center justify-center p-2 text-text-secondary hover:text-primary hover:bg-blue-50 rounded-lg transition-colors"
            title="Copy share link"
          >
            <span className="material-symbols-outlined text-[20px]">{linkCopied ? "check" : "link"}</span>
          </button>
          <button
            onClick={() => router.push(`/deals/${dealId}/edit`)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">edit_document</span>
            Edit Deal
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* LEFT COLUMN */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Deal header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <div className="size-16 rounded-xl bg-white p-1 border border-border-subtle shadow-card">
                <div className="w-full h-full bg-blue-50 rounded-lg flex items-center justify-center border border-border-subtle">
                  <span className="material-symbols-outlined text-primary text-3xl">
                    {deal.icon || "business"}
                  </span>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-main leading-tight">
                  {deal.name}
                </h1>
                {deal.industry && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        stageStyle.bg,
                        stageStyle.text
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          stageStyle.border.replace("border-", "bg-")
                        )}
                      />
                      {STAGE_LABELS[deal.stage] || deal.stage}
                    </span>
                  </div>
                )}
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

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border-subtle">
            {(["Overview", "Documents", "Activity"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium transition-colors relative",
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

        {/* RIGHT COLUMN -- AI Chat sidebar (sticky, desktop only) */}
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-6">
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
          </div>
        </div>
      </div>

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
    </div>
  );
}
