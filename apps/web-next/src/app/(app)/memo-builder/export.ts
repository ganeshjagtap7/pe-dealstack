import type { MemoSection, Memo } from "./components";

/**
 * Build an HTML document from memo sections and export as PDF via html2pdf.js.
 */
export async function exportMemoPDF(
  memo: Memo,
  sections: MemoSection[],
  editingContent: Record<string, string>,
) {
  const html2pdf = (await import("html2pdf.js")).default;
  const container = document.createElement("div");
  container.innerHTML = `
    <div style="font-family: 'Inter', sans-serif; padding: 40px;">
      <h1 style="font-size: 24px; color: #003366; margin-bottom: 4px;">${memo.projectName || memo.title}</h1>
      <p style="font-size: 12px; color: #666; margin-bottom: 32px;">${memo.title} &middot; ${new Date().toLocaleDateString()}</p>
      ${sections
        .map(
          (s) => `
        <div style="margin-bottom: 24px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #003366; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px;">${s.title}</h2>
          <div style="font-size: 13px; line-height: 1.6; color: #333; white-space: pre-wrap;">${editingContent[s.id] || s.content || "(No content)"}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
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
