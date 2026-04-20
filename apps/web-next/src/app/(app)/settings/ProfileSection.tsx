"use client";

import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  firmName: string;
  role: string;
  avatar: string;
  preferences?: Record<string, unknown> | string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Analyst",
};

function getRoleLabel(role: string | undefined): string {
  return ROLE_LABELS[role || ""] || role || "Member";
}

import { getInitials } from "@/lib/formatters";

// ─── Component ──────────────────────────────────────────────────────

interface ProfileSectionProps {
  profile: UserProfile | null;
  name: string;
  setName: (v: string) => void;
  title: string;
  setTitle: (v: string) => void;
  onAvatarUploaded: (updated: UserProfile) => void;
  onToast: (message: string, type: "success" | "error") => void;
  markChanged: () => void;
}

export function ProfileSection({
  profile,
  name,
  setName,
  title,
  setTitle,
  onAvatarUploaded,
  onToast,
  markChanged,
}: ProfileSectionProps) {
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onToast("Image must be less than 5MB", "error");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      onToast("Only JPEG, PNG, GIF, and WebP images are allowed", "error");
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
      onAvatarUploaded(updated);
      onToast("Avatar updated", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to upload avatar", "error");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  return (
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
                  ? { backgroundImage: `url('${encodeURI(profile.avatar)}')` }
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
  );
}
