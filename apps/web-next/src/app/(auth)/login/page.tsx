"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// Order, icons, copy mirror login.html on main (commit 37a3392).
const AI_AGENTS = [
  { name: "Financial Extractor", desc: "Auto-parses CIMs & balance sheets in seconds", icon: "table_chart", color: "#4F7CFF" },
  { name: "Deal Chat AI", desc: "Ask anything — instant answers from your data", icon: "smart_toy", color: "#A855F7" },
  { name: "Memo Builder", desc: "Drafts IC memos in minutes, not weeks", icon: "description", color: "#10B981" },
  { name: "Quality of Earnings", desc: "Detects red flags, validates EBITDA quality", icon: "verified", color: "#F59E0B" },
  { name: "Portfolio Monitor", desc: "24/7 signal scanning across holdings", icon: "monitoring", color: "#F43F5E" },
  { name: "Meeting Prep", desc: "Briefs auto-generated before every call", icon: "event_note", color: "#14B8A6" },
];

const STATS = [
  { value: "10x", label: "Faster diligence" },
  { value: "15hrs", label: "Saved per deal" },
  { value: "SOC 2", label: "Enterprise ready" },
];

// Scopes the backend needs to (a) create a Drive file in the user's My Drive
// and (b) edit it as a Google Doc. `drive.file` is the minimum permission —
// it scopes the app to files it created, not the user's whole Drive.
const GOOGLE_OAUTH_SCOPES =
  "email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents";

function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: GOOGLE_OAUTH_SCOPES,
          // `prompt=consent` + `access_type=offline` are required to get a
          // refresh token back from Google — without it the backend can't
          // create Drive files after the access token expires.
          queryParams: { access_type: "offline", prompt: "consent" },
          redirectTo: `${appOrigin()}/callback`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
      // On success the browser is redirected away to Google, so we don't
      // reset `loading` — the page is about to unmount.
    } catch (err) {
      console.warn("[auth] google sign-in failed:", err);
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex w-1/2 relative flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: "#0f1c2e" }}>
        <div
          className="absolute inset-0 z-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(#ffffff 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }}
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0f1c2e] via-transparent to-white/10 z-0" />

        <div className="relative z-10 flex flex-col w-full max-w-2xl mx-auto px-12 py-16">
          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 mb-5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">7 AI agents · Live</span>
            </div>
            <h2 className="text-4xl font-bold text-white tracking-tight leading-tight mb-3">
              Your AI deal team,<br />working 24/7.
            </h2>
            <p className="text-blue-100/70 text-base leading-relaxed max-w-md">
              Purpose-built AI agents for private equity. From sourcing to close &mdash; automate the work that bankers, analysts, and associates do every day.
            </p>
          </div>

          {/* AI Agents Grid */}
          <div className="grid grid-cols-2 gap-3 mb-8">
            {AI_AGENTS.map((agent) => (
              <div
                key={agent.name}
                className="group relative bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-lg p-3.5 transition-all duration-300 hover:border-white/25 hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center border"
                    style={{ backgroundColor: `${agent.color}1F`, borderColor: `${agent.color}33` }}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ color: agent.color, fontVariationSettings: "'FILL' 0, 'wght' 400" }}
                    >
                      {agent.icon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-white mb-0.5">{agent.name}</p>
                    <p className="text-[10px] text-blue-100/60 leading-snug">{agent.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 pt-6 border-t border-white/10">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold text-white tracking-tight">{stat.value}</p>
                <p className="text-[10px] text-blue-100/60 uppercase tracking-wider mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Google Workspace sign-in */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center bg-white px-6 md:px-12 lg:px-24 relative">
        <div className="absolute inset-0 lg:hidden pointer-events-none opacity-5 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary via-transparent to-transparent" />

        <div className="w-full max-w-[440px] z-10">
          <div className="flex items-center gap-2 mb-10">
            <div className="w-8 h-8 rounded flex items-center justify-center text-white" style={{ backgroundColor: "#003366" }}>
              <span className="material-symbols-outlined text-[20px]">candlestick_chart</span>
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: "#003366" }}>PE<span className="font-light opacity-80">OS</span></span>
          </div>

          <div className="mb-8">
            <h1 className="text-[#121417] tracking-tight text-[28px] font-bold leading-tight mb-2">
              Sign in to PE OS
            </h1>
            <p className="text-slate-500 text-sm">
              Continue with your Google Workspace account to access deals,
              NDAs, and the AI agent suite.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 rounded-lg text-white font-medium text-sm shadow-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#15304a] flex items-center justify-center gap-3"
            style={{ backgroundColor: "#003366" }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Redirecting to Google…
              </>
            ) : (
              <>
                <GoogleGlyph />
                Sign in with Google Workspace
              </>
            )}
          </button>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg mt-4">
              {error}
            </div>
          )}

          {/* Workspace-required notice */}
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-600 leading-relaxed flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-slate-400 mt-0.5 shrink-0">
              info
            </span>
            <span>
              This app requires a <strong className="font-semibold text-slate-700">Google Workspace</strong> account.
              Personal Gmail accounts can sign in but NDA features won&rsquo;t
              work. See your IT admin to get a Workspace seat.
            </span>
          </div>

          {/* Footer links */}
          <div className="mt-10 pt-6 border-t border-gray-100 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <Link href="/terms-of-service" className="hover:text-primary transition-colors">
                Terms
              </Link>
              <span aria-hidden>·</span>
              <Link href="/privacy-policy" className="hover:text-primary transition-colors">
                Privacy
              </Link>
              <span aria-hidden>·</span>
              <Link href="/security" className="hover:text-primary transition-colors">
                Security
              </Link>
            </div>
            <p>&copy; 2026 PE OS.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline Google "G" glyph. Embedded rather than depending on Material Symbols
// 'login' so the multicolour brand mark stays recognisable on the button.
function GoogleGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      width="20"
      height="20"
      className="shrink-0"
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
