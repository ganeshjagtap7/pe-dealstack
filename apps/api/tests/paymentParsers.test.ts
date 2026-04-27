import { describe, it, expect } from 'vitest';
import { isPayPalCSV } from '../src/services/parsers/paypalParser.js';
import { isSquareCSV } from '../src/services/parsers/squareParser.js';
import { detectPaymentFormat } from '../src/services/parsers/parserRouter.js';

describe('PayPal CSV detection', () => {
  it('detects PayPal CSV from headers', () => {
    expect(isPayPalCSV(['Date', 'Gross', 'Fee', 'Net', 'From Email Address'])).toBe(true);
  });
  it('rejects non-PayPal CSV', () => {
    expect(isPayPalCSV(['Name', 'Age'])).toBe(false);
  });
  it('detects PayPal with Transaction ID instead of email', () => {
    expect(isPayPalCSV(['Date', 'Gross', 'Fee', 'Net', 'Transaction ID'])).toBe(true);
  });
  it('rejects when missing fee', () => {
    expect(isPayPalCSV(['Date', 'Gross', 'Net', 'From Email Address'])).toBe(false);
  });
});

describe('Square CSV detection', () => {
  it('detects Square CSV from headers', () => {
    expect(isSquareCSV(['Date', 'Gross Sales', 'Net Sales', 'Transaction ID'])).toBe(true);
  });
  it('rejects non-Square CSV', () => {
    expect(isSquareCSV(['Name', 'Age'])).toBe(false);
  });
  it('detects Square with just Gross Sales + Payment Method', () => {
    expect(isSquareCSV(['Date', 'Gross Sales', 'Payment Method'])).toBe(true);
  });
  it('rejects when no transaction id or payment method', () => {
    expect(isSquareCSV(['Date', 'Gross Sales', 'Net Sales'])).toBe(false);
  });
});

describe('parserRouter', () => {
  it('routes Stripe correctly', () => {
    expect(detectPaymentFormat(['Amount', 'Status', 'Customer Email'])).toBe('stripe');
  });
  it('routes PayPal correctly', () => {
    expect(detectPaymentFormat(['Gross', 'Fee', 'Net', 'From Email Address'])).toBe('paypal');
  });
  it('routes Square correctly', () => {
    expect(detectPaymentFormat(['Gross Sales', 'Net Sales', 'Transaction ID'])).toBe('square');
  });
  it('returns unknown for unrecognized', () => {
    expect(detectPaymentFormat(['Col1', 'Col2'])).toBe('unknown');
  });
});
