"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface StepDef {
  id: keyof OnboardingSteps;
  label: string;
  description: string;
  href: string | null;
}

interface OnboardingSteps {
  createDeal: boolean;
  uploadDocument: boolean;
  reviewExtraction: boolean;
  tryDealChat: boolean;
  inviteTeamMember: boolean;
}

interface OnboardingStatus {
  welcomeShown?: boolean;
  checklistDismissed?: boolean;
  steps?: Partial<OnboardingSteps>;
}

const STEPS: StepDef[] = [
  {
    id: "createDeal",
    label: "Create your first deal",
    description: "Set up a deal to start tracking it through your pipeline",
    href: "/deals",
  },
  {
    id: "uploadDocument",
    label: "Upload a CIM or financial document",
    description: "Upload a PDF or Excel file to the Data Room",
    href: null,
  },
  {
    id: "reviewExtraction",
    label: "Review AI-extracted financials",
    description: "See how AI reads your documents and builds financial tables",
    href: null,
  },
  {
    id: "tryDealChat",
    label: "Try Deal Chat",
    description: "Ask a question about your deal in natural language",
    href: null,
  },
  {
    id: "inviteTeamMember",
    label: "Invite a team member",
    description: "Add an analyst or partner to your organization",
    href: "/settings",
  },
];

export function OnboardingChecklist() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<OnboardingStatus>("/onboarding/status");
        if (cancelled) return;
        if (data.checklistDismissed) return;
        const allDone = STEPS.every((s) => data.steps?.[s.id]);
        if (allDone) return;
        setStatus(data);
      } catch {
        // silently skip
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    setHidden(true);
    api.post("/onboarding/dismiss", {}).catch(() => {});
  };

  if (!status || hidden) return null;

  const completed = STEPS.filter((s) => status.steps?.[s.id]).length;
  const progressPct = Math.round((completed / STEPS.length) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid #f1f5f9" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-white text-lg">flag</span>
          </div>
          <div>
            <h3 className="font-bold text-[#111418] text-sm">Getting Started</h3>
            <p className="text-xs text-slate-400">
              {completed}/{STEPS.length} completed
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-slate-300 hover:text-slate-500 transition-colors"
          title="Dismiss"
          aria-label="Dismiss checklist"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, backgroundColor: "#003366" }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="px-1 py-2">
        {STEPS.map((step) => {
          const isComplete = !!status.steps?.[step.id];
          const inner = (
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                step.href ? "cursor-pointer hover:bg-[#F8F9FA]" : ""
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isComplete
                    ? "bg-green-100 text-green-600"
                    : "border-2 border-slate-200 text-transparent"
                }`}
              >
                {isComplete && (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={
                    isComplete
                      ? "text-sm text-slate-400 line-through"
                      : "text-sm text-[#111418] font-medium"
                  }
                >
                  {step.label}
                </p>
                {!isComplete && (
                  <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                )}
              </div>
              {!isComplete && step.href && (
                <span className="material-symbols-outlined text-slate-300 text-[18px]">
                  chevron_right
                </span>
              )}
            </div>
          );

          if (step.href && !isComplete) {
            return (
              <Link key={step.id} href={step.href} className="block">
                {inner}
              </Link>
            );
          }
          return <div key={step.id}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
