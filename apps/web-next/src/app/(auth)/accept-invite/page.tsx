"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";
import { Suspense } from "react";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "accepted" | "error">("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitation, setInvitation] = useState<{ email: string; orgName: string; role: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    fetch(`/api/public/invitations/verify/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setInvitation(data.invitation || data);
          setStatus("valid");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    setError("");
    try {
      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email: invitation?.email || "",
        password,
      });
      if (signUpError) throw signUpError;

      const res = await fetch(`/api/public/invitations/accept/${token}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to accept invitation");
      setStatus("accepted");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-body px-4">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-2 mb-10">
          <Logo className="size-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
        </div>

        {status === "loading" && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
            <p className="text-text-muted text-sm mt-3">Verifying invitation...</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-4xl text-red-500">error</span>
            <h2 className="text-xl font-bold text-text-main mt-3">Invalid Invitation</h2>
            <p className="text-text-muted text-sm mt-2">This invitation link is invalid or has expired.</p>
            <Link href="/login" className="text-primary font-medium text-sm hover:underline mt-4 inline-block">
              Go to Login
            </Link>
          </div>
        )}

        {status === "accepted" && (
          <div className="text-center py-8">
            <span className="material-symbols-outlined text-4xl text-secondary">check_circle</span>
            <h2 className="text-xl font-bold text-text-main mt-3">Welcome!</h2>
            <p className="text-text-muted text-sm mt-2">Your account has been created. Check your email to verify, then sign in.</p>
            <Link
              href="/login"
              className="inline-block mt-6 px-6 py-2.5 text-white rounded-lg text-sm font-medium"
              style={{ backgroundColor: "#003366" }}
            >
              Sign In
            </Link>
          </div>
        )}

        {status === "valid" && (
          <>
            <h1 className="text-[28px] font-bold text-text-main mb-2">Accept Invitation</h1>
            <p className="text-text-muted text-sm mb-8">
              You&apos;ve been invited to join <strong>{invitation?.orgName}</strong> as{" "}
              <strong>{invitation?.role}</strong>.
            </p>

            <form onSubmit={handleAccept} className="flex flex-col gap-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">Email</span>
                <input type="email" value={invitation?.email || ""} disabled className="w-full rounded-lg border border-border-subtle bg-gray-50 px-4 py-3 text-sm text-text-muted" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary" placeholder="Create a password (10+ chars)" required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">Confirm Password</span>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary" placeholder="Confirm your password" required />
              </label>
              <button type="submit" className="w-full py-3 rounded-lg text-white font-medium text-sm" style={{ backgroundColor: "#003366" }}>
                Accept & Create Account
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span></div>}>
      <AcceptInviteContent />
    </Suspense>
  );
}
