"use client";

import type { RefObject } from "react";
import type { EditorHandle } from "./Editor";
import { TokenPalette } from "./TokenPalette";
import { tokenLiteral } from "./constants";
import type { TokenKey } from "./types";

interface TokenInsertPanelProps {
  /** Live HTML body — drives the palette's "tokens present" checklist. */
  bodyHtml: string;
  /**
   * Ref to the document Editor. Clicking a token pill splices the
   * `[TOKEN_KEY]` literal at the caret via `insertHtmlAtCursor` — the exact
   * same marker the backend's `substituteTokens` swaps on send, so inserted
   * tokens never reach the counterparty as raw text.
   */
  editorRef: RefObject<EditorHandle | null>;
  /** Disable inserts when the editor is read-only (snapshot / preview view). */
  disabled?: boolean;
}

/**
 * Right-sidebar token panel for the per-document NDA editor (FullEditPage).
 *
 * Mirrors the palette the template verifier exposes, but scoped to a single
 * document: pick a token, it drops `[COUNTERPARTY_NAME]`-style literals into
 * the body at the caret. Without this the user could clear an `.nda-gap`
 * placeholder but had nothing to insert, so unfilled gaps shipped to the
 * counterparty as raw placeholder text.
 */
export function TokenInsertPanel({
  bodyHtml,
  editorRef,
  disabled = false,
}: TokenInsertPanelProps) {
  function handleInsert(key: TokenKey) {
    editorRef.current?.insertHtmlAtCursor(tokenLiteral(key));
  }

  return (
    <div className="pt-4 border-t border-slate-100">
      <TokenPalette
        bodyHtml={bodyHtml}
        onInsert={handleInsert}
        disabled={disabled}
        showChecklist
      />
    </div>
  );
}
