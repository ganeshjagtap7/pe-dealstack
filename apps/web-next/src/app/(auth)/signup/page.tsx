"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

const TITLES = [
  { value: "partner", label: "Partner / Managing Director" },
  { value: "principal", label: "Principal" },
  { value: "vp", label: "Vice President" },
  { value: "associate", label: "Associate" },
  { value: "analyst", label: "Analyst" },
  { value: "ops", label: "Operations / Admin" },
] as const;

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (p: string) => p.length >= 10 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
  { label: "One special character", test: (p: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firmName, setFirmName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          firm_name: firmName,
          title,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/verify-email");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-body px-4 py-10">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <Logo className="size-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-primary">PE OS</span>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-xs font-semibold mb-4 border border-primary/10">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Secure Firm Registration
          </div>
          <h1 className="text-2xl sm:text-[32px] font-bold leading-tight text-text-main mb-3">
            Initialize your Firm Workspace
          </h1>
          <p className="text-text-muted text-sm">
            Secure, AI-native operating system for Private Equity.
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
            <span className="text-sm font-semibold text-text-main">Full Name</span>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="John Doe"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text-main">Work Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="name@firm.com"
              required
            />
            <span className="text-xs text-text-muted">Please use your professional email address.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-main">Password</span>
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
            <span className="text-sm font-medium text-text-main">Confirm Password</span>
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

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-main">Firm Name</span>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main placeholder-text-muted focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="Your firm name"
              required
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-main">Title</span>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-card px-4 py-3 text-sm text-text-main focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              required
            >
              <option value="" disabled>
                Select your title
              </option>
              {TITLES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={loading || !allRulesPassed || !passwordsMatch}
            className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors disabled:opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p className="text-center text-sm text-text-muted">
            Already have an account?{" "}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
