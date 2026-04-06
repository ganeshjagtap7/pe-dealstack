"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@/providers/UserProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

// ─── Types ──────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  firmName: string;
  role: string;
  avatar: string;
  preferences: {
    density?: string;
    theme?: string;
    notifications?: Record<string, boolean>;
    [key: string]: unknown;
  };
}

// ─── Constants ──────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { key: "DEAL_UPDATE", label: "Deal Updates", description: "When deal data or stage changes", icon: "trending_up" },
  { key: "DOCUMENT_UPLOADED", label: "Document Uploads", description: "When new files are added to a data room", icon: "upload_file" },
  { key: "MENTION", label: "Mentions", description: "When someone mentions you in a comment", icon: "alternate_email" },
  { key: "AI_INSIGHT", label: "AI Insights", description: "When the AI generates new analysis or flags", icon: "auto_awesome" },
  { key: "TASK_ASSIGNED", label: "Task Assignments", description: "When a task is assigned to you", icon: "task_alt" },
  { key: "COMMENT", label: "Comments", description: "When someone comments on your deals or memos", icon: "comment" },
];

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact", icon: "density_small" },
  { value: "default", label: "Default", icon: "density_medium" },
  { value: "comfortable", label: "Comfortable", icon: "density_large" },
];

function getRoleLabel(role: string | undefined): string {
  const labels: Record<string, string> = { ADMIN: "Admin", MEMBER: "Member", VIEWER: "Analyst" };
  return labels[role || ""] || role || "Member";
}

function getInitials(name: string | undefined): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Page Component ─────────────────────────────────────────

export default function SettingsPage() {
  const { user, refetch: refetchUser } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [density, setDensity] = useState("default");
  const [theme, setTheme] = useState("light");
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({
    DEAL_UPDATE: true,
    DOCUMENT_UPLOADED: true,
    MENTION: true,
    AI_INSIGHT: true,
    TASK_ASSIGNED: true,
    COMMENT: true,
  });

  // ─── Load Profile ─────────────────────────────────────────

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api.get<UserProfile>("/users/me");
        setProfile(data);
        setName(data.name || "");
        setTitle(data.title || "");

        if (data.preferences) {
          const prefs = typeof data.preferences === "string" ? JSON.parse(data.preferences) : data.preferences;
          setDensity(prefs.density || "default");
          setTheme(prefs.theme || "light");
          if (prefs.notifications && typeof prefs.notifications === "object") {
            setNotificationPrefs((prev) => ({ ...prev, ...prefs.notifications }));
          }
        }
      } catch {
        showToast("Failed to load profile", "error");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  // ─── Toast ────────────────────────────────────────────────

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function markChanged() {
    setHasChanges(true);
  }

  // ─── Save Profile ─────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch("/users/me", {
        name,
        title,
        preferences: {
          density,
          theme,
          notifications: notificationPrefs,
        },
      });
      setHasChanges(false);
      showToast("Settings saved successfully", "success");
      refetchUser();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }

  // ─── Avatar Upload ────────────────────────────────────────

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("File size must be under 5MB", "error");
      return;
    }

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "/api"}/users/me/avatar`,
        {
          method: "POST",
          body: formData,
          headers: {
            Authorization: `Bearer ${(await (await import("@/lib/supabase/client")).createClient().auth.getSession()).data.session?.access_token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      setProfile((prev) => (prev ? { ...prev, avatar: data.avatar || data.url } : prev));
      showToast("Avatar updated", "success");
      refetchUser();
    } catch {
      showToast("Failed to upload avatar", "error");
    }

    // Reset input
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 mx-auto max-w-[1600px] flex items-center justify-center py-20">
        <div className="text-center text-text-muted">
          <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
          <p className="mt-2 text-sm">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 mx-auto max-w-3xl flex flex-col gap-6">
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all",
            toast.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
          )}
        >
          <span className="material-symbols-outlined text-[18px]">
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-main tracking-tight">User Profile &amp; Personalization</h1>
        <p className="text-text-secondary text-sm mt-0.5">Manage your profile, AI preferences, and interface settings</p>
      </div>

      {/* Profile Card */}
      <div className="rounded-lg border border-border-subtle bg-surface-card shadow-card">
        <div className="p-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-text-muted">person</span>
            Profile
          </h2>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {/* Avatar + Basic Info */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div
                className="size-20 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold overflow-hidden"
                style={
                  profile?.avatar
                    ? { backgroundImage: `url('${profile.avatar}')`, backgroundSize: "cover", backgroundPosition: "center" }
                    : {}
                }
              >
                {!profile?.avatar && getInitials(profile?.name)}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-white text-[24px]">photo_camera</span>
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">{profile?.name || "User"}</h3>
              <p className="text-sm text-text-secondary">
                {profile?.title || "Team Member"}
                {profile?.firmName ? ` \u2022 ${profile.firmName}` : ""}
              </p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 mt-1.5">
                {getRoleLabel(profile?.role)}
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  markChanged();
                }}
                className="w-full rounded-md border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={profile?.email || ""}
                disabled
                className="w-full rounded-md border border-border-subtle bg-gray-50 px-3 py-2 text-sm text-text-muted cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markChanged();
                }}
                className="w-full rounded-md border border-border-subtle bg-background-body px-3 py-2 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                placeholder="e.g. Vice President"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1.5">Firm</label>
              <div className="w-full rounded-md border border-border-subtle bg-gray-50 px-3 py-2 text-sm text-text-muted">
                {profile?.firmName || "Not assigned"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="rounded-lg border border-border-subtle bg-surface-card shadow-card">
        <div className="p-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-text-muted">notifications</span>
            Notification Preferences
          </h2>
        </div>
        <div className="divide-y divide-border-subtle">
          {NOTIFICATION_TYPES.map((notif) => (
            <div
              key={notif.key}
              className="flex items-center justify-between px-5 py-4 hover:bg-background-body/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[18px]">{notif.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-main">{notif.label}</p>
                  <p className="text-xs text-text-muted">{notif.description}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setNotificationPrefs((prev) => ({
                    ...prev,
                    [notif.key]: !prev[notif.key],
                  }));
                  markChanged();
                }}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors",
                  notificationPrefs[notif.key] ? "bg-primary" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
                    notificationPrefs[notif.key] ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Display Preferences */}
      <div className="rounded-lg border border-border-subtle bg-surface-card shadow-card">
        <div className="p-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-text-muted">palette</span>
            Display Preferences
          </h2>
        </div>
        <div className="p-5 flex flex-col gap-5">
          {/* Density */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Layout Density</label>
            <div className="flex gap-3">
              {DENSITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setDensity(opt.value);
                    markChanged();
                  }}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium",
                    density === opt.value
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30"
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">Theme</label>
            <div className="flex gap-3">
              {[
                { value: "light", label: "Light", icon: "light_mode" },
                { value: "dark", label: "Dark", icon: "dark_mode" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setTheme(opt.value);
                    markChanged();
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-all text-sm font-medium",
                    theme === opt.value
                      ? "border-primary bg-blue-50 text-primary"
                      : "border-border-subtle bg-background-body text-text-secondary hover:border-primary/30"
                  )}
                >
                  <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3 pb-6">
        {hasChanges && (
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px]">info</span>
            You have unsaved changes
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-6 py-2.5 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#003366" }}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              Saving...
            </span>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </div>
  );
}
