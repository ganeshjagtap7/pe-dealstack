"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
  { label: "One special character", test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const allRulesPassed = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allRulesPassed) {
      setError("Password does not meet all requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push("/login"), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-body px-4">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="size-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
        </div>

        {success ? (
          <div className="text-center">
            <div className="size-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
              <span className="material-symbols-outlined text-3xl text-emerald-500">check_circle</span>
            </div>
            <h1 className="text-[28px] font-bold leading-tight text-text-main mb-2">
              Password updated
            </h1>
            <p className="text-text-muted text-sm mb-6">
              Your password has been successfully reset. Redirecting to sign in...
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-[28px] font-bold leading-tight text-text-main mb-2">
                Set new password
              </h1>
              <p className="text-text-muted text-sm">
                Choose a strong password for your account.
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
                <span className="text-sm font-medium text-text-main">New Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="Create a strong password"
                  required
                />
              </label>

              {/* Password strength indicators */}
              {password.length > 0 && (
                <div className="flex flex-col gap-1.5 -mt-2">
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(password);
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined text-[14px] ${passed ? "text-emerald-500" : "text-text-muted"}`}
                        >
                          {passed ? "check_circle" : "circle"}
                        </span>
                        <span
                          className={`text-xs ${passed ? "text-emerald-600" : "text-text-muted"}`}
                        >
                          {rule.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">Confirm New Password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                  placeholder="Confirm your password"
                  required
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <span className="text-xs text-red-500 mt-0.5">Passwords do not match</span>
                )}
              </label>

              <button
                type="submit"
                disabled={loading || !allRulesPassed || !passwordsMatch}
                className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-60"
                style={{ backgroundColor: "#003366" }}
              >
                {loading ? "Updating..." : "Reset Password"}
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
