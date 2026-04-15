"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { SecuritySection } from "./SecuritySection";
import { PreferencesSection, type PrefsState } from "./PreferencesSection";

// ─── Types ──────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  firmName: string;
  role: string;
  avatar: string;
  preferences?: Record<string, unknown> | string;
}

// ─── Constants ──────────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { key: "DEAL_UPDATE", label: "Deal Updates", description: "When deal data or stage changes", icon: "trending_up" },
  { key: "DOCUMENT_UPLOADED", label: "Document Uploads", description: "When new files are added to a data room", icon: "upload_file" },
  { key: "MENTION", label: "Mentions", description: "When someone mentions you in a comment", icon: "alternate_email" },
  { key: "AI_INSIGHT", label: "AI Insights", description: "When the AI generates new analysis or flags", icon: "auto_awesome" },
  { key: "TASK_ASSIGNED", label: "Task Assignments", description: "When a task is assigned to you", icon: "task_alt" },
  { key: "COMMENT", label: "Comments", description: "When someone comments on your deals or memos", icon: "comment" },
] as const;

const NAV_SECTIONS = [
  { id: "general", label: "General", icon: "person" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "preferences", label: "Preferences", icon: "tune" },
  { id: "notifications", label: "Notifications", icon: "notifications" },
] as const;

const DEFAULT_NOTIFICATION_PREFS: Record<string, boolean> = {
  DEAL_UPDATE: true,
  DOCUMENT_UPLOADED: true,
  MENTION: true,
  AI_INSIGHT: true,
  TASK_ASSIGNED: true,
  COMMENT: true,
};

const DEFAULT_PREFS: PrefsState = {
  investmentFocus: [],
  sourcingSensitivity: 50,
  preferredCurrency: "USD",
  autoExtract: true,
  autoUpdateDeal: false,
  density: "default",
  theme: "light",
};

// ─── Helpers ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Analyst",
};

function getRoleLabel(role: string | undefined): string {
  return ROLE_LABELS[role || ""] || role || "Member";
}

function getInitials(name: string | undefined): string {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function parsePrefs(raw: UserProfile["preferences"]): {
  prefs: PrefsState;
  notifications: Record<string, boolean>;
} {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === "object") {
    obj = raw;
  }
  const prefs: PrefsState = {
    investmentFocus: Array.isArray(obj.investmentFocus) ? (obj.investmentFocus as string[]) : [],
    sourcingSensitivity:
      typeof obj.sourcingSensitivity === "number" ? obj.sourcingSensitivity : 50,
    preferredCurrency: typeof obj.preferredCurrency === "string" ? obj.preferredCurrency : "USD",
    autoExtract: typeof obj.autoExtract === "boolean" ? obj.autoExtract : true,
    autoUpdateDeal: typeof obj.autoUpdateDeal === "boolean" ? obj.autoUpdateDeal : false,
    density: typeof obj.density === "string" ? obj.density : "default",
    theme: typeof obj.theme === "string" ? obj.theme : "light",
  };
  const notifsRaw = obj.notifications;
  const notifications =
    notifsRaw && typeof notifsRaw === "object"
      ? { ...DEFAULT_NOTIFICATION_PREFS, ...(notifsRaw as Record<string, boolean>) }
      : DEFAULT_NOTIFICATION_PREFS;
  return { prefs, notifications };
}

// ─── Page ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { refetch: refetchUser } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [activeSection, setActiveSection] = useState<string>("general");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [prefs, setPrefs] = useState<PrefsState>(DEFAULT_PREFS);
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>(
    DEFAULT_NOTIFICATION_PREFS,
  );

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const markChanged = () => setHasChanges(true);

  const applyProfile = useCallback((data: UserProfile) => {
    setProfile(data);
    setName(data.name || "");
    setTitle(data.title || "");
    const { prefs: parsed, notifications } = parsePrefs(data.preferences);
    setPrefs(parsed);
    setNotificationPrefs(notifications);
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.get<UserProfile>("/users/me");
      applyProfile(data);
    } catch (err) {
      console.warn("[settings] load failed:", err);
      showToast(err instanceof Error ? err.message : "Failed to load profile", "error");
    } finally {
      setLoading(false);
    }
  }, [applyProfile, showToast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Observe sections to highlight the active nav link while scrolling
  useEffect(() => {
    const sectionIds = NAV_SECTIONS.map((s) => `section-${s.id}`);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = visible.target.id.replace("section-", "");
          setActiveSection(id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        title: title.trim(),
        preferences: {
          ...prefs,
          notifications: notificationPrefs,
        },
      };
      const updated = await api.patch<UserProfile>("/users/me", payload);
      applyProfile(updated);
      setHasChanges(false);
      showToast("Changes saved successfully", "success");
      refetchUser();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (!hasChanges) return;
    if (!window.confirm("Discard unsaved changes?")) return;
    if (profile) applyProfile(profile);
    setHasChanges(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be less than 5MB", "error");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      showToast("Only JPEG, PNG, GIF, and WebP images are allowed", "error");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const supabase = createClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to upload avatar");
      }
      const updated: UserProfile = await res.json();
      applyProfile(updated);
      showToast("Avatar updated", "success");
      refetchUser();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to upload avatar", "error");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleDeactivate = () => {
    if (!window.confirm("Are you sure you want to deactivate your account?")) return;
    showToast("Account deactivation is not available in this version", "error");
  };

  const updatePrefs = (patch: Partial<PrefsState>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
    markChanged();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-text-muted">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all border",
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-red-50 text-red-700 border-red-200",
          )}
        >
          <span className="material-symbols-outlined text-[18px]">
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          {toast.message}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm text-text-muted mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">
              Dashboard
            </Link>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="text-text-main font-medium">Settings</span>
          </div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">
            User Profile &amp; Personalization
          </h1>
          <p className="text-text-secondary text-sm">
            Configure your professional identity and tune the platform&apos;s AI behavior.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={!hasChanges}
            className="px-4 py-2.5 bg-white border border-border-subtle text-text-main text-sm font-semibold rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-card disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-lg shadow-card transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving && (
              <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
            )}
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 shrink-0">
          <nav className="sticky top-6 flex flex-col gap-1">
            {NAV_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <a
                  key={section.id}
                  href={`#section-${section.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const target = document.getElementById(`section-${section.id}`);
                    if (target) {
                      target.scrollIntoView({ behavior: "smooth", block: "start" });
                      history.replaceState(null, "", `#${section.id}`);
                    }
                    setActiveSection(section.id);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all",
                    isActive
                      ? "bg-primary-light text-primary border-primary"
                      : "border-transparent text-text-secondary hover:bg-primary-light hover:text-primary",
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                  >
                    {section.icon}
                  </span>
                  <span className="text-sm font-medium">{section.label}</span>
                </a>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* General — profile */}
          <section
            id="section-general"
            className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
          >
            <div className="p-6 border-b border-border-subtle bg-gradient-to-r from-white to-gray-50/50">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="relative group">
                  <div
                    className="w-24 h-24 rounded-full bg-cover bg-center border-4 border-white shadow-card-hover bg-primary flex items-center justify-center text-white text-2xl font-bold"
                    style={
                      profile?.avatar
                        ? {
                            backgroundImage: `url('${profile.avatar}')`,
                          }
                        : undefined
                    }
                  >
                    {!profile?.avatar && getInitials(profile?.name)}
                  </div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary-hover transition-colors border-2 border-white"
                    aria-label="Change avatar"
                  >
                    <span className="material-symbols-outlined text-[14px] block">photo_camera</span>
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-xl font-bold text-text-main">
                    {profile?.name || "User"}
                  </h3>
                  <p className="text-text-secondary font-medium mb-3">
                    {profile?.title || "Team Member"}
                    {profile?.firmName ? ` • ${profile.firmName}` : ""}
                  </p>
                  <div className="flex justify-center sm:justify-start gap-2 flex-wrap">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-primary-light text-primary border border-primary/20">
                      {getRoleLabel(profile?.role)}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider bg-secondary-light text-secondary border border-secondary/20">
                      <span className="material-symbols-outlined text-[12px] mr-1">verified</span>
                      Verified
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markChanged();
                  }}
                  placeholder="Your full name"
                  className="w-full rounded-lg border border-border-subtle bg-white text-text-main text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary h-11 px-4 shadow-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={profile?.email || ""}
                  readOnly
                  className="w-full rounded-lg border border-border-subtle bg-gray-50 text-text-muted text-sm font-medium h-11 px-4 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Role / Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    markChanged();
                  }}
                  placeholder="e.g. Senior Investment Analyst"
                  className="w-full rounded-lg border border-border-subtle bg-white text-text-main text-sm font-medium focus:border-primary focus:ring-1 focus:ring-primary h-11 px-4 shadow-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Firm Association
                </label>
                <div className="flex items-center justify-between w-full rounded-lg border border-border-subtle bg-gray-50 text-text-muted text-sm font-medium h-11 px-4">
                  <span>{profile?.firmName || "Not assigned"}</span>
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                </div>
              </div>
            </div>
          </section>

          {/* Security */}
          <SecuritySection onToast={showToast} />

          {/* Preferences (+ Display) */}
          <PreferencesSection
            prefs={prefs}
            onChange={(patch) => updatePrefs(patch)}
          />

          {/* Notifications */}
          <section
            id="section-notifications"
            className="bg-surface-card rounded-xl border border-border-subtle shadow-card overflow-hidden scroll-mt-6"
          >
            <div className="px-6 py-5 border-b border-border-subtle flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600 border border-blue-200">
                <span className="material-symbols-outlined text-[20px] block">notifications</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-text-main">Notification Preferences</h2>
                <p className="text-xs text-text-muted">
                  Choose which events trigger in-app notifications.
                </p>
              </div>
            </div>
            <div className="divide-y divide-border-subtle">
              {NOTIFICATION_TYPES.map((notif) => {
                const enabled = !!notificationPrefs[notif.key];
                return (
                  <div
                    key={notif.key}
                    className="flex items-center justify-between px-5 py-4 hover:bg-background-body/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary text-[18px]">
                          {notif.icon}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-main">{notif.label}</p>
                        <p className="text-xs text-text-muted">{notif.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      onClick={() => {
                        setNotificationPrefs((prev) => ({
                          ...prev,
                          [notif.key]: !prev[notif.key],
                        }));
                        markChanged();
                      }}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors shrink-0",
                        enabled ? "bg-primary" : "bg-gray-300",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                          enabled ? "translate-x-5" : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Deactivate Account */}
          <div className="flex items-center justify-between p-5 bg-red-50 border border-red-200 rounded-xl">
            <div>
              <h4 className="text-sm font-bold text-red-700">Deactivate Professional Account</h4>
              <p className="text-xs text-red-600/80">
                Temporarily disable your analyst profile and data access.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDeactivate}
              className="px-4 py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors shadow-sm"
            >
              Deactivate
            </button>
          </div>

          {/* Sticky save hint when there are pending changes */}
          {hasChanges && (
            <div className="text-xs text-amber-600 font-medium flex items-center gap-1.5 justify-end">
              <span className="material-symbols-outlined text-[14px]">info</span>
              You have unsaved changes — click Save Changes at the top.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
