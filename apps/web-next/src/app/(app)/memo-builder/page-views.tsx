"use client";

// UI fragments lifted out of page.tsx so the page itself stays under the
// 500-line cap. These are the breadcrumb bar, the no-memo-selected empty
// state, the loading state, and the success/error toasts. Each one is purely
// visual — no side effects — and renders the same DOM as the inline JSX it
// replaced.

import Link from "next/link";
import { Memo } from "./components";

/* ──────────────────────────────────────────────────────────────────────── */
/*  Breadcrumb bar shown at the top of the editor pane                     */
/* ──────────────────────────────────────────────────────────────────────── */

interface MemoBreadcrumbProps {
  selectedMemo: Memo | null;
  onClearMemo: () => void;
}

export function MemoBreadcrumb({ selectedMemo, onClearMemo }: MemoBreadcrumbProps) {
  return (
    <div className="flex items-center h-10 px-6 border-b border-slate-100 bg-slate-50/80 text-sm shrink-0">
      <nav className="flex items-center gap-1.5">
        <button
          onClick={onClearMemo}
          className="flex items-center justify-center size-7 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors mr-1"
          title="Back to memo list"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        </button>
        <Link href="/dashboard" className="text-slate-400 hover:text-primary transition-colors">
          Dashboard
        </Link>
        <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
        <span className="text-slate-400">AI Reports</span>
        {selectedMemo && (
          <>
            <span className="material-symbols-outlined text-[14px] text-slate-300">chevron_right</span>
            <span className="text-slate-900 font-medium">
              {selectedMemo.projectName || selectedMemo.title}
            </span>
          </>
        )}
      </nav>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Empty state shown when no memo is selected                             */
/* ──────────────────────────────────────────────────────────────────────── */

interface MemoEmptyStateProps {
  onCreate: () => void;
}

export function MemoEmptyState({ onCreate }: MemoEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-background-body">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-primary text-3xl">edit_note</span>
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">Select or Create a Memo</h3>
        <p className="text-sm text-slate-500 mb-6 max-w-md">
          Choose a memo from the sidebar, or create a new one to get started with the AI-powered memo builder.
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          New Memo
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Loading spinner shown while a memo is being fetched                    */
/* ──────────────────────────────────────────────────────────────────────── */

export function MemoLoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background-body">
      <div className="flex flex-col items-center gap-4">
        <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-600 font-medium">Loading memo...</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Success toast (bottom-right)                                            */
/* ──────────────────────────────────────────────────────────────────────── */

interface SuccessToastProps {
  message: string;
  onDismiss: () => void;
}

export function SuccessToast({ message, onDismiss }: SuccessToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-emerald-50 border border-emerald-200 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
      <span className="material-symbols-outlined text-emerald-600 text-[20px] mt-0.5">check_circle</span>
      <div className="flex-1">
        <p className="text-sm text-emerald-800">{message}</p>
      </div>
      <button onClick={onDismiss} className="text-emerald-400 hover:text-emerald-600">
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Error toast (bottom-right)                                              */
/* ──────────────────────────────────────────────────────────────────────── */

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm bg-red-50 border border-red-200 rounded-lg shadow-lg px-4 py-3 flex items-start gap-3">
      <span className="material-symbols-outlined text-red-500 text-[20px] mt-0.5">error</span>
      <div className="flex-1">
        <p className="text-sm text-red-700">{message}</p>
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
}
