// Type definitions for the NDA / legal-document feature.
//
// Mirrors the contract from `apps/api/src/services/legalDocs/*` (built by the
// peer backend agent). Keep this in sync with the server-side TypeScript types
// — divergence here = subtle bugs at the API boundary.

export type DocType =
  | "NDA"
  | "LOI"
  | "TERM_SHEET"
  | "DEFINITIVE_AGREEMENT"
  | "SIDE_LETTER"
  | "OTHER";

export type DocStatus = "DRAFT" | "SENT" | "SIGNED" | "EXPIRED";

export interface LegalDocument {
  id: string;
  organizationId: string;
  dealId: string;
  createdById: string | null;
  docType: DocType;
  title: string;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  status: DocStatus;
  googleDocId: string;
  googleDocUrl: string;
  googleDriveFolderId: string | null;
  templateId: string | null;
  effectiveDate: string | null; // YYYY-MM-DD
  signedAt: string | null;
  expiresAt: string | null;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// The cross-deal `GET /legal-documents` endpoint embeds a small `deal` summary
// on each row so the firm-wide gallery can show which deal a document belongs
// to without a second round-trip. Mirrors `GraphWithDeal`.
export interface LegalDocumentWithDeal extends LegalDocument {
  deal: {
    id: string;
    projectName: string | null;
    target: string | null;
  };
}

// Template a user can pick when creating a new document. The backend stores the
// source Google Doc id and a placeholder map; substitution itself happens
// server-side so the frontend never touches Google Docs' API directly.
export interface LegalDocTemplate {
  id: string;
  organizationId: string;
  name: string;
  docType: DocType;
  googleDocId: string;
  placeholderMap: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Payload for `POST /deals/:dealId/legal-documents`. Discriminated by `mode`
// — "fromTemplate" copies a stored template Doc, "blank" creates an empty Doc
// in the firm's legal-docs folder.
export type CreateDocBody =
  | {
      mode: "fromTemplate";
      templateId: string;
      title: string;
      counterpartyName?: string;
      counterpartyEmail?: string;
      effectiveDate?: string;
    }
  | {
      mode: "blank";
      title: string;
      docType?: DocType;
      counterpartyName?: string;
      counterpartyEmail?: string;
      effectiveDate?: string;
    };

// Payload for `PATCH /legal-documents/:id`. All fields optional — server only
// applies what's supplied. Doc *content* lives in Google Docs and is edited
// there directly; the API only owns metadata.
export interface UpdateDocBody {
  title?: string;
  status?: DocStatus;
  counterpartyName?: string | null;
  counterpartyEmail?: string | null;
  effectiveDate?: string | null;
  signedAt?: string | null;
  expiresAt?: string | null;
}
