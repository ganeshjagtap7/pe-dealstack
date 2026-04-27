import { describe, it, expect } from 'vitest';
import { isStripeCSV } from '../src/services/parsers/stripeParser.js';

describe('stripeParser', () => {
  it('detects Stripe CSV from headers', () => {
    const headers = ['id', 'Created date (UTC)', 'Amount', 'Amount Refunded', 'Currency', 'Status', 'Customer Email'];
    expect(isStripeCSV(headers)).toBe(true);
  });

  it('rejects non-Stripe CSV', () => {
    const headers = ['Name', 'Age', 'City'];
    expect(isStripeCSV(headers)).toBe(false);
  });

  it('handles case-insensitive headers', () => {
    const headers = ['AMOUNT', 'STATUS', 'CUSTOMER EMAIL'];
    expect(isStripeCSV(headers)).toBe(true);
  });
});
