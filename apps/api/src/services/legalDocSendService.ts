// Renders a LegalDocument.content (HTML) into a .docx, snapshots the
// HTML at send-time, and ships the result via Resend as an attachment.
// Mirrors the Resend init pattern from routes/documents-sharing.ts:11.
//
// Failure modes the route layer maps onto frontend error codes:
//   * RESEND_NOT_CONFIGURED — RESEND_API_KEY missing (status 409)
//   * NO_RECIPIENT          — neither override email nor row email   (status 409)
//   * EMAIL_SEND_FAILED     — Resend upstream error (status 502)

import { Resend } from 'resend';
// html-to-docx is a CJS module; this import works because tsconfig has
// esModuleInterop enabled. Returns a Buffer when given a Node-side call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import htmlToDocx from 'html-to-docx';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

export type LegalDocSendErrorCode =
  | 'RESEND_NOT_CONFIGURED'
  | 'NO_RECIPIENT'
  | 'NO_CONTENT'
  | 'DOCUMENT_NOT_FOUND'
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
  toEmail?: string;
  subject?: string;
  message?: string; // cover message body (HTML or plain — passed through)
}

export interface SendLegalDocumentResult {
  ok: true;
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
}

interface DealRow {
  id: string;
  name: string | null;
  companyName: string | null;
}

function safeFilenameFragment(value: string): string {
  // Trim to a sane length, swap path/Drive-unfriendly chars for spaces.
  return value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Document';
}

function resolveDealLabel(deal: DealRow | null, fallbackTitle: string): string {
  if (!deal) return fallbackTitle;
  return deal.name ?? deal.companyName ?? fallbackTitle;
}

async function loadDocument(id: string, orgId: string): Promise<DocRow> {
  const { data, error } = await supabase
    .from('LegalDocument')
    .select('id, organizationId, dealId, title, content, counterpartyName, counterpartyEmail, status')
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
  '<p>Please find the NDA attached. Reply with any redlines.</p>';

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

  const deal = await loadDeal(doc.dealId);
  const dealLabel = resolveDealLabel(deal, doc.title);

  // Render HTML → .docx. html-to-docx returns a Buffer in Node.
  let docxBuffer: Buffer;
  try {
    const result = await htmlToDocx(doc.content, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      pageNumber: false,
    });
    // The lib returns Buffer in Node but Blob in the browser; coerce
    // both to Buffer so the Resend SDK is happy.
    if (Buffer.isBuffer(result)) {
      docxBuffer = result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if (typeof (result as any)?.arrayBuffer === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      docxBuffer = Buffer.from(await (result as any).arrayBuffer());
    } else {
      docxBuffer = Buffer.from(result as unknown as ArrayBuffer);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('legalDocSendService: html-to-docx failed', err, {
      documentId: doc.id,
    });
    throw new LegalDocSendError(
      'EMAIL_SEND_FAILED',
      'Failed to render document to .docx',
      502,
      message,
    );
  }

  const counterpartyLabel = safeFilenameFragment(doc.counterpartyName ?? 'Counterparty');
  const dealFragment = safeFilenameFragment(dealLabel);
  const filename = `${dealFragment} - NDA - ${counterpartyLabel}.docx`;
  const subject = input.subject?.trim() || `${dealLabel} — NDA`;
  const coverHtml = (input.message && input.message.trim()) || DEFAULT_COVER_HTML;
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const resend = new Resend(process.env.RESEND_API_KEY);
  let messageId: string | null = null;
  try {
    const send = await resend.emails.send({
      from,
      to: recipient,
      subject,
      html: coverHtml,
      attachments: [
        {
          filename,
          content: docxBuffer,
        },
      ],
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

  const sentAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('LegalDocument')
    .update({
      status: 'SENT',
      sentAt,
      sentToEmail: recipient,
      contentSnapshot: doc.content,
      updatedAt: sentAt,
    })
    .eq('id', doc.id)
    .eq('organizationId', input.organizationId);
  if (updateErr) {
    // Email already sent — log loudly but don't throw. The frontend
    // will still see ok:true; the row will refresh on next list fetch.
    log.error('legalDocSendService: failed to update status after send', updateErr, {
      documentId: doc.id,
      messageId,
    });
  }

  return { ok: true, messageId, sentAt };
}
