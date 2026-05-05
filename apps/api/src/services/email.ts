import { Resend } from 'resend';
import { log } from '../utils/logger.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  from?: string;
}

/**
 * Send a transactional email via Resend. Logs a warning and returns
 * { sent: false } if Resend is not configured. Never throws — callers
 * should not block on email delivery.
 */
export async function sendEmail({ to, subject, text, from }: SendEmailInput): Promise<{ sent: boolean }> {
  if (!resend) {
    log.warn('sendEmail: Resend not configured (RESEND_API_KEY missing)', { to, subject });
    return { sent: false };
  }
  const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  try {
    const { error } = await resend.emails.send({ from: fromEmail, to, subject, text });
    if (error) {
      log.error('sendEmail: Resend error', { error, to, subject });
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    log.error('sendEmail: unexpected error', { err, to, subject });
    return { sent: false };
  }
}

export const isEmailConfigured = () => !!resend;
