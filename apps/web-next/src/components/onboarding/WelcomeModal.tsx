"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

const STEPS = [
  {
    icon: "upload_file",
    title: "Upload a CIM",
    description:
      "Drop a Confidential Information Memorandum and watch AI extract financials in seconds.",
  },
  {
    icon: "smart_toy",
    title: "Chat with Your Deals",
    description:
      "Ask questions about any deal — financials, risks, comparisons — all in natural language.",
  },
  {
    icon: "group_add",
    title: "Collaborate with Your Team",
    description:
      "Invite analysts and partners to shared deal rooms with full data isolation.",
  },
];

// Matches the actual GET /onboarding/status response shape in
// apps/api/src/routes/onboarding.ts (DEFAULT_STATUS line 12-36).
interface OnboardingStatus {
  welcomeShown?: boolean;
  checklistDismissed?: boolean;
  steps?: Record<string, boolean>;
}

export function WelcomeModal({ ctaHref = "/deals" }: { ctaHref?: string }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // sessionStorage backup — matches c987ade "prevent redirect loop with
      // sessionStorage backup". If the API flakes, the flag keeps us from
      // shuttling the user to /onboarding on every render.
      try {
        if (sessionStorage.getItem("pe_onboarding_seen") === "1") return;
      } catch (err) {
        // sessionStorage disabled (private mode, strict blockers) — fall
        // through to the API check below.
        console.warn("[onboarding/WelcomeModal] sessionStorage read failed:", err);
      }

      try {
        const status = await api.get<OnboardingStatus>("/onboarding/status");
        if (cancelled) return;

        // New flow — if user hasn't seen the welcome, hasn't dismissed the
        // checklist, and has no completed steps yet, send them to /onboarding
        // instead of showing the legacy modal. Matches 994b094 ("skip old
        // welcome modal for users who went through new flow"): the new flow
        // replaces the legacy welcome entirely for fresh users.
        const hasAnyProgress = !!status.steps && Object.values(status.steps).some((v) => v === true);
        if (!status.welcomeShown && !status.checklistDismissed && !hasAnyProgress) {
          router.push("/onboarding");
          return;
        }

        // Fallback: if welcomeShown is already true but no new-flow progress
        // (e.g. pre-existing user who saw the old modal), keep the old modal
        // hidden — they've already seen something introductory. Cache the
        // "seen" bit in sessionStorage so subsequent loads skip the API call
        // entirely (works around transient /onboarding/status 5xx).
        if (status.welcomeShown || status.checklistDismissed || hasAnyProgress) {
          try {
            sessionStorage.setItem("pe_onboarding_seen", "1");
          } catch (err) {
            // sessionStorage disabled — non-critical.
            console.warn("[onboarding/WelcomeModal] sessionStorage write failed:", err);
          }
        }
      } catch (err) {
        // Best-effort onboarding status fetch.
        console.warn("[onboarding/WelcomeModal] failed to load status:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const markShown = () => {
    api.post("/onboarding/welcome-shown", {}).catch(() => {});
    // Mirror the backend flag into sessionStorage so a subsequent load won't
    // hit a race with the DB update and redirect to /onboarding.
    try {
      sessionStorage.setItem("pe_onboarding_seen", "1");
    } catch (err) {
      // sessionStorage disabled — non-critical.
      console.warn("[onboarding/WelcomeModal] sessionStorage write failed:", err);
    }
  };

  const close = () => {
    setClosing(true);
    markShown();
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  };

  const handleCta = () => {
    markShown();
    setOpen(false);
    router.push(ctaHref);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ opacity: closing ? 0 : 1, transition: "opacity 0.2s ease-out" }}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={close}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto welcome-fade-in">
        <div className="p-6 pb-2 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-white text-3xl">
              rocket_launch
            </span>
          </div>
          <h2 className="text-xl font-bold text-[#111418]">Welcome to PE OS</h2>
          <p className="text-slate-500 text-sm mt-1">
            Your AI-powered private equity operating system
          </p>
        </div>

        <div className="px-6 py-4 flex flex-col gap-3">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="flex items-start gap-4 p-4 rounded-xl bg-[#F8F9FA] border border-slate-100"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#003366" }}
              >
                <span className="material-symbols-outlined text-white text-xl">
                  {step.icon}
                </span>
              </div>
              <div>
                <p className="font-semibold text-[#111418] text-sm">{step.title}</p>
                <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-2">
          <button
            onClick={handleCta}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg transition-all hover:opacity-90 hover:shadow-xl flex items-center justify-center gap-1"
            style={{ backgroundColor: "#003366" }}
          >
            Get Started
            <span className="material-symbols-outlined text-[18px] align-middle ml-1">
              arrow_forward
            </span>
          </button>
          <button
            onClick={close}
            className="w-full py-2 mt-2 text-slate-400 text-xs hover:text-slate-600 transition-colors"
          >
            I&apos;ll explore on my own
          </button>
        </div>
      </div>

    </div>
  );
}
