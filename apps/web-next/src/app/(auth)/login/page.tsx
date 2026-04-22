"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import Link from "next/link";

const AI_AGENTS = [
  { name: "Financial Extractor", desc: "Auto-parses CIMs & balance sheets in seconds", icon: "table_view", color: "#4F7CFF" },
  { name: "Deal Chat AI", desc: "Ask anything — instant answers from your data", icon: "smart_toy", color: "#A855F7" },
  { name: "Memo Builder", desc: "Drafts IC memos in minutes, not weeks", icon: "description", color: "#10B981" },
  { name: "Quality of Earnings", desc: "Detects red flags, validates EBITDA quality", icon: "verified", color: "#F59E0B" },
  { name: "Portfolio Monitor", desc: "24/7 signal scanning across holdings", icon: "monitoring", color: "#F43F5E" },
  { name: "Meeting Prep", desc: "Briefs auto-generated before every call", icon: "calendar_month", color: "#14B8A6" },
];

const STATS = [
  { value: "10x", label: "FASTER DILIGENCE" },
  { value: "15hrs", label: "SAVED PER DEAL" },
  { value: "AES-256", label: "BANK-LEVEL ENCRYPTION" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: "#003366" }}>
        {/* Dot pattern */}
        <div
          className="absolute inset-0 z-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(#ffffff 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#003366] via-transparent to-white/10 z-0" />

        <div className="relative z-10 flex flex-col w-full max-w-xl px-12">
          {/* Live badge */}
          <div className="flex items-center gap-2 mb-7">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-xs font-bold text-emerald-300 tracking-wide">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              7 AI AGENTS &middot; LIVE
            </span>
          </div>

          {/* Headline */}
          <h2 className="text-[40px] font-bold text-white tracking-tight leading-[1.1] mb-4">
            Your AI deal team,<br />working 24/7.
          </h2>
          <p className="text-blue-200/70 text-[15px] leading-relaxed mb-9 max-w-md">
            Purpose-built AI agents for private equity. From sourcing to close &mdash; automate the work that bankers, analysts, and associates do every day.
          </p>

          {/* Agent Cards */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {AI_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl p-4 border border-white/[0.08] bg-[#062446]/60 hover:bg-[#072e57]/60 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="size-9 rounded-lg flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: `${agent.color}1F`,
                      borderColor: `${agent.color}33`,
                    }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{
                        color: agent.color,
                        fontVariationSettings: "'FILL' 0, 'wght' 400",
                      }}
                    >
                      {agent.icon}
                    </span>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-bold text-white mb-1 leading-tight">{agent.name}</p>
                    <p className="text-[11px] text-blue-200/60 leading-snug">{agent.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center gap-12">
              {STATS.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-12">
                  <div>
                    <p className="text-3xl font-bold text-white leading-tight">{stat.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/50 mt-1.5">{stat.label}</p>
                  </div>
                  {i < STATS.length - 1 && <div className="w-px h-10 bg-white/15" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-6 md:px-12 lg:px-24 relative">
        <div className="absolute inset-0 lg:hidden pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />

        <div className="w-full max-w-[440px] z-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-10">
            <Logo className="size-7 text-primary" />
            <span className="text-xl font-bold tracking-tight text-primary">PEOS</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[#121417] tracking-tight text-[28px] font-bold leading-tight mb-2">
              Sign in to your account
            </h1>
            <p className="text-slate-500 text-sm">Welcome back! Please enter your details.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <label className="flex flex-col gap-1.5">
              <p className="text-[#121417] text-sm font-medium">Business Email</p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="form-input w-full rounded-lg text-[#121417] border border-gray-200 bg-white h-12 placeholder:text-gray-400 px-4 text-sm transition-all focus:outline-0 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="name@firm.com"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <p className="text-[#121417] text-sm font-medium">Password</p>
              <div className="relative flex w-full rounded-lg group focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary border border-gray-200 bg-white transition-all">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input flex-1 min-w-0 border-none bg-transparent h-12 text-[#121417] placeholder:text-gray-400 px-4 text-sm focus:ring-0"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="pr-3 flex items-center justify-center text-gray-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword ? "visibility" : "visibility_off"}
                  </span>
                </button>
              </div>
            </label>

            {/* Remember + Forgot */}
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary/20 w-4 h-4"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-800 transition-colors">
                  Remember me
                </span>
              </label>
              <Link
                href="/forgot-password"
                className="text-primary hover:text-blue-700 text-sm font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Sign In */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg text-white font-semibold text-sm transition-all disabled:opacity-60 hover:opacity-90 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#003366" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  Sign In
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4 my-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">or continue with</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* SSO — not yet wired up */}
            <button
              type="button"
              disabled
              title="Coming soon"
              className="w-full h-12 rounded-lg border border-gray-200 bg-white text-[#121417] font-semibold text-sm flex items-center justify-center gap-2.5 opacity-60 cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px] text-gray-500">lock</span>
              Single Sign-On (SSO)
              <span className="ml-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Coming soon</span>
            </button>

            <p className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary font-semibold hover:underline">
                Sign up
              </Link>
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="absolute bottom-6 text-xs text-gray-400">&copy; 2026 PE OS.</p>
      </div>
    </div>
  );
}
