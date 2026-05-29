import type { DocStatus, DocType } from "./types";

// Human labels for the doc-type enum. Used in dropdowns + the status pill
// subtitle when we eventually expand to LOI / Term Sheet / etc.
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  NDA: "NDA",
  LOI: "Letter of Intent",
  TERM_SHEET: "Term Sheet",
  DEFINITIVE_AGREEMENT: "Definitive Agreement",
  SIDE_LETTER: "Side Letter",
  OTHER: "Other",
};

export const STATUS_LABELS: Record<DocStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  SIGNED: "Signed",
  EXPIRED: "Expired",
};

// Tailwind class trio (bg / text / border) per status. Mirrors the legacy
// stage-pill colour map so a banker glancing at the gallery picks up status
// at a glance: slate = pre-send, amber = waiting, emerald = closed, rose =
// no longer valid.
export const STATUS_COLOR_CLASSES: Record<
  DocStatus,
  { bg: string; text: string; border: string }
> = {
  DRAFT: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" },
  SENT: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  SIGNED: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  EXPIRED: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

// All four statuses in render order — used by the EditDocModal dropdown so the
// progression reads left-to-right, draft -> signed -> expired.
export const STATUS_ORDER: DocStatus[] = ["DRAFT", "SENT", "SIGNED", "EXPIRED"];

// Documentation-only — the backend owns placeholder substitution. We surface
// these in the create-modal hover help so analysts know which strings will be
// rewritten by the template-copy step. Keep in sync with
// `apps/api/src/services/legalDocs/placeholders.ts` (the peer agent's file).
export const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  "{{counterpartyName}}": "Counterparty's legal name",
  "{{counterpartyEmail}}": "Counterparty's notice email",
  "{{effectiveDate}}": "Effective date of the agreement",
  "{{dealName}}": "Deal codename / target",
  "{{firmName}}": "Your firm's legal name",
  "{{today}}": "Today's date when the doc is created",
};
