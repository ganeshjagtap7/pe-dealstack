"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-body px-4">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="size-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
        </div>

        {submitted ? (
          /* Success state */
          <div className="text-center">
            <div className="size-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-outlined text-3xl text-emerald-500">mark_email_read</span>
            </div>
            <h1 className="text-[28px] font-bold leading-tight text-text-main mb-2">
              Check your email
            </h1>
            <p className="text-text-muted text-sm mb-8">
              We sent a password reset link to <span className="font-medium text-text-main">{email}</span>.
              Check your inbox and follow the instructions.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-[28px] font-bold leading-tight text-text-main mb-2">
                Reset your password
              </h1>
              <p className="text-text-muted text-sm">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">Business Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="you@firm.com"
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#003366" }}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  Back to sign in
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
