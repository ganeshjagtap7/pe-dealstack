// Parses uploaded template files (.docx / .html / .md) into the
// sanitized HTML body we store on LegalDocTemplate.bodyHtml. The
// admin manually marks up placeholders in a second step (verify),
// so this service is pure parse → sanitize — no token detection.
//
// Sanitisation allowlist matches apps/web-next/src/app/(app)/memo-builder/
// editor.tsx so what an admin sees in the verifier is exactly what the
// rest of the app will render later.

import mammoth from 'mammoth';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { log } from '../utils/logger.js';

export type TemplateFileKind = 'docx' | 'html' | 'md';

export class LegalDocParseError extends Error {
  code: 'INVALID_FILE_FORMAT';
  status: number;
  details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.code = 'INVALID_FILE_FORMAT';
    this.status = 400;
    this.details = details;
  }
}

// Allowlist — keep in lockstep with apps/web-next/src/app/(app)/memo-builder/editor.tsx:11-15.
// Mirror at sanitiseLegalDocHtml so PATCH /legal-documents/:id can reuse it.
const ALLOWED_TAGS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'br',
  'div', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'blockquote', 'code', 'pre', 'button',
];
const ALLOWED_ATTR = [
  'class', 'href', 'target', 'rel',
  'data-source', 'data-page', 'title',
];

export function sanitiseLegalDocHtml(html: string): string {
  // sanitize-html is pure JS — no jsdom dep — so we sidestep the ESM/CJS
  // require interop bomb that isomorphic-dompurify hit on Vercel's Node 24
  // runtime ("require() of ES Module ...encoding-lite.js not supported"
  // via jsdom → html-encoding-sniffer → @exodus/bytes). Same allowlist
  // semantics; frontend DOMPurify still re-sanitises on render.
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTR.reduce<Record<string, string[]>>(
      (acc, attr) => {
        acc['*'] = (acc['*'] ?? []).concat(attr);
        return acc;
      },
      {},
    ),
    // Preserve placeholder tokens like [COUNTERPARTY_NAME] inside text nodes
    // (sanitize-html default already does this — explicit for clarity).
    disallowedTagsMode: 'discard',
  });
}

export interface ParseTemplateInput {
  buffer: Buffer;
  kind: TemplateFileKind;
}

export interface ParseTemplateResult {
  bodyHtml: string;
}

export async function parseTemplateFile(
  input: ParseTemplateInput,
): Promise<ParseTemplateResult> {
  const { buffer, kind } = input;
  if (!buffer || buffer.length === 0) {
    throw new LegalDocParseError('Empty upload — no file content received');
  }

  let rawHtml: string;
  try {
    if (kind === 'docx') {
      const result = await mammoth.convertToHtml({ buffer });
      rawHtml = result.value;
    } else if (kind === 'html') {
      rawHtml = buffer.toString('utf-8');
    } else if (kind === 'md') {
      // marked.parse returns string | Promise<string> depending on async mode;
      // we always await to normalise.
      const parsed = await Promise.resolve(marked.parse(buffer.toString('utf-8')));
      rawHtml = typeof parsed === 'string' ? parsed : String(parsed);
    } else {
      throw new LegalDocParseError(`Unsupported file kind: ${kind as string}`);
    }
  } catch (err) {
    if (err instanceof LegalDocParseError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    log.warn('legalDocParseService: parse failed', { kind, message });
    throw new LegalDocParseError(
      `Failed to parse ${kind} template`,
      message,
    );
  }

  if (!rawHtml || !rawHtml.trim()) {
    throw new LegalDocParseError(
      `Parsed ${kind} template was empty after extraction`,
    );
  }

  const bodyHtml = sanitiseLegalDocHtml(rawHtml);
  return { bodyHtml };
}
