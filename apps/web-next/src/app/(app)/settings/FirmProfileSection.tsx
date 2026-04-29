"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────────────

interface FirmProfileData {
  firmName?: string;
  description?: string;
  headquarters?: string;
  founded?: string;
  aum?: string;
  investmentFocus?: string[] | string;
  sectorFocus?: string[] | string;
  dealSize?: string;
  notableDeals?: string[] | string;
  teamSize?: string;
  website?: string;
}

interface UserMeResponse {
  organization?: {
    website?: string;
    settings?: {
      firmProfile?: FirmProfileData;
      firmWebsite?: string;
      firmLinkedin?: string;
    };
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function toDisplayValue(value: string[] | string | undefined): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

const FIELDS: { label: string; key: keyof FirmProfileData }[] = [
  { label: "Firm Name", key: "firmName" },
  { label: "Description", key: "description" },
  { label: "Headquarters", key: "headquarters" },
  { label: "Founded", key: "founded" },
  { label: "AUM", key: "aum" },
  { label: "Investment Focus", key: "investmentFocus" },
  { label: "Sector Focus", key: "sectorFocus" },
  { label: "Deal Size", key: "dealSize" },
  { label: "Notable Deals", key: "notableDeals" },
  { label: "Team Size", key: "teamSize" },
  { label: "Website", key: "website" },
];

// ─── Component ──────────────────────────────────────────────────────

export function FirmProfileSection() {
  const [firmProfile, setFirmProfile] = useState<FirmProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{
    type: "success" | "error" | "loading";
    text: string;
  } | null>(null);

  // org data for refresh call
  const [orgWebsite, setOrgWebsite] = useState("");
  const [orgLinkedin, setOrgLinkedin] = useState("");

  const loadFirmProfile = useCallback(async () => {
    try {
      const data = await api.get<UserMeResponse>("/users/me");
      const orgSettings = data?.organization?.settings || {};
      setFirmProfile(orgSettings.firmProfile || null);
      setOrgWebsite(orgSettings.firmWebsite || data?.organization?.website || "");
      setOrgLinkedin(orgSettings.firmLinkedin || "");
      setLoadError(false);
    } catch (err) {
      console.warn("[settings/firm-profile] failed to load:", err);
      setFirmProfile(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirmProfile();
  }, [loadFirmProfile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshStatus({
      type: "loading",
      text: "Researching your firm (15-25 seconds)...",
    });

    try {
      const result = await api.post<{ success: boolean; error?: string }>(
        "/onboarding/enrich-firm",
        {
          websiteUrl: orgWebsite,
          linkedinUrl: orgLinkedin,
        },
      );

      if (result.success) {
        setRefreshStatus({
          type: "success",
          text: "Profile refreshed successfully",
        });
        // Reload the firm profile data after a short delay
        setTimeout(() => {
          loadFirmProfile();
          setRefreshStatus(null);
        }, 1500);
      } else {
        setRefreshStatus({
          type: "error",
          text: result.error || "Refresh failed. Try again.",
        });
      }
    } catch (err) {
      console.warn("[settings/firm-profile] enrich-firm failed:", err);
      setRefreshStatus({
        type: "error",
        text: "Refresh failed. Try again.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const displayFields = firmProfile
    ? FIELDS.map((f) => ({
        label: f.label,
        value: toDisplayValue(
          firmProfile[f.key] as string | string[] | undefined,
        ),
      })).filter((f) => f.value)
    : [];

  return (
    <section
      id="section-firm-profile"
      className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
    >
      <div className="px-6 py-5 border-b border-border-subtle flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-light rounded-lg text-primary border border-primary/20">
            <span className="material-symbols-outlined text-[20px] block">domain</span>
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main">Firm Profile</h2>
            <p className="text-xs text-text-muted">
              AI-researched profile of your firm. Used as context across deal analysis.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {refreshStatus && (
            <div
              className={`text-sm flex items-center gap-2 ${
                refreshStatus.type === "success"
                  ? "text-green-600"
                  : refreshStatus.type === "error"
                    ? "text-red-500"
                    : "text-primary"
              }`}
            >
              {refreshStatus.type === "loading" && (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
              {refreshStatus.type === "success" && (
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              )}
              {refreshStatus.text}
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border-subtle hover:bg-gray-50 transition-colors shadow-sm text-primary disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Refresh profile
          </button>
        </div>
      </div>
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-text-muted">Loading firm profile...</p>
        ) : loadError ? (
          <p className="text-sm text-text-muted">Could not load firm profile.</p>
        ) : !firmProfile || displayFields.length === 0 ? (
          <p className="text-sm text-text-muted">
            {firmProfile
              ? 'No firm profile data available. Click "Refresh profile" to generate one.'
              : 'No firm profile yet. Click "Refresh profile" to generate one using AI research.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayFields.map((field) => (
              <div key={field.label}>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">
                  {field.label}
                </p>
                <p className="text-sm text-text-main">{field.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
