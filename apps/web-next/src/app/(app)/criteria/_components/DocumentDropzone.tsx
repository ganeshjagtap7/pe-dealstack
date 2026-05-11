"use client";

// Drop a PDF or DOCX, we extract the text in-memory and call onText with the
// result. No DB persist — pairs with POST /api/ai/extract-document. Used by
// the Teaser Filter (CIM/teaser) and NDA Red-Line (counterparty NDA) pages.

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatFileSize } from "@/lib/formatters";

interface DocumentDropzoneProps {
  onText: (text: string, filename: string) => void;
  hasText: boolean;
  onClear: () => void;
  hint?: string;
}

export function DocumentDropzone({ onText, hasText, onClear, hint }: DocumentDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setFilename(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Use authFetchRaw — multipart can't go through api.post (which sets JSON
      // headers). Inline the auth header here to avoid a second module import.
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch("/api/ai/extract-document", {
        method: "POST",
        body: fd,
        headers,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not read the file.");
        setFilename(null);
        return;
      }
      onText(json.text, json.filename || file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setFilename(null);
    } finally {
      setBusy(false);
    }
  }

  function onSelect(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function onClearClick(e: React.MouseEvent) {
    e.stopPropagation();
    setFilename(null);
    setError(null);
    onClear();
  }

  return (
    <div
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-lg border-2 border-dashed p-3 transition-colors cursor-pointer",
        dragOver ? "border-primary bg-primary-light/30" : "border-border bg-white hover:border-primary/50",
        busy && "cursor-wait opacity-70",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={onSelect}
      />
      {busy ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
          Reading {filename || "file"}…
        </div>
      ) : hasText && filename ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-secondary text-[16px]">check_circle</span>
            <span className="truncate text-text-primary font-medium">{filename}</span>
          </div>
          <button
            type="button"
            onClick={onClearClick}
            className="text-text-secondary hover:text-text-primary"
            aria-label="Clear uploaded file"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="material-symbols-outlined text-[16px]">upload_file</span>
          <span>
            <span className="font-medium text-text-primary">Drop a PDF or Word doc</span>
            {hint ? <span className="text-text-secondary"> · {hint}</span> : null}
            <span className="text-text-secondary"> · or paste below</span>
          </span>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  );
}

// Re-exported here so the dropzone consumer doesn't have to import formatters
// just for the file-size display. Keeps the tree-shake clean.
export { formatFileSize };
