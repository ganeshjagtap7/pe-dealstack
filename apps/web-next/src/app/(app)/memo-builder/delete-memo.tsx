"use client";

// Companion to page.tsx — owns the memo-delete confirm dialog rendering and
// the API call. Extracted so page.tsx doesn't grow further past the 500-line
// budget. The pending-delete state still lives in page.tsx (parent owns the
// list state we mutate on success); we just take it as a prop here.

import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Memo } from "./components";

export interface PendingDeleteMemo {
  id: string;
  title: string;
}

interface DeleteMemoConfirmProps {
  pending: PendingDeleteMemo | null;
  // Parent state setters / callbacks. Kept narrow so the page.tsx wiring is
  // obvious — we don't take the whole page state.
  setPending: (v: PendingDeleteMemo | null) => void;
  onDeleted: (id: string) => void;
  onError: (msg: string) => void;
}

/**
 * Delete a memo through the API and surface success/failure via the parent's
 * callbacks. Caller owns the toast + state-updates so we don't fork the
 * existing setSuccessToast / setError pattern in page.tsx.
 */
export async function deleteMemoRequest(
  memoId: string,
  callbacks: {
    onSuccess: (id: string) => void;
    onError: (msg: string) => void;
  },
): Promise<void> {
  try {
    await api.delete(`/memos/${memoId}`);
    callbacks.onSuccess(memoId);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : "Failed to delete memo");
  }
}

/**
 * Renders the danger-variant ConfirmDialog for memo deletion. Keeps the
 * copy in one place so page.tsx doesn't have to import ConfirmDialog twice
 * for two different delete flows (sections vs memos).
 */
export function DeleteMemoConfirm({
  pending,
  setPending,
  onDeleted,
  onError,
}: DeleteMemoConfirmProps) {
  return (
    <ConfirmDialog
      open={!!pending}
      title="Delete memo?"
      message={
        pending
          ? `This will permanently delete "${pending.title}" and all its sections. This can't be undone.`
          : ""
      }
      confirmLabel="Delete memo"
      variant="danger"
      onConfirm={() => {
        if (!pending) return;
        const id = pending.id;
        // Close the dialog immediately so the user gets feedback while the
        // request is in flight. Errors are surfaced via the toast.
        setPending(null);
        deleteMemoRequest(id, {
          onSuccess: onDeleted,
          onError,
        });
      }}
      onCancel={() => setPending(null)}
    />
  );
}

/**
 * Helper for the parent's memo-state update on successful delete: removes
 * the deleted memo from the list and clears the selection if it was the one
 * removed. Returned as a pair of next-values so the caller decides whether
 * to call setMemos / setSelectedMemo.
 */
export function applyMemoDeleted(
  memos: Memo[],
  selectedMemo: Memo | null,
  deletedId: string,
): { nextMemos: Memo[]; clearSelection: boolean } {
  return {
    nextMemos: memos.filter((m) => m.id !== deletedId),
    clearSelection: selectedMemo?.id === deletedId,
  };
}
