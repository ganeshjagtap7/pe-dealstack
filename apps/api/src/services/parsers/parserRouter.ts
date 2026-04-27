/**
 * parserRouter.ts — Detects payment CSV format and routes to correct parser.
 */

import type { ParseResult } from './parserTypes.js';
import { isStripeCSV, parsePaymentCSV } from './stripeParser.js';
import { isPayPalCSV, parsePayPalCSV } from './paypalParser.js';
import { isSquareCSV, parseSquareCSV } from './squareParser.js';

export type PaymentFormat = 'stripe' | 'paypal' | 'square' | 'unknown';

/**
 * Detect payment CSV format from headers.
 */
export function detectPaymentFormat(headers: string[]): PaymentFormat {
  if (isStripeCSV(headers)) return 'stripe';
  if (isPayPalCSV(headers)) return 'paypal';
  if (isSquareCSV(headers)) return 'square';
  return 'unknown';
}

/**
 * Parse a payment CSV buffer using the appropriate parser.
 */
export async function parsePaymentData(
  fileBuffer: Buffer,
  fileName: string,
  dealId: string,
  documentId: string,
): Promise<ParseResult> {
  const text = fileBuffer.toString('utf-8');
  const firstLine = text.split('\n')[0] || '';
  const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));

  const format = detectPaymentFormat(headers);

  switch (format) {
    case 'stripe':
      return parsePaymentCSV(fileBuffer, fileName, dealId, documentId);
    case 'paypal':
      return parsePayPalCSV(fileBuffer, fileName, dealId, documentId);
    case 'square':
      return parseSquareCSV(fileBuffer, fileName, dealId, documentId);
    default:
      return {
        periodsStored: 0,
        statementIds: [],
        warnings: ['Could not detect payment CSV format. Supported: Stripe, PayPal, Square.'],
        steps: [{ timestamp: new Date().toISOString(), node: 'csv_parser', message: 'Unknown CSV format' }],
        monthlyData: [],
      };
  }
}
