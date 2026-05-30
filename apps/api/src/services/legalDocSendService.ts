// Creates a real Google Doc from the LegalDocument HTML using the user's
// Google Workspace token (stored under the `google_calendar` provider —
// scopes were expanded to include drive.file + documents), grants the
// counterparty `writer` access by email, then emails the Doc link via
// Resend. Persists googleDocId + googleDocUrl on the LegalDocument row.
//
// Failure modes the route layer maps onto frontend error codes:
//   * GOOGLE_NOT_CONNECTED  — no Workspace integration for this user  (409)
//   * GOOGLE_SCOPES_MISSING — connected before Drive scope was added  (409)
//   * RESEND_NOT_CONFIGURED — RESEND_API_KEY env missing              (409)
//   * NO_RECIPIENT          — neither override email nor row email    (409)
//   * NO_CONTENT            — content null/empty                      (409)
//   * DOCUMENT_NOT_FOUND    — row missing                             (404)
//   * DRIVE_API_ERROR       — Drive call failed (non-auth)            (502)
//   * EMAIL_SEND_FAILED     — Resend upstream error                   (502)

import { Resend } from 'resend';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getProviderAccessToken } from '../integrations/_platform/tokenStore.js';
import {
  createDocFromHtml,
  setDocPermission,
} from '../integrations/googleDrive/client.js';
import { GoogleDriveError } from '../integrations/googleDrive/types.js';

export type LegalDocSendErrorCode =
  | 'GOOGLE_NOT_CONNECTED'
  | 'GOOGLE_SCOPES_MISSING'
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
  userId: string;            // internal User.id — needed to look up the Workspace token
  toEmail?: string;
  subject?: string;
  message?: string;          // cover message body (HTML, passed through verbatim)
}

export interface SendLegalDocumentResult {
  ok: true;
  alreadySent?: boolean;
  googleDocId: string;
  googleDocUrl: string;
  messageId: string | null;
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
  sentToEmail: string | null;
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
      'id, organizationId, dealId, title, content, counterpartyName, counterpartyEmail, status, googleDocId, googleDocUrl, sentAt, sentToEmail',
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

async function loadDeal(dealId: string): Promise<DealRow | null> {
  const { data } = await supabase
    .from('Deal')
    .select('id, name, companyName')
    .eq('id', dealId)
    .maybeSingle();
  return (data as DealRow | null) ?? null;
}

const DEFAULT_COVER_HTML =
  '<p>Please review the attached NDA. You\'ve been granted edit access in Google Docs.</p>';

function buildEmailHtml(coverHtml: string, docUrl: string): string {
  // Plain inline-styled "button" — Resend renders the HTML as-is, and we
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

  if (!process.env.RESEND_API_KEY) {
    throw new LegalDocSendError(
      'RESEND_NOT_CONFIGURED',
      'RESEND_API_KEY is not configured on this server',
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

  const deal = await loadDeal(doc.dealId);
  const dealLabel = resolveDealLabel(deal, doc.title);

  // ── Create the Google Doc ───────────────────────────────────────────
  let createdDoc: { id: string; webViewLink: string };
  try {
    createdDoc = await createDocFromHtml(accessToken, doc.title, doc.content);
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

  // ── Email the Doc link via Resend ───────────────────────────────────
  const subject = input.subject?.trim() || `${dealLabel} — NDA`;
  const coverHtml = (input.message && input.message.trim()) || DEFAULT_COVER_HTML;
  const html = buildEmailHtml(coverHtml, createdDoc.webViewLink);
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
      googleDocId: createdDoc.id,
    });
    throw new LegalDocSendError(
      'EMAIL_SEND_FAILED',
      'Resend send failed',
      502,
      message,
    );
  }

  // ── Persist final state ─────────────────────────────────────────────
  const sentAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('LegalDocument')
    .update({
      status: 'SENT',
      sentAt,
      sentToEmail: recipient,
      contentSnapshot: doc.content,
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
      messageId,
    });
  }

  return {
    ok: true,
    googleDocId: createdDoc.id,
    googleDocUrl: createdDoc.webViewLink,
    messageId,
    sentAt,
  };
}
