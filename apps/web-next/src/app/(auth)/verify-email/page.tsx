"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  const handleResend = async () => {
    setError("");
    setResending(true);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email;

      if (!email) {
        setError("No email found. Please sign up again.");
        setResending(false);
        return;
      }

      const { error: authError } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (authError) {
        setError(authError.message);
      } else {
        setResent(true);
      }
    } catch {
      setError("Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-body px-4">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="size-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
        </div>

        {/* Content */}
        <div className="text-center">
          <div className="size-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl text-primary">mail</span>
          </div>

          <h1 className="text-[28px] font-bold leading-tight text-text-main mb-2">
            Check your email
          </h1>
          <p className="text-text-muted text-sm mb-8 max-w-sm mx-auto">
            We&apos;ve sent a verification link to your email address. Please click the link to
            verify your account and get started.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              {error}
            </div>
          )}

          {resent && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm mb-4">
              Verification email resent. Check your inbox.
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full py-3 rounded-lg border border-border-subtle text-text-secondary font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {resending ? "Resending..." : "Resend Verification Email"}
            </button>

            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-lg text-white font-medium text-sm transition-colors"
              style={{ backgroundColor: "#003366" }}
            >
              Go to Sign In
            </Link>
          </div>

          <p className="text-xs text-text-muted mt-6">
            Didn&apos;t receive the email? Check your spam folder or try resending.
          </p>
        </div>
      </div>
    </div>
  );
}
