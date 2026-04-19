"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  TABS,
  OverviewTab,
  DocumentsTab,
  ChatTab,
  ActivityTab,
  StageChangeModal,
} from "./components";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const dealId = params.id;
  const router = useRouter();
  const { user } = useUser();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  // Stage change modal
  const [stageModal, setStageModal] = useState<{ from: string; to: string } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [stageChanging, setStageChanging] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Activity
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------

  const loadDeal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get<DealDetail>(`/deals/${dealId}`);
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
      const data = await api.get<{ activities: Activity[] } | Activity[]>(
        `/deals/${dealId}/activities`
      );
      setActivities(Array.isArray(data) ? data : data.activities || []);
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

  useEffect(() => {
    if (activeTab === "Activity") loadActivities();
    if (activeTab === "Chat") loadChatHistory();
  }, [activeTab, loadActivities, loadChatHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // -----------------------------------------------------------------------
  // Stage change
  // -----------------------------------------------------------------------

  const handleStageClick = (targetStage: string) => {
    if (!deal || targetStage === deal.stage) return;
    if (TERMINAL_STAGES.includes(deal.stage)) return;
    setStageModal({ from: deal.stage, to: targetStage });
    setStageNote("");
  };

  const [stageError, setStageError] = useState("");

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
    } catch (err) {
      setStageError(err instanceof Error ? err.message : "Failed to update deal stage");
    } finally {
      setStageChanging(false);
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

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatSending) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatSending(true);

    try {
      const data = await api.post<ChatMessage | { message: ChatMessage }>(
        `/deals/${dealId}/chat`,
        { message: text }
      );
      const assistantMsg: ChatMessage =
        "message" in (data as Record<string, unknown>)
          ? (data as { message: ChatMessage }).message
          : (data as ChatMessage);
      if (assistantMsg?.content) {
        setMessages((prev) => [...prev, { ...assistantMsg, role: "assistant" }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const isServerError = msg.includes("API error 5") || msg.includes("API error 429");
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
  };

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
          <p className="mt-1 text-sm text-text-muted">{error || "Could not load this deal."}</p>
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
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === deal.stage);
  const isTerminal = TERMINAL_STAGES.includes(deal.stage);

  return (
    <div className="p-6 mx-auto max-w-[1400px] flex flex-col gap-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link href="/deals" className="hover:text-primary transition-colors">
          Deals
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-text-main font-medium">{deal.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-primary font-bold text-lg">
            {deal.name?.[0] || "D"}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-main tracking-tight">{deal.name}</h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                  stageStyle.bg,
                  stageStyle.text
                )}
              >
                <span className={cn("size-1.5 rounded-full", stageStyle.border.replace("border-", "bg-"))} />
                {STAGE_LABELS[deal.stage] || deal.stage}
              </span>
            </div>
            {deal.industry && (
              <p className="text-sm text-text-muted mt-0.5">{deal.industry}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Team avatars */}
          {deal.team && deal.team.length > 0 && (
            <div className="flex -space-x-2 mr-2">
              {deal.team.slice(0, 4).map((m) => (
                <div
                  key={m.id}
                  className="size-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-semibold text-primary"
                  title={m.name}
                >
                  {m.name?.[0]?.toUpperCase() || "?"}
                </div>
              ))}
              {deal.team.length > 4 && (
                <div className="size-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-semibold text-text-muted">
                  +{deal.team.length - 4}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => router.push(`/deals/${dealId}/edit`)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-text-secondary border border-border-subtle rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Edit
          </button>
        </div>
      </div>

      {/* Stage Pipeline */}
      <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-card">
        <div className="flex items-center gap-1">
          {PIPELINE_STAGES.map((stage, index) => {
            const isPast = currentStageIndex >= 0 && index < currentStageIndex;
            const isCurrent = index === currentStageIndex && !isTerminal;
            const isFuture = currentStageIndex < 0 || index > currentStageIndex || isTerminal;

            return (
              <div
                key={stage.key}
                className="flex-1 flex flex-col items-center relative group cursor-pointer"
                onClick={() => handleStageClick(stage.key)}
              >
                <div className="flex items-center w-full">
                  {index > 0 && (
                    <div
                      className={cn(
                        "flex-1 h-0.5",
                        isPast || isCurrent ? "bg-emerald-500" : "bg-gray-200"
                      )}
                    />
                  )}
                  {index === 0 && <div className="flex-1" />}
                  <div
                    className={cn(
                      "size-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-110",
                      isPast && "bg-emerald-500 text-white",
                      isCurrent &&
                        "bg-primary text-white ring-2 ring-primary/30 shadow-lg",
                      isFuture && !isCurrent && "bg-gray-100 text-gray-400"
                    )}
                  >
                    {isPast ? (
                      <span className="material-symbols-outlined text-sm">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">{stage.icon}</span>
                    )}
                  </div>
                  {index < PIPELINE_STAGES.length - 1 ? (
                    <div
                      className={cn(
                        "flex-1 h-0.5",
                        isPast ? "bg-emerald-500" : "bg-gray-200"
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] mt-1.5 text-center leading-tight whitespace-nowrap",
                    isPast && "text-emerald-600 font-medium",
                    isCurrent && "text-primary font-bold",
                    isFuture && !isCurrent && "text-gray-400"
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle">
        {TABS.map((tab) => (
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

      {/* Tab Content */}
      {activeTab === "Overview" && <OverviewTab deal={deal} />}
      {activeTab === "Documents" && (
        <DocumentsTab
          documents={documents}
          uploading={uploading}
          fileInputRef={fileInputRef}
          onUpload={handleUpload}
        />
      )}
      {activeTab === "Chat" && (
        <ChatTab
          messages={messages}
          chatInput={chatInput}
          setChatInput={setChatInput}
          chatSending={chatSending}
          onSend={sendMessage}
          chatEndRef={chatEndRef}
        />
      )}
      {activeTab === "Activity" && (
        <ActivityTab activities={activities} loading={activitiesLoading} />
      )}

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
          onClose={() => { setStageModal(null); setStageError(""); }}
        />
      )}
    </div>
  );
}
