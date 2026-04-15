"use client";

import { useState, useMemo } from "react";
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

const STRENGTH_COLORS = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500"];
const STRENGTH_LABELS = ["Weak", "Fair", "Good", "Strong"];
const STRENGTH_TEXT_COLORS = [
  "text-red-500",
  "text-orange-500",
  "text-yellow-600",
  "text-green-500",
];

function computeStrength(password: string): number {
  let s = 0;
  if (password.length >= 10) s++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
  if (/[0-9]/.test(password)) s++;
  if (/[^A-Za-z0-9]/.test(password)) s++;
  return s;
}

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firmName, setFirmName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const strength = useMemo(() => computeStrength(password), [password]);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError("Password must contain uppercase, lowercase, number, and special character.");
      return;
    }
    if (!title) {
      setError("Please select your title.");
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

    setSuccess("Account created! Redirecting...");
    router.push("/verify-email");
  };

  const inputClass =
    "block w-full rounded-lg border border-[#dbe0e6] bg-white text-[#111418] pl-10 pr-3 py-3 text-sm placeholder:text-[#9ca3af] focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm";

  return (
    <div className="min-h-screen flex flex-col bg-background-body">
      {/* Header */}
      <header className="w-full border-b border-[#e5e7eb] bg-white sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-[#111418] cursor-pointer select-none">
            <Logo className="size-8 text-primary" />
            <h2 className="text-xl font-bold leading-tight tracking-tight">PE OS</h2>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-[#617289] hidden sm:block">
              Already have an account?
            </span>
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-bold text-sm transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-[520px] bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[#e5e7eb] p-8 sm:p-10 relative overflow-hidden">
          {/* Top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/80 to-primary" />

          {/* Header Section */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-xs font-semibold mb-4 border border-primary/10">
              <span className="w-2 h-2 rounded-full bg-primary" />
              Secure Firm Registration
            </div>
            <h1 className="text-2xl sm:text-[32px] font-bold text-[#111418] leading-tight mb-3">
              Initialize your Firm Workspace
            </h1>
            <p className="text-[#617289] text-sm sm:text-base">
              Secure, AI-native operating system for Private Equity.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="fullname">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">person</span>
                </div>
                <input
                  id="fullname"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            {/* Work Email */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="email">
                Work Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">mail</span>
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="name@firm.com"
                  required
                />
              </div>
              <p className="text-xs text-[#617289] mt-1">
                Please use your professional email address.
              </p>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">lock</span>
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  placeholder="••••••••"
                  required
                  minLength={10}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9ca3af] hover:text-[#617289] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              <p className="text-xs text-[#617289] mt-1">
                Min 8 characters, one uppercase, one number
              </p>
              {password.length > 0 && (
                <div>
                  <div className="flex gap-1 mt-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded ${
                          i < strength ? STRENGTH_COLORS[strength - 1] : "bg-gray-200"
                        }`}
                      />
                    ))}
                  </div>
                  {strength > 0 && (
                    <p className={`text-xs mt-1 ${STRENGTH_TEXT_COLORS[strength - 1]}`}>
                      {STRENGTH_LABELS[strength - 1]}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="confirm_password">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                </div>
                <input
                  id="confirm_password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pr-10 ${
                    confirmPassword.length === 0
                      ? ""
                      : passwordsMatch
                        ? "border-green-500"
                        : "border-red-500"
                  }`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9ca3af] hover:text-[#617289] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showConfirm ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p
                  className={`text-xs mt-1 ${
                    passwordsMatch ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {/* Firm Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="firmname">
                Firm Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">business</span>
                </div>
                <input
                  id="firmname"
                  type="text"
                  value={firmName}
                  onChange={(e) => setFirmName(e.target.value)}
                  className={inputClass}
                  placeholder="Acme Capital"
                  required
                />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#111418]" htmlFor="title">
                Your Title
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">badge</span>
                </div>
                <select
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="block w-full rounded-lg border border-[#dbe0e6] bg-white text-[#111418] pl-10 pr-10 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm appearance-none cursor-pointer"
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
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#9ca3af]">
                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                </div>
              </div>
              <p className="text-xs text-[#617289] mt-1">
                You&apos;ll be the workspace admin. You can invite teammates later.
              </p>
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}
            {success && (
              <div className="text-green-600 text-sm text-center bg-green-50 p-3 rounded-lg">
                {success}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center items-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-primary hover:bg-[#002855] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all shadow-[0_1px_2px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_12px_rgba(0,51,102,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{loading ? "Creating workspace..." : "Create Firm Workspace"}</span>
                {loading && (
                  <svg
                    className="animate-spin h-5 w-5 text-white ml-2"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
              </button>
            </div>

            {/* Security Badge */}
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="material-symbols-outlined text-green-600 text-lg">lock</span>
              <span className="text-xs text-[#617289] font-medium">AES-256 Encryption</span>
            </div>

            {/* Terms */}
            <p className="text-xs text-center text-[#9ca3af] mt-2 leading-relaxed">
              By clicking &quot;Create Firm Workspace&quot;, you agree to our{" "}
              <Link href="/terms-of-service" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-xs text-[#9ca3af]">
        © 2026 PE OS. All rights reserved.
      </footer>
    </div>
  );
}
