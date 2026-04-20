import DOMPurify from "dompurify";
import type { MemoSection, Memo } from "./components";

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
