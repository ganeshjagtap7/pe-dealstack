/**
 * Cross-Verify Node Tests
 *
 * Tests the reconcileResults pure function which compares GPT-4o extracted
 * values against Claude Haiku's independent verification.
 */

import { describe, it, expect } from 'vitest';
import { reconcileResults } from '../src/services/agents/financialAgent/nodes/crossVerifyNode.js';
import type { ClaudeVerification } from '../src/services/agents/financialAgent/nodes/crossVerifyNode.js';

// ─── reconcileResults ─────────────────────────────────────────

describe('reconcileResults', () => {
  describe('both models agree', () => {
    it('should increment agreedCount when both models return the same value', () => {
      const gpt4oValues = { revenue: 125.3, ebitda: 30.1 };
      const claudeResults: ClaudeVerification[] = [
        { field: 'revenue', primary_value: 125.3, verified: true, your_value: 125.3, issue: null, confidence: 95 },
        { field: 'ebitda', primary_value: 30.1, verified: true, your_value: 30.1, issue: null, confidence: 92 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(2);
      expect(result.flaggedValues).toHaveLength(0);
    });

    it('should agree when values are within 1% tolerance', () => {
      const gpt4oValues = { revenue: 100.0 };
      const claudeResults: ClaudeVerification[] = [
        // Claude says 100.5 — within 1% of 100.0
        { field: 'revenue', primary_value: 100.0, verified: true, your_value: 100.5, issue: null, confidence: 88 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(1);
      expect(result.flaggedValues).toHaveLength(0);
    });

    it('should agree when both values are null', () => {
      const gpt4oValues = { capex: null };
      const claudeResults: ClaudeVerification[] = [
        { field: 'capex', primary_value: null, verified: true, your_value: null, issue: null, confidence: 70 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(1);
      expect(result.flaggedValues).toHaveLength(0);
    });
  });

  describe('models disagree', () => {
    it('should push to flaggedValues when values differ beyond 1%', () => {
      const gpt4oValues = { revenue: 125.3 };
      const claudeResults: ClaudeVerification[] = [
        {
          field: 'revenue',
          primary_value: 125.3,
          verified: false,
          your_value: 12.53,
          issue: 'Unit scale error: value appears to be in actuals, not millions',
          confidence: 85,
        },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].field).toBe('revenue');
      expect(result.flaggedValues[0].gpt4o_value).toBe(125.3);
      expect(result.flaggedValues[0].claude_value).toBe(12.53);
      expect(result.flaggedValues[0].issue).toContain('Unit scale error');
    });

    it('should flag when Claude says verified=false even if values match numerically', () => {
      const gpt4oValues = { ebitda: 30.0 };
      const claudeResults: ClaudeVerification[] = [
        {
          field: 'ebitda',
          primary_value: 30.0,
          verified: false,
          your_value: 30.0,
          issue: 'Value labeled as EBITDA in source but appears to be EBIT (no depreciation addback shown)',
          confidence: 60,
        },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].issue).toContain('EBIT');
    });

    it('should flag when GPT-4o has null but Claude found a value', () => {
      const gpt4oValues = { gross_profit: null };
      const claudeResults: ClaudeVerification[] = [
        {
          field: 'gross_profit',
          primary_value: null,
          verified: false,
          your_value: 55.2,
          issue: 'Value exists in source but was not extracted',
          confidence: 80,
        },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].gpt4o_value).toBeNull();
      expect(result.flaggedValues[0].claude_value).toBe(55.2);
    });

    it('should flag when GPT-4o has a value but Claude sees null', () => {
      const gpt4oValues = { long_term_debt: 200.0 };
      const claudeResults: ClaudeVerification[] = [
        {
          field: 'long_term_debt',
          primary_value: 200.0,
          verified: true,
          your_value: null,
          issue: null,
          confidence: 50,
        },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].issue).toContain('One model found a value');
    });

    it('should handle multiple fields with mixed agree/disagree', () => {
      const gpt4oValues = { revenue: 100.0, ebitda: 20.0, net_income: 10.0 };
      const claudeResults: ClaudeVerification[] = [
        { field: 'revenue', primary_value: 100.0, verified: true, your_value: 100.0, issue: null, confidence: 95 },
        {
          field: 'ebitda',
          primary_value: 20.0,
          verified: false,
          your_value: 2.0,
          issue: 'Possible decimal error: 20.0 vs 2.0',
          confidence: 70,
        },
        { field: 'net_income', primary_value: 10.0, verified: true, your_value: 10.0, issue: null, confidence: 90 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(2);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].field).toBe('ebitda');
    });
  });

  describe('empty / edge cases', () => {
    it('should return 0 agreed and 0 flagged for empty claude results', () => {
      const gpt4oValues = { revenue: 100.0, ebitda: 25.0 };
      const claudeResults: ClaudeVerification[] = [];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(0);
    });

    it('should return 0 agreed and 0 flagged for empty gpt4o values with empty claude results', () => {
      const gpt4oValues = {};
      const claudeResults: ClaudeVerification[] = [];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(0);
    });

    it('should handle zero values correctly (not divide by zero in tolerance check)', () => {
      const gpt4oValues = { capex: 0 };
      const claudeResults: ClaudeVerification[] = [
        { field: 'capex', primary_value: 0, verified: true, your_value: 0, issue: null, confidence: 90 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(1);
      expect(result.flaggedValues).toHaveLength(0);
    });

    it('should flag zero vs non-zero as disagreement', () => {
      const gpt4oValues = { capex: 0 };
      const claudeResults: ClaudeVerification[] = [
        { field: 'capex', primary_value: 0, verified: true, your_value: 5.0, issue: null, confidence: 75 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      expect(result.agreedCount).toBe(0);
      expect(result.flaggedValues).toHaveLength(1);
    });

    it('should ignore claude fields that are not in gpt4o values', () => {
      const gpt4oValues = { revenue: 100.0 };
      const claudeResults: ClaudeVerification[] = [
        { field: 'revenue', primary_value: 100.0, verified: true, your_value: 100.0, issue: null, confidence: 95 },
        // Claude verified a field GPT-4o didn't extract — should still process from claude side
        { field: 'ebitda', primary_value: null, verified: false, your_value: 30.0, issue: 'Missing from extraction', confidence: 80 },
      ];

      const result = reconcileResults(gpt4oValues, claudeResults);

      // revenue agrees, ebitda gets flagged (gpt4o_value will be null from gpt4oValues lookup)
      expect(result.agreedCount).toBe(1);
      expect(result.flaggedValues).toHaveLength(1);
      expect(result.flaggedValues[0].gpt4o_value).toBeNull();
      expect(result.flaggedValues[0].claude_value).toBe(30.0);
    });
  });
});
