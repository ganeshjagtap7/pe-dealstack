"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { WelcomeView } from "./welcome-view";
import { ChecklistView } from "./checklist-view";
import { FirmTaskModal } from "./firm-task";
import { CimTaskModal } from "./cim-task";
import { TeamTaskModal } from "./team-task";
import { SkipConfirmModal } from "./skip-modal";
import {
  FirmData,
  LEGACY_STEP_TO_TASK,
  OnboardingStatus,
  TASK_TO_LEGACY_STEP,
  TASKS,
  TaskId,
  TeamInvite,
} from "./types";

// Main onboarding page — welcome view, then checklist of 3 tasks, then
// dashboard. Ported from apps/web/js/onboarding/onboarding-flow.js (3a796c8).
export default function OnboardingPage() {
  const router = useRouter();

  const [view, setView] = useState<"welcome" | "checklist">("welcome");
  const [completed, setCompleted] = useState<Set<TaskId>>(new Set());
  const [activeTask, setActiveTask] = useState<TaskId | null>(null);
  const [showSkip, setShowSkip] = useState(false);

  const [firmData, setFirmData] = useState<FirmData>({ url: "", linkedin: "", aum: "", sectors: [] });
  const [sampleDealId, setSampleDealId] = useState<string | null>(null); // "luktara" | "pinecrest" | null
  const [cimFile, setCimFile] = useState<File | null>(null);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([{ email: "", role: "Analyst" }]);
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);

  // ─── Load existing progress from the API ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<OnboardingStatus>("/onboarding/status");
        if (cancelled) return;
        const done = new Set<TaskId>();
        if (data.steps) {
          for (const [legacyId, isDone] of Object.entries(data.steps)) {
            if (!isDone) continue;
            const taskId = LEGACY_STEP_TO_TASK[legacyId];
            if (taskId) done.add(taskId);
          }
        }
        if (Array.isArray(data.onboardingCompleted)) {
          for (const id of data.onboardingCompleted) {
            if (id === "firm" || id === "cim" || id === "team") done.add(id);
          }
        }
        setCompleted(done);
        // If user already finished onboarding, skip straight to dashboard.
        if (done.size >= TASKS.length) router.push("/dashboard");
      } catch {
        // Fresh user or API down — proceed with empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ─── Task completion ────────────────────────────────────────────
  const markServerStep = useCallback(async (taskId: TaskId) => {
    const legacy = TASK_TO_LEGACY_STEP[taskId];
    if (!legacy) return;
    try {
      await api.post("/onboarding/complete-step", { step: legacy });
    } catch {
      // Non-blocking — user can still proceed.
    }
  }, []);

  const completeTask = useCallback(
    async (taskId: TaskId) => {
      // If completing CIM with a sample deal picked, ask the API to spin up the demo.
      if (taskId === "cim" && sampleDealId) {
        try {
          const res = await api.post<{ dealId?: string }>("/onboarding/create-demo-deal", {
            sampleId: sampleDealId,
          });
          if (res?.dealId) setCreatedDealId(res.dealId);
        } catch {
          // Best-effort — user still gets marked done
        }
      }

      setCompleted((prev) => {
        const next = new Set(prev);
        next.add(taskId);
        return next;
      });
      setActiveTask(null);
      void markServerStep(taskId);
    },
    [markServerStep, sampleDealId],
  );

  const doneCount = completed.size;
  const allDone = doneCount >= TASKS.length;

  // Auto-advance: once all 3 are done, persist + wait a beat + redirect.
  useEffect(() => {
    if (!allDone) return;
    (async () => {
      try {
        await api.post("/onboarding/complete", {});
      } catch {
        // ignore
      }
    })();
  }, [allDone]);

  const openWorkspace = () => {
    if (createdDealId) router.push(`/deals/${createdDealId}`);
    else router.push("/dashboard");
  };

  const confirmSkip = async () => {
    try {
      await Promise.all([
        api.post("/onboarding/welcome-shown", {}).catch(() => undefined),
        api.post("/onboarding/skip", {}).catch(() => undefined),
      ]);
    } finally {
      router.push("/dashboard");
    }
  };

  const startChecklist = async (useSample: boolean) => {
    if (useSample) {
      setSampleDealId("luktara");
      setCompleted((prev) => {
        const next = new Set(prev);
        next.add("cim");
        return next;
      });
    }
    setView("checklist");
    try {
      await api.post("/onboarding/welcome-shown", {});
    } catch {
      // non-blocking
    }
  };

  return (
    <>
      <TopNav doneCount={doneCount} onSkip={() => setShowSkip(true)} />

      {view === "welcome" ? (
        <WelcomeView onStart={() => startChecklist(false)} onSample={() => startChecklist(true)} />
      ) : (
        <ChecklistView
          completed={completed}
          onOpenTask={setActiveTask}
          allDone={allDone}
          onOpenWorkspace={openWorkspace}
        />
      )}

      {activeTask === "firm" && (
        <FirmTaskModal
          value={firmData}
          onChange={setFirmData}
          onClose={() => setActiveTask(null)}
          onComplete={() => completeTask("firm")}
        />
      )}
      {activeTask === "cim" && (
        <CimTaskModal
          file={cimFile}
          onFile={setCimFile}
          sampleId={sampleDealId}
          onSample={setSampleDealId}
          onClose={() => setActiveTask(null)}
          onComplete={() => completeTask("cim")}
        />
      )}
      {activeTask === "team" && (
        <TeamTaskModal
          invites={teamInvites}
          onChange={setTeamInvites}
          onClose={() => setActiveTask(null)}
          onComplete={() => completeTask("team")}
        />
      )}

      <SkipConfirmModal open={showSkip} onCancel={() => setShowSkip(false)} onConfirm={confirmSkip} />
    </>
  );
}

function TopNav({ doneCount, onSkip }: { doneCount: number; onSkip: () => void }) {
  return (
    <header className="bg-white border-b border-border-subtle">
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="#003366" />
          </svg>
          <span className="font-bold text-[15px] tracking-tight text-primary">PE OS</span>
          <span className="text-[11px] text-text-muted font-mono uppercase tracking-wider ml-2 hidden sm:inline">
            Getting started
          </span>
        </div>
        <div className="flex items-center gap-4">
          {doneCount > 0 && doneCount < TASKS.length && (
            <span className="text-[12px] text-text-muted hidden md:inline">
              {doneCount}/{TASKS.length} done
            </span>
          )}
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-text-secondary hover:text-primary transition-colors"
          >
            Skip setup
          </button>
        </div>
      </div>
    </header>
  );
}
