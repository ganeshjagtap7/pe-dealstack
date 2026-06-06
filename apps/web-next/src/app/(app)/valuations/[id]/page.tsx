"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, NotFoundError } from "@/lib/api";
import { authFetchRaw } from "@/app/(app)/deal-intake/components";
import { useToast } from "@/providers/ToastProvider";
import {
  computeLBO,
  type AssumptionKey,
  type LBOAssumptions,
  type LBOOutputs,
} from "@/lib/lbo-model";
import { LBOGrid } from "./lbo-grid";
import { ChatPanel, type ChatMessage } from "./chat-panel";

interface ModelResponse {
  id: string;
  name: string;
  type: string;
  assumptions: LBOAssumptions;
  outputs: LBOOutputs;
  createdAt: string;
  updatedAt: string;
}

interface ChatResponse {
  role: "assistant";
  content: string;
  timestamp: string;
  action?: "applied";
  changedKeys?: AssumptionKey[];
  modelState?: ModelResponse;
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function ValuationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const id = params?.id;

  const [model, setModel] = useState<ModelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [highlightedKeys, setHighlightedKeys] = useState<AssumptionKey[]>([]);
  const [exporting, setExporting] = useState(false);

  // Debounced save state for cell edits
  const pendingPatch = useRef<Partial<LBOAssumptions>>({});
  const patchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Initial load ─────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [modelRes, msgsRes] = await Promise.all([
          api.get<ModelResponse>(`/valuations/${id}`),
          api.get<{ items: MessageRow[] }>(`/valuations/${id}/messages`).catch(() => ({ items: [] as MessageRow[] })),
        ]);
        if (cancelled) return;
        setModel(modelRes);
        setName(modelRes.name);
        setChatMessages(
          (msgsRes.items || []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: formatTimeShort(m.createdAt),
          })),
        );
      } catch (err) {
        if (err instanceof NotFoundError) {
          showToast("Model not found.", "error");
          router.replace("/valuations");
        } else {
          showToast("Couldn't load this model.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router, showToast]);

  // ─── Cell edit (debounced PATCH) ──────────────────────────────
  const onChangeAssumption = useCallback(
    (key: AssumptionKey, value: number) => {
      setModel((prev) => {
        if (!prev) return prev;
        const nextAssumptions = { ...prev.assumptions, [key]: value };
        return {
          ...prev,
          assumptions: nextAssumptions,
          outputs: computeLBO(nextAssumptions),
        };
      });
      pendingPatch.current[key] = value;
      if (patchTimer.current) clearTimeout(patchTimer.current);
      patchTimer.current = setTimeout(async () => {
        const changes = pendingPatch.current;
        pendingPatch.current = {};
        try {
          await api.patch(`/valuations/${id}`, { assumptions: changes });
        } catch {
          showToast("Couldn't save changes.", "error");
        }
      }, 500);
    },
    [id, showToast],
  );

  // Flush on unmount so the last edit isn't lost
  useEffect(() => {
    return () => {
      if (patchTimer.current && Object.keys(pendingPatch.current).length > 0) {
        const changes = pendingPatch.current;
        pendingPatch.current = {};
        clearTimeout(patchTimer.current);
        api.patch(`/valuations/${id}`, { assumptions: changes }).catch(() => {});
      }
    };
  }, [id]);

  // ─── Name editing ─────────────────────────────────────────────
  const onCommitName = async () => {
    if (!model) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === model.name) {
      setName(model.name);
      return;
    }
    setSavingName(true);
    try {
      await api.patch(`/valuations/${id}`, { name: trimmed });
      setModel((prev) => (prev ? { ...prev, name: trimmed } : prev));
    } catch {
      showToast("Couldn't rename model.", "error");
      setName(model.name);
    } finally {
      setSavingName(false);
    }
  };

  // ─── Excel export ─────────────────────────────────────────────
  const onExportExcel = async () => {
    if (!model || exporting) return;
    setExporting(true);
    try {
      const res = await authFetchRaw(`/valuations/${id}/export.xlsx`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ||
        `${(model.name || "lbo-model").replace(/[^a-z0-9-_ ]/gi, "_")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Couldn't export to Excel.", "error");
    } finally {
      setExporting(false);
    }
  };

  // ─── Chat send ────────────────────────────────────────────────
  const onSend = async () => {
    const content = chatInput.trim();
    if (!content || !model || chatSending) return;
    setChatInput("");
    const now = new Date();
    setChatMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content, timestamp: formatTimeShort(now.toISOString()) },
    ]);
    setChatSending(true);
    try {
      const res = await api.post<ChatResponse>(`/valuations/${id}/chat`, { content });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: res.content,
          timestamp: res.timestamp ? formatTimeShort(res.timestamp) : "Now",
        },
      ]);
      if (res.action === "applied" && res.modelState) {
        setModel(res.modelState);
        setHighlightedKeys(res.changedKeys || []);
        const changedCount = res.changedKeys?.length || 0;
        showToast(
          changedCount === 1
            ? `Updated ${res.changedKeys?.[0]}`
            : `Updated ${changedCount} assumptions`,
          "success",
        );
        // Clear highlight after a few seconds
        setTimeout(() => setHighlightedKeys([]), 3500);
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: "Sorry, I hit an error. Please try again.",
          timestamp: "Now",
        },
      ]);
    } finally {
      setChatSending(false);
    }
  };

  if (loading || !model) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/valuations"
            className="inline-flex size-8 items-center justify-center rounded-lg text-text-secondary hover:bg-slate-100 hover:text-text-primary"
            title="Back to all models"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={onCommitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              else if (e.key === "Escape") {
                setName(model.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-lg font-semibold text-text-primary outline-none hover:bg-slate-50 focus:bg-slate-50 focus:ring-1 focus:ring-primary"
          />
          {savingName && <span className="text-xs text-text-secondary">Saving…</span>}
        </div>
        <div className="flex items-center gap-4 shrink-0 text-sm">
          <Headline label="MOIC" value={`${model.outputs.returns.moic.toFixed(2)}x`} />
          <Headline label="IRR" value={`${(model.outputs.returns.irr * 100).toFixed(1)}%`} />
          <Headline label="Equity" value={`$${model.outputs.returns.equityInvested.toFixed(1)}M`} muted />
          <button
            type="button"
            onClick={onExportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-text-secondary shadow-sm hover:bg-slate-50 hover:text-text-primary disabled:opacity-60"
            title="Download as Excel"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {exporting ? "Exporting…" : "Excel"}
          </button>
        </div>
      </header>

      {/* Body: grid + chat */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <LBOGrid
            assumptions={model.assumptions}
            outputs={model.outputs}
            highlightedKeys={highlightedKeys}
            onChangeAssumption={onChangeAssumption}
          />
        </div>
        <ChatPanel
          messages={chatMessages}
          input={chatInput}
          setInput={setChatInput}
          sending={chatSending}
          onSend={onSend}
        />
      </div>
    </div>
  );
}

function Headline({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </span>
      <span
        className="font-mono tabular-nums text-base font-semibold"
        style={muted ? undefined : { color: "#003366" }}
      >
        {value}
      </span>
    </div>
  );
}

function formatTimeShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "Now";
  }
}
