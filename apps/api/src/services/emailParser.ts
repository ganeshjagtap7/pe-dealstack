import { simpleParser } from 'mailparser';
import { log } from '../utils/logger.js';

export interface ParsedDealEmail {
  subject: string;
  from: string;
  to: string[];
  date: Date;
  bodyText: string;
  bodyHtml: string;
  attachments: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
  }>;
}

/**
 * Parse .eml file buffer into structured email data.
 */
export async function parseEmailFile(buffer: Buffer): Promise<ParsedDealEmail | null> {
  try {
    const parsed = await simpleParser(buffer);

    const fromText = typeof parsed.from === 'object'
      ? parsed.from?.text || ''
      : String(parsed.from || '');

    const toText = parsed.to
      ? (Array.isArray(parsed.to) ? parsed.to.map(t => t.text) : [parsed.to.text])
      : [];

    return {
      subject: parsed.subject || '(No Subject)',
      from: fromText,
      to: toText.filter(Boolean) as string[],
      date: parsed.date || new Date(),
      bodyText: parsed.text || '',
      bodyHtml: typeof parsed.html === 'string' ? parsed.html : '',
      attachments: (parsed.attachments || []).map(att => ({
        filename: att.filename || 'attachment',
        contentType: att.contentType || 'application/octet-stream',
        content: att.content,
        size: att.size,
      })),
    };
  } catch (error) {
    log.error('Email parse error', error);
    return null;
  }
}

/**
 * Build deal-relevant text from a parsed email for AI extraction.
 * Prefers plain text body, falls back to stripped HTML.
 */
export function buildDealTextFromEmail(email: ParsedDealEmail): string {
  let text = '';
  text += `Subject: ${email.subject}\n`;
  text += `From: ${email.from}\n`;
  text += `Date: ${email.date.toISOString().split('T')[0]}\n`;
  text += `---\n\n`;

  if (email.bodyText && email.bodyText.trim().length > 50) {
    text += email.bodyText;
  } else if (email.bodyHtml) {
    text += email.bodyHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  return text;
}
