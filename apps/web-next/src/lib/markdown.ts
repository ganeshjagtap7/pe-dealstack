// Minimal markdown → HTML converter for AI chat bubbles.
// Ported from apps/web/memo-chat.js::mdToHtml. Handles bold/italic, ordered/
// unordered lists, h3/h4 headings, paragraph breaks, and line breaks.
//
// All input is HTML-escaped FIRST (including < > & " '), then markdown syntax
// is converted to safe HTML tags. This prevents XSS even when fed to
// dangerouslySetInnerHTML — no raw user/AI HTML can pass through.
//
// This is intentionally narrow — it's for short AI responses, not full docs.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMarkdown(text: string): string {
  if (!text) return "";

  const escaped = escapeHtml(text);

  let html = escaped
    .replace(/### (.+)/g, '<h4 class="font-bold mt-3 mb-1">$1</h4>')
    .replace(/## (.+)/g, '<h3 class="font-bold mt-3 mb-1">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Line-start bullets ("* foo" or "- foo"). Use a lookbehind-style guard
    // via multiline + anchoring so intra-sentence asterisks don't match.
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> groups in a single <ul>. Doing this after the
  // per-line replacement avoids nested-list complexity we don't need here.
  html = html.replace(
    /((?:<li>.*?<\/li>\s*)+)/g,
    '<ul class="list-disc pl-5 my-1 space-y-0.5">$1</ul>',
  );

  // Remaining single-asterisk pairs become italic. Run this after lists so the
  // leading bullet "* " doesn't get mistaken for italic.
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Paragraph + line-break handling.
  html = html
    .replace(/\n{2,}/g, '</p><p class="mt-2">')
    .replace(/\n/g, "<br>");

  // Only wrap in <p> if the content doesn't already start with a block element
  // (heading, list, paragraph).
  if (!/^<(h3|h4|ul|p)/.test(html)) {
    html = `<p>${html}</p>`;
  }
  return html;
}
