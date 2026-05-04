"use client";

import { useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { WidgetShell } from "./shell";

// Ported from quick-notes.js. Per-user localStorage
// namespace so a shared browser doesn't leak notes.
function QuickNotesInner({ storageKey }: { storageKey: string }) {
  // Lazy-init from localStorage so we don't sync state in an effect.
  // The parent re-mounts this component (via key={storageKey}) when the
  // user changes, so a stale note doesn't leak across user switches.
  const [note, setNote] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch (err) {
      // localStorage disabled / quota error — fallback to empty note.
      console.warn("[dashboard/quick-notes] failed to read note from localStorage:", err);
      return "";
    }
  });
  const [status, setStatus] = useState("Auto-saves on blur");

  const save = () => {
    try {
      localStorage.setItem(storageKey, note);
      setStatus(`Saved · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    } catch (err) {
      console.warn("[dashboard/quick-notes] failed to save note to localStorage:", err);
      setStatus("Could not save (storage unavailable)");
    }
  };

  return (
    <WidgetShell title="Quick Notes" icon="sticky_note_2">
      <div className="p-4">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={save}
          placeholder="Jot down quick notes, reminders, follow-ups..."
          className="w-full h-32 resize-none rounded-lg border border-border-subtle p-3 text-sm text-text-main placeholder-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
        />
        <p className="text-[11px] text-text-muted mt-1.5">{status}</p>
      </div>
    </WidgetShell>
  );
}

export function QuickNotesWidget() {
  const { user } = useUser();
  const storageKey = `pe-quick-notes:${user?.id ?? "anon"}`;
  // key=storageKey forces remount when the user changes, so the lazy
  // useState in QuickNotesInner re-reads localStorage for the new user.
  return <QuickNotesInner key={storageKey} storageKey={storageKey} />;
}
