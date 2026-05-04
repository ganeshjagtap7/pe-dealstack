import type { GmailMessage } from './types.js';

export interface ParsedAddress {
  name: string | null;
  email: string;
}

export interface GmailIntegrationActivityRow {
  integrationId: string;
  organizationId: string;
  userId: string;
  source: 'gmail';
  externalId: string;
  type: 'EMAIL';
  dealIds: string[];
  contactIds: string[];
  title: string;
  summary: string;
  occurredAt: string;
  durationSeconds: number | null;
  metadata: Record<string, unknown>;
  aiExtraction: null;
  rawTranscript: string;
}

export function parseEmailAddress(s: string): ParsedAddress | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/);
  if (m) {
    return { name: m[1]?.trim() || null, email: m[2].trim().toLowerCase() };
  }
  // Plain email
  if (/^[^@\s]+@[^@\s]+$/.test(trimmed)) {
    return { name: null, email: trimmed.toLowerCase() };
  }
  return null;
}

function parseAddressList(s: string | undefined): ParsedAddress[] {
  if (!s) return [];
  return s.split(',').map(p => parseEmailAddress(p)).filter((x): x is ParsedAddress => !!x);
}

function header(message: GmailMessage, name: string): string | undefined {
  return message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function occurredAtFor(message: GmailMessage): string {
  if (message.internalDate) {
    const ms = Number(message.internalDate);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  const dateHeader = header(message, 'Date');
  if (dateHeader) {
    const t = Date.parse(dateHeader);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

export function gmailMessageToIntegrationActivity(params: {
  message: GmailMessage;
  integrationId: string;
  organizationId: string;
  userId: string;
  dealIds: string[];
  contactIds: string[];
}): GmailIntegrationActivityRow {
  const { message, integrationId, organizationId, userId, dealIds, contactIds } = params;

  const subject = header(message, 'Subject') ?? '(no subject)';
  const fromHeader = header(message, 'From');
  const toHeader = header(message, 'To');
  const ccHeader = header(message, 'Cc');
  const messageId = header(message, 'Message-ID');
  const inReplyTo = header(message, 'In-Reply-To');

  return {
    integrationId,
    organizationId,
    userId,
    source: 'gmail',
    externalId: message.id,
    type: 'EMAIL',
    dealIds,
    contactIds,
    title: subject,
    summary: message.snippet ?? '',
    occurredAt: occurredAtFor(message),
    durationSeconds: null,
    metadata: {
      threadId: message.threadId,
      messageId: messageId ?? null,
      inReplyTo: inReplyTo ?? null,
      from: fromHeader ? parseEmailAddress(fromHeader) : null,
      to: parseAddressList(toHeader),
      cc: parseAddressList(ccHeader),
      labels: message.labelIds ?? [],
    },
    aiExtraction: null,
    rawTranscript: '',
  };
}

export function extractAddressEmails(message: GmailMessage): string[] {
  const all: string[] = [];
  const fromHeader = header(message, 'From');
  if (fromHeader) {
    const parsed = parseEmailAddress(fromHeader);
    if (parsed) all.push(parsed.email);
  }
  for (const h of ['To', 'Cc']) {
    const v = header(message, h);
    parseAddressList(v).forEach(a => all.push(a.email));
  }
  return all;
}
