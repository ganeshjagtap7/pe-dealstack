// ─── legalDocSendService — Phase 3 ─────────────────────────
// Pivot from Phase 2's `.docx-attachment-via-Resend` to:
//   1. Mint a fresh Google access token for the sending user
//      (via Supabase Google OAuth + UserGoogleAuth refresh).
//   2. Create a real Google Doc from LegalDocument.content HTML.
//   3. Grant the counterparty `writer` ACL by email.
//   4. Resend an email with the cover message + a button-styled
//      link to the Doc.
//   5. Persist googleDocId / googleDocUrl / contentSnapshot,
//      flip status to SENT, set sentAt + sentToEmail.
//
// Idempotency: if the doc is already SENT and has a googleDocId,
// we no-op and return the cached link instead of re-creating.
//
// Failure modes mapped to frontend codes:
//   GOOGLE_NOT_CONNECTED        409 — getUserGoogleAccessToken NOT_CONNECTED
//   GOOGLE_TOKEN_REFRESH_FAILED 409 — getUserGoogleAccessToken REFRESH_FAILED
//   RESEND_NOT_CONFIGURED       409 — RESEND_API_KEY missing
//   NO_RECIPIENT                409 — no `toEmail` AND row counterpartyEmail null
//   NO_CONTENT                  409 — content empty
//   DRIVE_API_ERROR             502 — Google API call failed
//   EMAIL_SEND_FAILED           502 — Resend send failed
// ─────────────────────────────────────────────────────────────

import { Resend } from 'resend';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import {
  getUserGoogleAccessToken,
  GoogleAuthError,
} from './googleAuthService.js';
import {
  createDocFromHtml,
  setDocPermission,
} from '../integrations/googleDrive/client.js';
import { GoogleDriveError } from '../integrations/googleDrive/types.js';

export type LegalDocSendErrorCode =
  | 'GOOGLE_NOT_CONNECTED'
  | 'GOOGLE_TOKEN_REFRESH_FAILED'
  | 'RESEND_NOT_CONFIGURED'
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
  /** Supabase auth user id of the sender (used to fetch their Google token). */
  userId: string;
  toEmail?: string;
  subject?: string;
  /** Cover message body (HTML or plain — passed through). */
  message?: string;
}

export interface SendLegalDocumentResult {
  ok: true;
  alreadySent?: boolean;
  googleDocId: string;
  googleDocUrl: string;
  messageId?: string | null;
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
  status: string;
  googleDocId: string | null;
  googleDocUrl: string | null;
  sentAt: string | null;
}

interface DealRow {
  id: string;
  name: string | null;
  companyName: string | null;
}

function resolveDealLabel(deal: DealRow | null, fallbackTitle: string): string {
  if (!deal) return fallbackTitle;
  return deal.name ?? deal.companyName ?? fallbackTitle;
}

async function loadDocument(id: string, orgId: string): Promise<DocRow> {
  const { data, error } = await supabase
    .from('LegalDocument')
    .select(
      'id, organizationId, dealId, title, content, counterpartyName, counterpartyEmail, ' +
        'status, googleDocId, googleDocUrl, sentAt',
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
  return data as unknown as DocRow;
}

async function loadDeal(dealId: string): Promise<DealRow | null> {
  const { data } = await supabase
    .from('Deal')
    .select('id, name, companyName')
    .eq('id', dealId)
    .maybeSingle();
  return (data as DealRow | null) ?? null;
}

const DEFAULT_COVER_HTML =
  "<p>Please review the attached NDA. You've been granted edit access to comment or sign.</p>";

function buildEmailHtml(coverHtml: string, docUrl: string): string {
  // Append a button-styled link to the doc.
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${coverHtml}
      <div style="text-align: center; margin: 32px 0;">
        <a href="${docUrl}"
           style="background: linear-gradient(135deg, #003366, #0055aa); color: #ffffff;
                  padding: 14px 32px; text-decoration: none; border-radius: 8px;
                  display: inline-block; font-size: 16px; font-weight: 600;">
          Open NDA in Google Docs
        </a>
      </div>
      <p style="color: #888; font-size: 12px; text-align: center;">
        Or paste this link into your browser:<br/>
        <a href="${docUrl}">${docUrl}</a>
      </p>
    </div>
  `.trim();
}

async function getAccessTokenOrThrow(userId: string): Promise<string> {
  try {
    return await getUserGoogleAccessToken(userId);
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      if (err.code === 'NOT_CONNECTED') {
        throw new LegalDocSendError(
          'GOOGLE_NOT_CONNECTED',
          'No Google account connected. Sign in with Google to enable NDA sends.',
          409,
        );
      }
      throw new LegalDocSendError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        'Failed to refresh Google access token. Sign out and sign in again with Google.',
        409,
        err.details,
      );
    }
    throw err;
  }
}

export async function sendLegalDocument(
  input: SendLegalDocumentInput,
): Promise<SendLegalDocumentResult> {
  if (!process.env.RESEND_API_KEY) {
    throw new LegalDocSendError(
      'RESEND_NOT_CONFIGURED',
      'RESEND_API_KEY is not configured on this server',
      409,
    );
  }

  const doc = await loadDocument(input.documentId, input.organizationId);
  const recipient = (input.toEmail ?? doc.counterpartyEmail ?? '').trim();
  if (!recipient) {
    throw new LegalDocSendError(
      'NO_RECIPIENT',
      'No recipient email — set counterpartyEmail or pass toEmail',
      409,
    );
  }
  if (!doc.content || !doc.content.trim()) {
    throw new LegalDocSendError(
      'NO_CONTENT',
      'Document has no HTML content to send',
      409,
    );
  }

  // ── Idempotency: already-sent docs short-circuit. ───────
  if (doc.status === 'SENT' && doc.googleDocId && doc.googleDocUrl) {
    return {
      ok: true,
      alreadySent: true,
      googleDocId: doc.googleDocId,
      googleDocUrl: doc.googleDocUrl,
      sentAt: doc.sentAt ?? new Date().toISOString(),
    };
  }

  const accessToken = await getAccessTokenOrThrow(input.userId);
  const deal = await loadDeal(doc.dealId);
  const dealLabel = resolveDealLabel(deal, doc.title);

  // ── Create the Google Doc from HTML. ────────────────────
  let driveResult: { id: string; webViewLink: string };
  try {
    driveResult = await createDocFromHtml(
      accessToken,
      doc.title,
      doc.content,
      undefined,
    );
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    log.error('legalDocSendService: createDocFromHtml failed', err, {
      documentId: doc.id,
    });
    if (err instanceof GoogleDriveError && err.code === 'INVALID_TOKEN') {
      throw new LegalDocSendError(
        'GOOGLE_TOKEN_REFRESH_FAILED',
        'Google rejected our access token. Sign out and sign back in.',
        409,
        details,
      );
    }
    throw new LegalDocSendError('DRIVE_API_ERROR', 'Failed to create Google Doc', 502, details);
  }

  // ── Grant the counterparty writer access. ───────────────
  try {
    await setDocPermission(accessToken, driveResult.id, recipient, 'writer');
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    log.error('legalDocSendService: setDocPermission failed', err, {
      documentId: doc.id,
      fileId: driveResult.id,
    });
    throw new LegalDocSendError(
      'DRIVE_API_ERROR',
      'Failed to grant Google Doc access',
      502,
      details,
    );
  }

  // ── Resend the cover email with the Doc link. ───────────
  const subject = input.subject?.trim() || `${dealLabel} — NDA`;
  const coverHtml = (input.message && input.message.trim()) || DEFAULT_COVER_HTML;
  const html = buildEmailHtml(coverHtml, driveResult.webViewLink);
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const resend = new Resend(process.env.RESEND_API_KEY);
  let messageId: string | null = null;
  try {
    const send = await resend.emails.send({
      from,
      to: recipient,
      subject,
      html,
    });
    if (send.error) {
      throw new LegalDocSendError(
        'EMAIL_SEND_FAILED',
        'Resend rejected the send',
        502,
        send.error.message ?? JSON.stringify(send.error),
      );
    }
    messageId = send.data?.id ?? null;
  } catch (err) {
    if (err instanceof LegalDocSendError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    log.error('legalDocSendService: resend send failed', err, {
      documentId: doc.id,
    });
    throw new LegalDocSendError(
      'EMAIL_SEND_FAILED',
      'Resend send failed',
      502,
      message,
    );
  }

  // ── Persist outcome on the LegalDocument row. ───────────
  const sentAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('LegalDocument')
    .update({
      status: 'SENT',
      sentAt,
      sentToEmail: recipient,
      contentSnapshot: doc.content,
      googleDocId: driveResult.id,
      googleDocUrl: driveResult.webViewLink,
      updatedAt: sentAt,
    })
    .eq('id', doc.id)
    .eq('organizationId', input.organizationId);
  if (updateErr) {
    // Email already went out — log loudly but don't throw. Frontend
    // still sees ok:true; the row will refresh on next list fetch.
    log.error('legalDocSendService: failed to update status after send', updateErr, {
      documentId: doc.id,
      messageId,
    });
  }

  return {
    ok: true,
    googleDocId: driveResult.id,
    googleDocUrl: driveResult.webViewLink,
    messageId,
    sentAt,
  };
}
