import DOMPurify from "dompurify";
import type { MemoSection, Memo } from "./components";

// ---------------------------------------------------------------------------
// Markdown / clipboard / share helpers — ported from c1d7a4d's memo-editor.js
// ---------------------------------------------------------------------------

/**
 * Build a Markdown representation of a memo and trigger a .md download.
 */
export function exportMemoMarkdown(
  memo: Memo,
  sections: MemoSection[],
  editingContent: Record<string, string>,
): void {
  const title = memo.projectName || memo.title || "Investment Memo";
  let md = `# ${title} — Investment Committee Memo\n\n`;
  md += `**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n`;

  sections.forEach((section, i) => {
    md += `## ${i + 1}. ${section.title}\n\n`;
    const content = editingContent[section.id] || section.content || "";
    if (content) md += htmlToMarkdown(content) + "\n\n";
  });

  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_IC_Memo.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "### ")
    .replace(/<strong>/gi, "**").replace(/<\/strong>/gi, "**")
    .replace(/<em>/gi, "*").replace(/<\/em>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Copy the memo's plaintext content to the clipboard.
 * Falls back to execCommand('copy') on browsers without the Clipboard API.
 */
export async function exportMemoClipboard(
  sections: MemoSection[],
  editingContent: Record<string, string>,
): Promise<void> {
  const text = sections
    .map((s, i) => {
      const content = editingContent[s.id] || s.content || "";
      return `${i + 1}. ${s.title}\n${htmlToMarkdown(content)}`;
    })
    .join("\n\n");

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure contexts
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/**
 * Copy the current memo URL to the clipboard for sharing.
 */
export async function shareMemoLink(): Promise<void> {
  const url = window.location.href;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an HTML document from memo sections and export as PDF via html2pdf.js.
 * All user-provided values are escaped or sanitized before HTML interpolation.
 */
export async function exportMemoPDF(
  memo: Memo,
  sections: MemoSection[],
  editingContent: Record<string, string>,
) {
  const html2pdf = (await import("html2pdf.js")).default;
  const container = document.createElement("div");
  container.style.cssText = "font-family: 'Inter', sans-serif; padding: 40px;";

  // Header — escaped text
  const header = document.createElement("div");
  header.innerHTML = `
    <h1 style="font-size: 24px; color: #003366; margin-bottom: 4px;">${escapeText(memo.projectName || memo.title)}</h1>
    <p style="font-size: 12px; color: #666; margin-bottom: 32px;">${escapeText(memo.title)} &middot; ${new Date().toLocaleDateString()}</p>
  `;
  container.appendChild(header);

  // Sections — content sanitized with DOMPurify (may contain HTML from AI generation)
  for (const s of sections) {
    const section = document.createElement("div");
    section.style.marginBottom = "24px";
    const content = editingContent[s.id] || s.content || "(No content)";
    const hasHtml = /<[a-z][\s\S]*>/i.test(content);
    section.innerHTML = `
      <h2 style="font-size: 16px; font-weight: bold; color: #003366; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px;">${escapeText(s.title)}</h2>
      <div style="font-size: 13px; line-height: 1.6; color: #333; white-space: pre-wrap;">${hasHtml ? DOMPurify.sanitize(content) : escapeText(content)}</div>
    `;
    container.appendChild(section);
  }

  await html2pdf()
    .set({
      margin: [10, 15],
      filename: `${(memo.projectName || memo.title).replace(/[^a-zA-Z0-9]/g, "_")}_Memo.pdf`,
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(container)
    .save();
}
