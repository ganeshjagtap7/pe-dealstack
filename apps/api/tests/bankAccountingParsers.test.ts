import { describe, it, expect } from 'vitest';
import { isBankCSV } from '../src/services/parsers/bankParser.js';
import { isAccountingCSV } from '../src/services/parsers/accountingParser.js';

describe('Bank CSV detection', () => {
  it('detects bank CSV', () => {
    expect(isBankCSV(['Date', 'Description', 'Amount', 'Balance'])).toBe(true);
  });

  it('detects bank CSV with debit/credit', () => {
    expect(isBankCSV(['Date', 'Description', 'Debit', 'Credit', 'Balance'])).toBe(true);
  });

  it('detects bank CSV with memo column', () => {
    expect(isBankCSV(['Date', 'Memo', 'Amount', 'Balance'])).toBe(true);
  });

  it('rejects Stripe CSV', () => {
    expect(isBankCSV(['Date', 'Amount', 'Status', 'Customer Email'])).toBe(false);
  });

  it('rejects PayPal CSV', () => {
    expect(isBankCSV(['Date', 'Description', 'Gross', 'Fee', 'Balance'])).toBe(false);
  });

  it('rejects non-bank CSV', () => {
    expect(isBankCSV(['Name', 'Age'])).toBe(false);
  });

  it('rejects CSV missing date column', () => {
    expect(isBankCSV(['Description', 'Amount', 'Balance'])).toBe(false);
  });
});

describe('Accounting CSV detection', () => {
  it('detects QuickBooks P&L export', () => {
    expect(isAccountingCSV(['', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'TOTAL'])).toBe(true);
  });

  it('detects export with Total column only', () => {
    expect(isAccountingCSV(['Category', 'Q1', 'Q2', 'Total'])).toBe(true);
  });

  it('detects export with abbreviated month names', () => {
    expect(isAccountingCSV(['Account', 'Jan', 'Feb', 'Mar'])).toBe(true);
  });

  it('detects export with full month names', () => {
    expect(isAccountingCSV(['', 'January 2026', 'February 2026'])).toBe(true);
  });

  it('rejects non-accounting CSV', () => {
    expect(isAccountingCSV(['Name', 'Age', 'City'])).toBe(false);
  });

  it('rejects Stripe-like CSV without month/total headers', () => {
    expect(isAccountingCSV(['Date', 'Amount', 'Status', 'Customer Email'])).toBe(false);
  });
});
