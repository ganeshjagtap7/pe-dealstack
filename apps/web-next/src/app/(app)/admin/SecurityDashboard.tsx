"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// Customer security dashboard. Aggregates 6 metrics from existing audit
// log + user/session data into a single 6-card grid for compliance
// officers. Admin/partner/principal-only (server-enforced; the parent
// admin page already gates on these roles).

interface RecentAdminAction {
  action: string;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}

interface TopDeal {
  dealId: string;
  dealName: string | null;
  views: number;
  uniqueViewers: number;
}

interface SecurityDashboardData {
  windowDays: number;
  activeSessions: number | null;
  members: {
    total: number;
    mfaEnrolled: number | null;
    mfaPercent: number | null;
    requireMFA: boolean;
  };
  staffAccess: { windowDays: number; count: number | null };
  failedLogins: { windowDays: number; count: number | null };
  adminActions: { windowDays: number; total: number; recent: RecentAdminAction[] };
  topDeals: TopDeal[];
}

function relTime(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (Number.isNaN(ms)) return ts;
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    USER_INVITED: "Invited a user",
    USER_ROLE_CHANGED: "Changed a user role",
    USER_DELETED: "Removed a user",
    SETTINGS_CHANGED: "Changed settings",
    ORG_MFA_REQUIRED: "Enabled org-wide 2FA",
    ORG_MFA_NOT_REQUIRED: "Disabled org-wide 2FA",
    SECURITY_TEST_RUN: "Ran isolation test",
    STAFF_WEBHOOK_TEST: "Updated staff-access notifications",
  };
  return map[action] ?? action;
}

function MetricCard({
  title,
  value,
  caption,
  variant,
  children,
}: {
  title: string;
  value?: string | number | null;
  caption?: string;
  variant?: "default" | "good" | "warn";
  children?: React.ReactNode;
}) {
  const ringColor =
    variant === "good"
      ? "border-green-200 bg-green-50"
      : variant === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-border-subtle bg-white";

  return (
    <div className={`p-5 rounded-xl border ${ringColor} flex flex-col gap-2`}>
      <p className="text-xs font-bold text-text-muted uppercase tracking-wider">
        {title}
      </p>
      {value !== undefined && (
        <p
          className="text-3xl font-bold leading-none"
          style={{ color: "#003366" }}
        >
          {value === null ? (
            <span className="text-base font-medium text-text-muted">
              Unavailable
            </span>
          ) : (
            value
          )}
        </p>
      )}
      {caption ? (
        <p className="text-xs text-text-muted">{caption}</p>
      ) : null}
      {children}
    </div>
  );
}

export function SecurityDashboard() {
  const [data, setData] = useState<SecurityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<SecurityDashboardData>(
        "/admin/security/dashboard",
      );
      setData(result);
    } catch (err) {
      console.warn("[admin/security-dashboard] load failed:", err);
      setError("Couldn't load security dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && data === null) {
    return (
      <div className="rounded-xl p-5 bg-white border border-border-subtle">
        <p className="text-sm text-text-muted">Loading security dashboard...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl p-5 bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center justify-between">
        <span>{error ?? "No data."}</span>
        <button
          type="button"
          onClick={load}
          className="text-xs font-semibold underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const failedLoginsCritical =
    typeof data.failedLogins.count === "number" && data.failedLogins.count > 10;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              dashboard
            </span>
            Security overview
          </h2>
          <p className="text-xs text-text-muted">
            Your firm&apos;s security posture at a glance.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-xs text-primary hover:text-primary-hover font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. Active sessions */}
        <MetricCard
          title="Active sessions"
          value={data.activeSessions}
          caption={
            data.activeSessions === null
              ? "Active session counts require Supabase auth schema to be exposed."
              : data.activeSessions === 1
                ? "1 device signed in across your team"
                : `${data.activeSessions} devices signed in across your team`
          }
        />

        {/* 2. MFA enrollment */}
        <MetricCard
          title="Members"
          value={data.members.total}
          caption={
            data.members.requireMFA
              ? "Org-wide 2FA: required ✓"
              : "Org-wide 2FA: optional"
          }
        >
          <a
            href="/settings#section-team"
            className="text-[10px] uppercase tracking-wide font-semibold mt-1"
            style={{ color: "#003366" }}
          >
            Manage in Settings →
          </a>
        </MetricCard>

        {/* 3. Pocket Fund staff access */}
        <MetricCard
          title="Pocket Fund staff access"
          value={data.staffAccess.count ?? 0}
          caption={`In the last ${data.staffAccess.windowDays} days. Real-time entries appear in Settings → Security.`}
          variant={(data.staffAccess.count ?? 0) === 0 ? "good" : "warn"}
        />

        {/* 4. Failed logins */}
        <MetricCard
          title="Failed logins"
          value={data.failedLogins.count ?? 0}
          caption={`In the last ${data.failedLogins.windowDays} days.`}
          variant={failedLoginsCritical ? "warn" : "default"}
        />

        {/* 5. Admin actions */}
        <MetricCard
          title={`Admin actions (${data.adminActions.windowDays}d)`}
          value={data.adminActions.total}
          caption={`Recent invites, role changes, and settings updates.`}
        >
          {data.adminActions.recent.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-[11px]">
              {data.adminActions.recent.slice(0, 3).map((a) => (
                <li
                  key={a.createdAt + a.action}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="text-text-main truncate">
                    <span className="font-semibold">
                      {a.userName ?? a.userEmail ?? "Someone"}
                    </span>{" "}
                    {actionLabel(a.action)}
                  </span>
                  <span className="text-text-muted whitespace-nowrap">
                    {relTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </MetricCard>

        {/* 6. Top viewed deals */}
        <MetricCard title="Most-viewed deals (30d)">
          {data.topDeals.length === 0 ? (
            <p className="text-xs text-text-muted">No deal views logged yet.</p>
          ) : (
            <ul className="mt-1 space-y-2 text-xs">
              {data.topDeals.slice(0, 3).map((d) => (
                <li key={d.dealId}>
                  <a
                    href={`/deals/${d.dealId}`}
                    className="font-semibold hover:underline truncate block"
                    style={{ color: "#003366" }}
                  >
                    {d.dealName ?? d.dealId}
                  </a>
                  <span className="text-text-muted">
                    {d.views} {d.views === 1 ? "view" : "views"} · {d.uniqueViewers}{" "}
                    {d.uniqueViewers === 1 ? "viewer" : "viewers"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </MetricCard>
      </div>
    </section>
  );
}
