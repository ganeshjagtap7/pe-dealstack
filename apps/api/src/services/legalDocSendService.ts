// Creates a real Google Doc from the LegalDocument HTML using the user's
// Google Workspace token (stored under the `google_calendar` provider —
// scopes were expanded to include drive.file + documents + gmail.send),
// grants the counterparty `writer` access by email, then emails the Doc
// link via Gmail FROM THE USER'S OWN MAILBOX. Persists googleDocId +
// googleDocUrl on the LegalDocument row.
//
// Multi-tenant by construction: each user's NDA email goes out from
// their actual Workspace Gmail address — no firm-wide domain
// verification needed, and recipients see the real sender.
//
// Failure modes the route layer maps onto frontend error codes:
//   * GOOGLE_NOT_CONNECTED  — no Workspace integration for this user  (409)
//   * GOOGLE_SCOPES_MISSING — connected before Drive/Gmail scope was added (409)
//   * NO_RECIPIENT          — neither override email nor row email    (409)
//   * NO_CONTENT            — content null/empty                      (409)
//   * DOCUMENT_NOT_FOUND    — row missing                             (404)
//   * DRIVE_API_ERROR       — Drive call failed (non-auth)            (502)
//   * EMAIL_SEND_FAILED     — Gmail send failed (Gmail's error in details) (502)

import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getProviderAccessToken } from '../integrations/_platform/tokenStore.js';
import {
  createDocFromHtml,
  setDocPermission,
} from '../integrations/googleDrive/client.js';
import { GoogleDriveError } from '../integrations/googleDrive/types.js';
import { sendMail, getMyProfile } from '../integrations/googleGmail/client.js';
import { GoogleGmailError } from '../integrations/googleGmail/types.js';
import {
  substituteTokens,
  type LegalDocTokenValues,
} from './legalDocSubstituteService.js';
import {
  loadDealForLegalDoc,
  loadOrgForLegalDoc,
} from './legalDocLookups.js';
import { registerSignatureWatch } from './legalDocSignatureWatchService.js';

export type LegalDocSendErrorCode =
  | 'GOOGLE_NOT_CONNECTED'
  | 'GOOGLE_SCOPES_MISSING'
  | 'NO_RECIPIENT'
  | 'NO_CONTENT'
  | 'DOCUMENT_NOT_FOUND'
  | 'DRIVE_API_ERROR'
  | 'EMAIL_SEND_FAILED';

export class LegalDocSendError extends Error {
  code: LegalDocSendErrorCode;
  status: number;
  details?: string;
  constructor(code: LegalDocSendErrorCode, message: string, status: number, details?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface SendLegalDocumentInput {
  documentId: string;
  organizationId: string;
  userId: string;            // internal User.id — needed to look up the Workspace token
  senderEmailHint?: string;  // optional pre-known sender email (e.g. from JWT)
  toEmail?: string;
  subject?: string;
  message?: string;          // cover message body (HTML, passed through verbatim)
}

export interface SendLegalDocumentResult {
  ok: true;
  alreadySent?: boolean;
  googleDocId: string;
  googleDocUrl: string;
  // `messageId` retained for backwards compat; populated from Gmail's id.
  messageId: string | null;
  gmailMessageId: string | null;
  senderEmail: string | null;
  sentAt: string;
}

interface DocRow {
  id: string;
  organizationId: string;
  dealId: string;
  title: string;
  content: string | null;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  counterpartyAddress: string | null;
  jurisdiction: string | null;
  effectiveDate: string | null;
  status: string;
  googleDocId: string | null;
  googleDocUrl: string | null;
  sentAt: string | null;
  sentToEmail: string | null;
}

function resolveDealLabel(
  deal: { name: string | null; company: { name: string | null } | null } | null,
  fallbackTitle: string,
): string {
  if (!deal) return fallbackTitle;
  return deal.name ?? deal.company?.name ?? fallbackTitle;
}

async function loadDocument(id: string, orgId: string): Promise<DocRow> {
  const { data, error } = await supabase
    .from('LegalDocument')
    .select(
      'id, organizationId, dealId, title, content, counterpartyName, counterpartyEmail, counterpartyAddress, jurisdiction, effectiveDate, status, googleDocId, googleDocUrl, sentAt, sentToEmail',
    )
    .eq('id', id)
    .eq('organizationId', orgId)
    .maybeSingle();
  if (error) {
    throw new LegalDocSendError('DOCUMENT_NOT_FOUND', 'Failed to load document', 502, error.message);
  }
  if (!data) {
    throw new LegalDocSendError('DOCUMENT_NOT_FOUND', 'Legal document not found', 404);
  }
  return data as DocRow;
}

const DEFAULT_COVER_HTML =
  '<p>Please review the attached NDA. You\'ve been granted edit access in Google Docs.</p>';

function buildEmailHtml(coverHtml: string, docUrl: string): string {
  // Plain inline-styled "button" — Gmail renders the HTML as-is, and we
  // want this to look acceptable in Gmail/Outlook without external CSS.
  const button =
    `<p style="margin:24px 0;">` +
    `<a href="${docUrl}" ` +
    `style="display:inline-block;padding:12px 24px;background:#1a73e8;` +
    `color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600;` +
    `font-family:Arial,Helvetica,sans-serif;">Open the NDA in Google Docs</a>` +
    `</p>` +
    `<p style="color:#6b7280;font-size:13px;font-family:Arial,Helvetica,sans-serif;">` +
    `Or paste this link into your browser: <a href="${docUrl}">${docUrl}</a>` +
    `</p>`;
  return `${coverHtml}\n${button}`;
}

function mapDriveErrorToSendError(
  err: unknown,
  stage: 'create' | 'permission',
): LegalDocSendError {
  if (err instanceof GoogleDriveError) {
    if (err.code === 'INVALID_TOKEN' || err.code === 'INSUFFICIENT_SCOPE') {
      return new LegalDocSendError(
        'GOOGLE_SCOPES_MISSING',
        'Google connection lacks Drive/Docs scope — please reconnect Google Workspace',
        409,
        err.details ?? err.message,
      );
    }
    return new LegalDocSendError(
      'DRIVE_API_ERROR',
      `Drive ${stage} call failed: ${err.message}`,
      502,
      err.details ?? err.message,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new LegalDocSendError(
    'DRIVE_API_ERROR',
    `Drive ${stage} call failed`,
    502,
    message,
  );
}

function mapGmailErrorToSendError(err: unknown): LegalDocSendError {
  if (err instanceof GoogleGmailError) {
    if (err.code === 'INVALID_TOKEN' || err.code === 'INSUFFICIENT_SCOPE') {
      return new LegalDocSendError(
        'GOOGLE_SCOPES_MISSING',
        'Google connection lacks Gmail send scope — please reconnect Google Workspace',
        409,
        err.details ?? err.message,
      );
    }
    return new LegalDocSendError(
      'EMAIL_SEND_FAILED',
      `Gmail send failed: ${err.message}`,
      502,
      err.details ?? err.message,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new LegalDocSendError(
    'EMAIL_SEND_FAILED',
    'Gmail send failed',
    502,
    message,
  );
}

export async function sendLegalDocument(
  input: SendLegalDocumentInput,
): Promise<SendLegalDocumentResult> {
  // ── Load + validate inputs ──────────────────────────────────────────
  const doc = await loadDocument(input.documentId, input.organizationId);

  // Idempotency: if already sent AND we have a googleDocId, return it.
  if (doc.status === 'SENT' && doc.googleDocId && doc.googleDocUrl) {
    return {
      ok: true,
      alreadySent: true,
      googleDocId: doc.googleDocId,
      googleDocUrl: doc.googleDocUrl,
      messageId: null,
      gmailMessageId: null,
      senderEmail: input.senderEmailHint ?? null,
      sentAt: doc.sentAt ?? new Date().toISOString(),
    };
  }

  if (!doc.content || !doc.content.trim()) {
    throw new LegalDocSendError(
      'NO_CONTENT',
      'Document has no HTML content to send',
      409,
    );
  }
  const recipient = (input.toEmail ?? doc.counterpartyEmail ?? '').trim();
  if (!recipient) {
    throw new LegalDocSendError(
      'NO_RECIPIENT',
      'No recipient email — set counterpartyEmail or pass toEmail',
      409,
    );
  }

  // ── Resolve the user's Google Workspace access token ────────────────
  // Provider id stays `google_calendar` (display name was relabeled to
  // "Google Workspace" — the id is the storage key).
  const accessToken = await getProviderAccessToken({
    userId: input.userId,
    organizationId: input.organizationId,
    providerId: 'google_calendar',
  });
  if (!accessToken) {
    throw new LegalDocSendError(
      'GOOGLE_NOT_CONNECTED',
      'Google Workspace is not connected for this user — open Settings → Integrations',
      409,
    );
  }

  const deal = await loadDealForLegalDoc(doc.dealId, input.organizationId);
  const org = await loadOrgForLegalDoc(input.organizationId);
  const dealLabel = resolveDealLabel(deal, doc.title);

  // ── Two-stage token substitution ────────────────────────────────────
  // Tokens are also substituted at CREATE time (see
  // routes/legal-documents.ts POST handler) against the create-form
  // values. We re-substitute here against the LIVE LegalDocument row +
  // current deal/org metadata so that:
  //   (a) tokens the user typed into the editor AFTER create
  //       (e.g. they hand-inserted "[COUNTERPARTY_NAME]" themselves)
  //       get replaced.
  //   (b) tokens whose values were blank at create time but filled in
  //       later via PATCH (e.g. counterparty email was unknown initially)
  //       get the current value.
  //   (c) TODAY always reflects the send date, not the create date.
  // The live `content` column is left untouched — the user keeps their
  // tokens visible in the editor for repeated sends. Only the snapshot
  // + the Google Doc body see the substituted output.
  const todayIso = new Date().toISOString().slice(0, 10);
  const tokenValues: LegalDocTokenValues = {
    COUNTERPARTY_NAME: doc.counterpartyName ?? '',
    COUNTERPARTY_ADDRESS: doc.counterpartyAddress ?? '',
    COUNTERPARTY_EMAIL: doc.counterpartyEmail ?? '',
    EFFECTIVE_DATE: doc.effectiveDate ?? '',
    JURISDICTION: doc.jurisdiction ?? '',
    DEAL_NAME: deal?.name ?? deal?.company?.name ?? '',
    FIRM_NAME: org?.name ?? '',
    TODAY: todayIso,
  };
  const substitutedContent = substituteTokens(doc.content, tokenValues);

  // ── Create the Google Doc ───────────────────────────────────────────
  let createdDoc: { id: string; webViewLink: string };
  try {
    createdDoc = await createDocFromHtml(accessToken, doc.title, substitutedContent);
  } catch (err) {
    log.error('legalDocSendService: createDocFromHtml failed', err, {
      documentId: doc.id,
    });
    throw mapDriveErrorToSendError(err, 'create');
  }

  // ── Grant the counterparty writer access ────────────────────────────
  try {
    await setDocPermission(accessToken, createdDoc.id, recipient, 'writer');
  } catch (err) {
    log.error('legalDocSendService: setDocPermission failed', err, {
      documentId: doc.id,
      googleDocId: createdDoc.id,
    });
    throw mapDriveErrorToSendError(err, 'permission');
  }

  // ── Resolve sender's mailbox address ────────────────────────────────
  // Prefer the JWT-supplied email (free); only round-trip to Gmail's
  // profile endpoint if it's missing.
  let senderEmail: string | null = input.senderEmailHint?.trim() || null;
  if (!senderEmail) {
    try {
      const profile = await getMyProfile(accessToken);
      senderEmail = profile.emailAddress;
    } catch (err) {
      // Profile fetch is best-effort — log and continue so a transient
      // failure here doesn't block the send.
      log.warn('legalDocSendService: getMyProfile failed (continuing)', {
        documentId: doc.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Email the Doc link via Gmail (from the user's own mailbox) ──────
  // `From:` is set by Gmail automatically to the authenticated user.
  // `Reply-To:` is omitted — replies naturally go to From, which is
  // already the sender's address.
  const subject = input.subject?.trim() || `${dealLabel} — NDA`;
  const coverHtml = (input.message && input.message.trim()) || DEFAULT_COVER_HTML;
  const html = buildEmailHtml(coverHtml, createdDoc.webViewLink);

  let gmailMessageId: string | null = null;
  try {
    const sent = await sendMail(accessToken, { to: recipient, subject, html });
    gmailMessageId = sent.id;
    log.info('legalDocSendService: gmail send ok', {
      documentId: doc.id,
      googleDocId: createdDoc.id,
      gmailMessageId,
      senderEmail,
    });
  } catch (err) {
    log.error('legalDocSendService: gmail send failed', err, {
      documentId: doc.id,
      googleDocId: createdDoc.id,
    });
    throw mapGmailErrorToSendError(err);
  }

  // ── Persist final state ─────────────────────────────────────────────
  const sentAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('LegalDocument')
    .update({
      status: 'SENT',
      sentAt,
      sentToEmail: recipient,
      // Snapshot the SUBSTITUTED output (what we actually pushed to the
      // Google Doc), not the raw editable draft. This is the wording the
      // counterparty sees — any later "view sent snapshot" must reflect
      // that exact text, including the resolved token values.
      contentSnapshot: substitutedContent,
      googleDocId: createdDoc.id,
      googleDocUrl: createdDoc.webViewLink,
      updatedAt: sentAt,
    })
    .eq('id', doc.id)
    .eq('organizationId', input.organizationId);
  if (updateErr) {
    // The Doc was created + the email went out — log loudly but don't
    // throw. Next list-fetch will resolve eventual consistency.
    log.error('legalDocSendService: failed to update status after send', updateErr, {
      documentId: doc.id,
      googleDocId: createdDoc.id,
      gmailMessageId,
    });
  }

  // Register a Drive watch so we can auto-detect when the counterparty signs.
  // Best-effort: registerSignatureWatch reloads the row itself (so it sees the
  // just-saved googleDocId) and never throws — it must not affect the send.
  try {
    await registerSignatureWatch({ documentId: doc.id, userId: input.userId, organizationId: input.organizationId });
  } catch (watchErr) {
    log.warn('legalDocSendService: registerSignatureWatch failed (non-fatal)', {
      documentId: doc.id,
      message: watchErr instanceof Error ? watchErr.message : String(watchErr),
    });
  }

  return {
    ok: true,
    googleDocId: createdDoc.id,
    googleDocUrl: createdDoc.webViewLink,
    messageId: gmailMessageId,
    gmailMessageId,
    senderEmail,
    sentAt,
  };
}
