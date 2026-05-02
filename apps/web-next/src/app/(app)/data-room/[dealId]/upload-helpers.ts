// Upload-side validation constants and the high-value-doc heuristic used by
// the two-stage upload flow. Extracted from page.tsx for size discipline.

export const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// Returns true if at least one of the given files looks like a high-value
// CIM/teaser/financial/model document. Used to auto-check the
// "auto-update deal" toggle in the upload-confirmation modal.
export function hasHighValueDoc(files: File[]): boolean {
  return files.some((f) => {
    const name = f.name.toLowerCase();
    return (
      name.includes("cim") ||
      name.includes("teaser") ||
      name.includes("financial") ||
      name.includes("model")
    );
  });
}
