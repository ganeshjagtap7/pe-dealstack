"use client";

import { useState } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";

// ---------------------------------------------------------------------------
// AI message action buttons (Helpful / Copy) — ported from deal-chat.js
// ---------------------------------------------------------------------------

export function AIMessageActions({ content }: { content: string }) {
  const [helpful, setHelpful] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex gap-2 ml-1 mt-1">
      <button
        onClick={() => setHelpful(true)}
        className={cn(
          "text-[10px] flex items-center gap-1 transition-colors font-medium",
          helpful ? "text-primary" : "text-text-muted hover:text-primary"
        )}
      >
        <span className="material-symbols-outlined text-sm">thumb_up</span>
        {helpful ? "Marked helpful" : "Helpful"}
      </button>
      <button
        onClick={async () => {
          try {
            // Strip HTML for plain text copy
            const tmp = document.createElement("div");
            tmp.innerHTML = DOMPurify.sanitize(renderMarkdown(content));
            await navigator.clipboard.writeText(tmp.innerText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch (err) {
            console.warn("[deal-tabs] copy to clipboard failed:", err);
          }
        }}
        className={cn(
          "text-[10px] flex items-center gap-1 transition-colors font-medium",
          copied ? "text-primary" : "text-text-muted hover:text-primary"
        )}
      >
        <span className="material-symbols-outlined text-sm">
          {copied ? "check" : "content_copy"}
        </span>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
