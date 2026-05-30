"use client";

import DOMPurify from "dompurify";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "@/lib/cn";

// Mirrors the allowlist in memo-builder/editor.tsx — same tags / attrs so
// pasted Word output and our DOCX → HTML conversion stay consistent across
// the app. If you broaden this, broaden the memo editor too.
const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "br",
  "div",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "blockquote",
  "code",
  "pre",
  "button",
];
const ALLOWED_ATTR = [
  "class",
  "href",
  "target",
  "rel",
  "data-source",
  "data-page",
  "title",
];

export function sanitizeLegalHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export interface EditorHandle {
  /**
   * Insert raw HTML at the user's current caret position inside the editor.
   * If the caret isn't currently in the editor (e.g. the user clicked a
   * palette pill which moved focus), we append to the end as a fallback so
   * the user still sees something happen.
   */
  insertHtmlAtCursor: (html: string) => void;
  /** Move focus back into the editor without scrolling the page. */
  focus: () => void;
}

interface EditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Disable typing/edits (e.g. when viewing a SENT snapshot). */
  readOnly?: boolean;
}

/**
 * ContentEditable rich-text editor for legal documents.
 *
 * Important quirks worth knowing before you change this:
 *   1) We render `value` into `innerHTML` only when the prop differs from the
 *      DOM (`el.innerHTML !== sanitized`). Otherwise every parent re-render
 *      would clobber the user's caret on each keystroke.
 *   2) `onChange` fires sanitized HTML — never the raw DOM contents — so
 *      consumers can persist directly to the API without re-sanitizing.
 *   3) `insertHtmlAtCursor` uses `document.execCommand("insertHTML")`. It's
 *      deprecated but it's still the only cross-browser way to splice HTML
 *      at the caret inside a contentEditable. The replacement Editing API
 *      (Selection.modify + Range.insertNode) doesn't fire input events on
 *      Firefox, which would break our onChange contract.
 */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, placeholder, className, readOnly = false },
  ref,
) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // Track the last value we wrote to the DOM so we know when the prop change
  // is "ours" (echoed back from our onChange) vs. "theirs" (parent reset,
  // template swap, etc.). Without this every keystroke flickers the cursor.
  const lastWrittenRef = useRef<string>("");

  // Sync `value` → DOM only when the incoming value differs from what's
  // already on screen. Compare against `innerHTML` so re-renders with the
  // same value are no-ops.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const sanitized = sanitizeLegalHtml(value || "");
    if (el.innerHTML === sanitized) return;
    el.innerHTML = sanitized;
    lastWrittenRef.current = sanitized;
  }, [value]);

  const handleInput = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const sanitized = sanitizeLegalHtml(el.innerHTML);
    // If sanitization dropped something (e.g. user pasted a <script>) the
    // DOM and our outgoing value would drift. Re-write the DOM so they stay
    // in sync — using innerHTML keeps the caret roughly where the user was,
    // good enough for the script-paste edge case.
    if (el.innerHTML !== sanitized) {
      el.innerHTML = sanitized;
    }
    lastWrittenRef.current = sanitized;
    onChange(sanitized);
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      insertHtmlAtCursor: (html: string) => {
        const el = elRef.current;
        if (!el) return;
        const safe = sanitizeLegalHtml(html);
        el.focus();
        const sel = window.getSelection();
        const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        const caretInsideEditor =
          range && el.contains(range.commonAncestorContainer);
        if (caretInsideEditor) {
          // execCommand is deprecated but still works in every browser we
          // ship to, and it's the only path that fires `input` on Firefox.
          // See class comment above.
          document.execCommand("insertHTML", false, safe);
        } else {
          // Fallback: stick it at the end. Better UX than silently dropping
          // the click when focus has wandered.
          el.innerHTML = `${el.innerHTML}${safe}`;
        }
        // Sync our state out — execCommand fires input on most browsers but
        // not all (and the fallback above bypasses it entirely).
        handleInput();
      },
      focus: () => {
        elRef.current?.focus({ preventScroll: true });
      },
    }),
    [handleInput],
  );

  // Show the placeholder when the editor is empty. CSS-only — we can't use
  // `::placeholder` on a contentEditable, so we paint it via a data attr +
  // `:empty::before` (defined inline below).
  const showPlaceholder = !value || value.trim() === "" || value === "<p></p>";

  return (
    <div className={cn("relative w-full", className)}>
      {placeholder && showPlaceholder && !readOnly && (
        <div className="absolute top-3 left-4 text-sm text-slate-400 pointer-events-none select-none">
          {placeholder}
        </div>
      )}
      <div
        ref={elRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleInput}
        className={cn(
          "legal-editor min-h-[300px] w-full rounded-md border border-slate-200 bg-white",
          "px-4 py-3 text-sm leading-[1.7] text-slate-800 outline-none",
          "focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/15",
          readOnly && "bg-slate-50 text-slate-700 cursor-default",
        )}
        // Spell-check is more annoying than helpful for legal boilerplate.
        spellCheck={false}
      />
    </div>
  );
});
