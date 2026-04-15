"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatRelativeTime, formatFileSize, getDocIcon } from "@/lib/formatters";
import { STAGE_STYLES, STAGE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { useUser } from "@/providers/UserProvider";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DealDetail {
  id: string;
  name: string;
  companyName?: string;
  stage: string;
  industry?: string;
  dealSize?: number;
  revenue?: number;
  ebitda?: number;
  targetReturn?: number;
  evMultiple?: number;
  priority?: string;
  status?: string;
  aiThesis?: string;
  aiRisks?: { keyRisks?: string[]; investmentHighlights?: string[] };
  description?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  documents?: DocItem[];
  team?: TeamMember[];
}

interface DocItem {
  id: string;
  name: string;
  type?: string;
  fileSize?: number;
  createdAt: string;
  url?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface Activity {
  id: string;
  action: string;
  description?: string;
  userName?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage pipeline config (matches the constants used in the old app)
// ---------------------------------------------------------------------------

const PIPELINE_STAGES = [
  { key: "SOURCING", label: "Sourcing", icon: "search" },
  { key: "SCREENING", label: "Screening", icon: "filter_alt" },
  { key: "DILIGENCE", label: "Due Diligence", icon: "fact_check" },
  { key: "IC_REVIEW", label: "IC Review", icon: "groups" },
  { key: "CLOSING", label: "Closing", icon: "gavel" },
  { key: "CLOSED", label: "Closed", icon: "check_circle" },
];

const TERMINAL_STAGES = ["CLOSED", "PASSED"];

const TABS = ["Overview", "Documents", "Chat", "Activity"] as const;
type Tab = (typeof TABS)[number];

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

  const confirmStageChange = async () => {
    if (!stageModal || !deal) return;
    setStageChanging(true);
    try {
      const updated = await api.patch<DealDetail>(`/deals/${dealId}`, {
        stage: stageModal.to,
      });
      setDeal(updated);
      setStageModal(null);
    } catch {
      // keep modal open
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
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
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
          onConfirm={confirmStageChange}
          onClose={() => setStageModal(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({ deal }: { deal: DealDetail }) {
  const metrics = [
    { label: "Deal Size", value: formatCurrency(deal.dealSize), icon: "payments" },
    { label: "Revenue", value: formatCurrency(deal.revenue), icon: "trending_up" },
    { label: "EBITDA", value: formatCurrency(deal.ebitda), icon: "analytics" },
    {
      label: "Target Return",
      value: deal.targetReturn != null ? `${deal.targetReturn}%` : "N/A",
      icon: "target",
    },
    {
      label: "EV Multiple",
      value: deal.evMultiple != null ? `${deal.evMultiple}x` : "N/A",
      icon: "calculate",
    },
  ];

  const risks = deal.aiRisks?.keyRisks || [];
  const highlights = deal.aiRisks?.investmentHighlights || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column: metrics + thesis */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-surface-card border border-border-subtle rounded-lg p-3 shadow-card"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  {m.icon}
                </span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider">
                  {m.label}
                </span>
              </div>
              <p className="text-lg font-bold text-text-main">{m.value}</p>
            </div>
          ))}
        </div>

        {/* AI Thesis */}
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-primary">auto_awesome</span>
            <h3 className="text-sm font-semibold text-text-main">AI Investment Thesis</h3>
          </div>
          {deal.aiThesis ? (
            <p className="text-sm text-text-secondary leading-relaxed">{deal.aiThesis}</p>
          ) : (
            <p className="text-sm text-text-muted italic">
              No AI thesis generated yet. Upload documents and use the chat to analyze this deal.
            </p>
          )}
        </div>

        {/* Description */}
        {deal.description && (
          <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
            <h3 className="text-sm font-semibold text-text-main mb-3">Description</h3>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {deal.description}
            </p>
          </div>
        )}
      </div>

      {/* Right column: risks + highlights */}
      <div className="flex flex-col gap-6">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[20px] text-red-400">shield</span>
            <h3 className="text-sm font-semibold text-text-main">Key Risks</h3>
          </div>
          {risks.length === 0 && highlights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-text-muted">
              <span className="material-symbols-outlined text-2xl mb-2">shield</span>
              <p className="text-sm">No risks identified yet</p>
              <p className="text-xs mt-1">Upload documents or use AI chat to analyze risks</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {risks.map((risk, i) => (
                <li
                  key={i}
                  className={cn(
                    "bg-white border border-border-subtle p-3 rounded-lg",
                    i === 0 ? "border-l-2 border-l-red-400" : "border-l-2 border-l-orange-300"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "material-symbols-outlined text-base mt-0.5 shrink-0",
                        i === 0 ? "text-red-400" : "text-orange-400"
                      )}
                    >
                      {i === 0 ? "error" : "warning"}
                    </span>
                    <p className="text-xs text-text-secondary leading-snug">{risk}</p>
                  </div>
                </li>
              ))}
              {highlights.map((h, i) => (
                <li
                  key={`h-${i}`}
                  className="bg-white border border-border-subtle border-l-2 border-l-emerald-500 p-3 rounded-lg"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-emerald-500 text-base mt-0.5 shrink-0">
                      check_circle
                    </span>
                    <p className="text-xs text-text-secondary leading-snug">{h}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Deal info */}
        <div className="bg-surface-card border border-border-subtle rounded-xl p-5 shadow-card">
          <h3 className="text-sm font-semibold text-text-main mb-3">Deal Info</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text-main font-medium">{formatRelativeTime(deal.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Updated</dt>
              <dd className="text-text-main font-medium">{formatRelativeTime(deal.updatedAt)}</dd>
            </div>
            {deal.assignee && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Assignee</dt>
                <dd className="text-text-main font-medium">{deal.assignee}</dd>
              </div>
            )}
            {deal.priority && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Priority</dt>
                <dd className="text-text-main font-medium capitalize">{deal.priority}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents Tab
// ---------------------------------------------------------------------------

function DocumentsTab({
  documents,
  uploading,
  fileInputRef,
  onUpload,
}: {
  documents: DocItem[];
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-main">
          Documents ({documents.length})
        </h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">
              {uploading ? "progress_activity" : "upload_file"}
            </span>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
          <span className="material-symbols-outlined text-4xl text-text-muted">folder_open</span>
          <p className="mt-2 text-sm text-text-muted">No documents yet</p>
          <p className="text-xs text-text-muted mt-1">Upload files to get started</p>
        </div>
      ) : (
        <div className="bg-surface-card border border-border-subtle rounded-xl shadow-card divide-y divide-border-subtle">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="material-symbols-outlined text-[22px] text-text-muted">
                {getDocIcon(doc.name)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-main truncate">{doc.name}</p>
                <p className="text-xs text-text-muted">
                  {formatFileSize(doc.fileSize)}{" "}
                  {doc.createdAt && <>· {formatRelativeTime(doc.createdAt)}</>}
                </p>
              </div>
              {doc.url && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-text-muted hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">download</span>
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Tab
// ---------------------------------------------------------------------------

function ChatTab({
  messages,
  chatInput,
  setChatInput,
  chatSending,
  onSend,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatSending: boolean;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="flex flex-col bg-surface-card border border-border-subtle rounded-xl shadow-card overflow-hidden" style={{ height: "500px" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <span className="material-symbols-outlined text-4xl mb-2">auto_awesome</span>
            <p className="text-sm font-medium">AI Deal Assistant</p>
            <p className="text-xs mt-1">Ask questions about this deal, request analysis, or get insights.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3 max-w-[85%]",
              msg.role === "user" ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div
              className={cn(
                "size-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold",
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-purple-100 text-purple-700"
              )}
            >
              {msg.role === "user" ? "U" : "AI"}
            </div>
            <div
              className={cn(
                "rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-white"
                  : "bg-gray-50 border border-border-subtle text-text-main"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {chatSending && (
          <div className="flex gap-3">
            <div className="size-7 rounded-full bg-purple-100 flex items-center justify-center shrink-0 text-xs font-semibold text-purple-700">
              AI
            </div>
            <div className="bg-gray-50 border border-border-subtle rounded-lg px-3.5 py-2.5">
              <span className="material-symbols-outlined text-sm animate-spin text-text-muted">
                progress_activity
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border-subtle p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-lg border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main placeholder-text-muted resize-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            placeholder="Ask about this deal..."
            rows={1}
          />
          <button
            onClick={onSend}
            disabled={!chatInput.trim() || chatSending}
            className="p-2 rounded-lg text-white disabled:opacity-40 transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Tab
// ---------------------------------------------------------------------------

function ActivityTab({
  activities,
  loading,
}: {
  activities: Activity[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="text-center py-16 text-text-muted">
        <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
        <p className="mt-2 text-sm">Loading activity...</p>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
        <span className="material-symbols-outlined text-4xl text-text-muted">history</span>
        <p className="mt-2 text-sm text-text-muted">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border-subtle rounded-xl shadow-card p-5">
      <div className="relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border-subtle" />
        <div className="space-y-6">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-4 relative">
              <div className="size-6 rounded-full bg-blue-100 border-2 border-white z-10 shrink-0 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[12px] text-primary">circle</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-main">
                  {activity.userName && (
                    <span className="font-semibold">{activity.userName} </span>
                  )}
                  {activity.description || activity.action}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  {formatRelativeTime(activity.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stage Change Modal
// ---------------------------------------------------------------------------

function StageChangeModal({
  from,
  to,
  note,
  setNote,
  loading,
  onConfirm,
  onClose,
}: {
  from: string;
  to: string;
  note: string;
  setNote: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const fromLabel = STAGE_LABELS[from] || from;
  const toLabel = STAGE_LABELS[to] || to;
  const fromIdx = PIPELINE_STAGES.findIndex((s) => s.key === from);
  const toIdx = PIPELINE_STAGES.findIndex((s) => s.key === to);
  const isMovingBack = toIdx < fromIdx;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-5 border-b border-border-subtle">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-text-main text-lg flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">swap_horiz</span>
              Change Deal Stage
            </h3>
            <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
        <div className="p-5">
          <div className="flex items-center justify-center gap-4 mb-5">
            <div className="text-center">
              <div className="size-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                <span className="material-symbols-outlined text-gray-500">circle</span>
              </div>
              <span className="text-sm font-medium text-text-secondary">{fromLabel}</span>
            </div>
            <span
              className={cn(
                "material-symbols-outlined text-2xl",
                isMovingBack ? "text-amber-500" : "text-primary"
              )}
            >
              {isMovingBack ? "arrow_back" : "arrow_forward"}
            </span>
            <div className="text-center">
              <div
                className={cn(
                  "size-12 rounded-full flex items-center justify-center mx-auto mb-2",
                  isMovingBack ? "bg-amber-100" : "bg-blue-50"
                )}
              >
                <span
                  className={cn(
                    "material-symbols-outlined",
                    isMovingBack ? "text-amber-600" : "text-primary"
                  )}
                >
                  circle
                </span>
              </div>
              <span
                className={cn(
                  "text-sm font-bold",
                  isMovingBack ? "text-amber-600" : "text-primary"
                )}
              >
                {toLabel}
              </span>
            </div>
          </div>

          {isMovingBack && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">
                  warning
                </span>
                <p className="text-sm text-amber-700">
                  You are moving this deal backwards in the pipeline. This will be logged in the
                  activity feed.
                </p>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-text-main mb-2">
              Add a note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary resize-none"
              rows={2}
              placeholder="Reason for stage change..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border-subtle rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium text-sm disabled:opacity-60 transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              {loading ? "Updating..." : "Confirm Change"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
