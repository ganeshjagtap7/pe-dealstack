"use client";

import { cn } from "@/lib/cn";
import type { FollowUpQuestion } from "./components";

/* ------------------------------------------------------------------ */
/*  FollowUpQuestions                                                   */
/* ------------------------------------------------------------------ */

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[];
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  loading: boolean;
}

export function FollowUpQuestions({ questions, answers, onAnswer, loading }: FollowUpQuestionsProps) {
  if (!loading && questions.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="h-px bg-gray-100 mb-5" />
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-base" style={{ color: "#003366" }}>psychology</span>
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#003366" }}>Quick context</p>
        <span className="text-[10px] text-gray-400 font-normal normal-case ml-0.5">helps AI serve you better</span>
      </div>
      {loading && (
        <div className="py-4 flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-gray-300 text-sm animate-spin">progress_activity</span>
          <span className="text-[11px] text-gray-400">Generating questions...</span>
        </div>
      )}
      <div className="space-y-5">
        {questions.map((q, idx) => (
          <div
            key={q.id}
            className="animate-[fadeInUp_0.4s_ease-out_both]"
            style={{ animationDelay: `${(idx + 1) * 0.1}s` }}
          >
            <p className="text-[13px] text-gray-800 font-medium mb-1">{q.question}</p>
            <p className="text-[10px] text-gray-400 italic mb-2.5">{q.reason}</p>
            {q.type === "choice" ? (
              <div className="flex flex-wrap gap-2">
                {(q.options || []).map((opt) => {
                  const isSelected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onAnswer(q.id, opt)}
                      className={cn(
                        "px-3 py-1.5 text-[11px] font-medium rounded-full border transition-all cursor-pointer",
                        isSelected
                          ? "text-white"
                          : "border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary"
                      )}
                      style={isSelected ? { backgroundColor: "#003366", borderColor: "#003366" } : undefined}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder={q.placeholder || "Share your thoughts..."}
                value={answers[q.id] || ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  WarningBanner                                                       */
/* ------------------------------------------------------------------ */

interface WarningBannerProps {
  title: string;
  message: string;
  onDismiss: () => void;
}

export function WarningBanner({ title, message, onDismiss }: WarningBannerProps) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-amber-500 mt-0.5">warning</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">{title}</p>
          <p className="text-xs text-amber-600 mt-1">{message}</p>
        </div>
        <button onClick={onDismiss} className="text-amber-400 hover:text-amber-600">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
