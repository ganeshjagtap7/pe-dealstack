"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PasteKeyModal, type PasteKeyInstructions } from "./IntegrationsSection.PasteKeyModal";

interface ProviderCatalogEntry {
  id: string;
  name: string;
  desc: string;
  icon: string;
  available: boolean;
}

const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  { id: "granola",         name: "Granola",         desc: "Auto-import meeting transcripts",        icon: "mic",         available: true },
  { id: "gmail",           name: "Gmail",           desc: "Sync deal-related emails",               icon: "mail",        available: true },
  { id: "google_calendar", name: "Google Calendar", desc: "Pre-meeting briefs & timeline",          icon: "event",       available: true },
  { id: "fireflies",       name: "Fireflies",       desc: "Auto-import meeting transcripts",        icon: "mic",         available: false },
  { id: "otter",           name: "Otter",           desc: "Auto-import meeting transcripts",        icon: "graphic_eq",  available: false },
];

type IntegrationStatus = "connected" | "token_expired" | "error" | "revoked";

interface Integration {
  id: string;
  provider: string;
  status: IntegrationStatus;
  externalAccountEmail?: string | null;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
}

interface InitiateAuthResponse {
  mode: "oauth" | "api_key";
  authUrl?: string;
  state?: string;
  instructions?: PasteKeyInstructions;
}

const STATUS_BADGE: Record<IntegrationStatus, { bg: string; fg: string; label: string }> = {
  connected:     { bg: "#ECFDF5", fg: "#047857", label: "Connected" },
  token_expired: { bg: "#FFFBEB", fg: "#92400E", label: "Reconnect needed" },
  error:         { bg: "#FEF2F2", fg: "#991B1B", label: "Error" },
  revoked:       { bg: "#F3F4F6", fg: "#374151", label: "Disconnected" },
};

interface Props {
  onToast: (message: string, type: "success" | "error") => void;
}

export function IntegrationsSection({ onToast }: Props) {
  const search = useSearchParams();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [pasteModal, setPasteModal] = useState<{ provider: string; instructions: PasteKeyInstructions } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<Integration | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ integrations: Integration[] }>("/integrations");
      setIntegrations(res.integrations ?? []);
    } catch (err) {
      console.warn("[settings/integrations] load failed:", err);
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Surface OAuth callback result via toast (the API redirects here with
  // ?integrations=connected|error&provider=...).
  useEffect(() => {
    const status = search.get("integrations");
    const provider = search.get("provider");
    if (!status || !provider) return;
    const label = PROVIDER_CATALOG.find((p) => p.id === provider)?.name ?? provider;
    if (status === "connected") onToast(`${label} connected`, "success");
    else if (status === "error") onToast(`${label} could not be connected. Please try again.`, "error");
    // Reload list so the connected status badge appears.
    load();
  }, [search, load, onToast]);

  async function handleConnect(provider: string) {
    setBusyProvider(provider);
    try {
      const result = await api.post<InitiateAuthResponse>(`/integrations/${provider}/connect`, {});
      if (result.mode === "oauth" && result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      if (result.mode === "api_key" && result.instructions) {
        setPasteModal({ provider, instructions: result.instructions });
        setBusyProvider(null);
        return;
      }
      throw new Error("Unsupported auth response from server");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message :
        err instanceof Error ? err.message :
        "Could not start connection.";
      onToast(`Could not start connection: ${msg}`, "error");
      setBusyProvider(null);
    }
  }

  async function handleDisconnectConfirmed(integration: Integration) {
    setConfirmDisconnect(null);
    setBusyProvider(integration.provider);
    try {
      await api.delete(`/integrations/${integration.id}`);
      onToast("Integration disconnected", "success");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Disconnect failed";
      onToast(`Disconnect failed: ${msg}`, "error");
    } finally {
      setBusyProvider(null);
    }
  }

  async function handleSyncNow(integration: Integration) {
    setBusyProvider(integration.provider);
    try {
      await api.post(`/integrations/${integration.id}/sync`, {});
      onToast("Sync started", "success");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      onToast(`Sync failed: ${msg}`, "error");
    } finally {
      setBusyProvider(null);
    }
  }

  // Filter out revoked rows so users see "Not connected" again, and pick
  // the most recent (non-revoked) row per provider.
  const byProvider = new Map<string, Integration>();
  for (const row of integrations) {
    if (row.status === "revoked") continue;
    if (!byProvider.has(row.provider)) byProvider.set(row.provider, row);
  }

  return (
    <section
      id="section-integrations"
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
    >
      <div className="px-6 py-5 border-b border-border-subtle flex items-center gap-3">
        <div className="p-2 bg-primary-light rounded-lg text-primary border border-primary/20">
          <span className="material-symbols-outlined text-[20px] block">extension</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-text-main">Integrations</h2>
          <p className="text-xs text-text-muted">
            Connect Granola, Gmail, and Google Calendar so meetings, emails, and events auto-link to deals and contacts.
          </p>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-sm text-text-muted">Loading integrations...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDER_CATALOG.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                integration={byProvider.get(p.id) ?? null}
                busy={busyProvider === p.id}
                onConnect={() => handleConnect(p.id)}
                onDisconnect={(i) => setConfirmDisconnect(i)}
                onSyncNow={(i) => handleSyncNow(i)}
              />
            ))}
          </div>
        )}
      </div>

      {pasteModal && (
        <PasteKeyModal
          provider={pasteModal.provider}
          instructions={pasteModal.instructions}
          onClose={() => setPasteModal(null)}
          onConnected={() => {
            const name = PROVIDER_CATALOG.find((p) => p.id === pasteModal.provider)?.name ?? pasteModal.provider;
            setPasteModal(null);
            onToast(`${name} connected`, "success");
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDisconnect}
        title="Disconnect integration?"
        message="Past data stays in your CRM, but no new items will sync. You can reconnect anytime."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => confirmDisconnect && handleDisconnectConfirmed(confirmDisconnect)}
        onCancel={() => setConfirmDisconnect(null)}
      />
    </section>
  );
}

interface CardProps {
  provider: ProviderCatalogEntry;
  integration: Integration | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: (i: Integration) => void;
  onSyncNow: (i: Integration) => void;
}

function ProviderCard({ provider, integration, busy, onConnect, onDisconnect, onSyncNow }: CardProps) {
  const isComingSoon = !provider.available;
  const badge = integration ? STATUS_BADGE[integration.status] : null;
  const ctaDisabled = busy || (!integration && isComingSoon);
  const ctaLabel = busy
    ? "Working…"
    : integration
      ? "Disconnect"
      : isComingSoon
        ? "Coming soon"
        : "Connect";
  const ctaStyle: React.CSSProperties = integration
    ? { backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FCA5A5" }
    : { backgroundColor: "#003366", color: "#fff" };

  return (
    <div className="bg-white border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#E6EEF5", color: "#003366" }}
          >
            <span className="material-symbols-outlined">{provider.icon}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-main truncate">{provider.name}</div>
            <div className="text-xs text-text-muted truncate">{provider.desc}</div>
          </div>
        </div>
        {badge ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold shrink-0"
            style={{ backgroundColor: badge.bg, color: badge.fg }}
          >
            {badge.label}
          </span>
        ) : (
          <span className="text-xs text-text-muted shrink-0">Not connected</span>
        )}
      </div>

      {integration?.externalAccountEmail && (
        <div className="text-xs text-text-muted truncate">
          Connected as {integration.externalAccountEmail}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="text-xs text-text-muted truncate">
          {integration?.lastSyncAt
            ? `Last sync: ${new Date(integration.lastSyncAt).toLocaleString()}`
            : ""}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {integration && (
            <button
              type="button"
              onClick={() => onSyncNow(integration)}
              disabled={busy}
              className="text-xs font-semibold rounded-md px-3 py-1.5 border border-border-subtle bg-white text-text-secondary hover:bg-gray-50 disabled:opacity-50"
            >
              Sync now
            </button>
          )}
          <button
            type="button"
            onClick={() => (integration ? onDisconnect(integration) : onConnect())}
            disabled={ctaDisabled}
            className={`text-xs font-semibold rounded-md px-3 py-1.5 transition-opacity ${
              ctaDisabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"
            }`}
            style={ctaStyle}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
