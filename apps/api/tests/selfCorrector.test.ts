import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('../src/openai.js', () => ({
  openai: { chat: { completions: { create: mockCreate } } },
  isAIEnabled: () => true,
}));

import { runSelfCorrection, findRelevantSnippet } from '../src/services/extraction/selfCorrector.js';
import { validateExtraction } from '../src/services/extraction/validator.js';
import type { ClassifiedStatement } from '../src/services/extraction/financialClassifier.js';

function makeISStmt(rev: number, gp: number): ClassifiedStatement {
  return {
    statementType: 'INCOME_STATEMENT',
    unitScale: 'MILLIONS',
    currency: 'USD',
    periods: [{
      period: '2023',
      periodType: 'HISTORICAL',
      confidence: 70,
      lineItems: [
        { name: 'revenue', value: rev, category: 'revenue', isSubtotal: false },
        { name: 'gross_profit', value: gp, category: 'gross_profit', isSubtotal: true },
      ],
    }],
  };
}

// ── findRelevantSnippet helper ─────────────────────────────────────────────
describe('findRelevantSnippet', () => {
  it('returns snippet containing the keyword', () => {
    const text = 'Line 1\nLine 2\ngross profit 40 million\nLine 4\nLine 5';
    const snippet = findRelevantSnippet(text, 'gross_profit');
    expect(snippet.toLowerCase()).toContain('gross profit');
  });

  it('falls back to first 2000 chars when keyword not found', () => {
    const text = 'a'.repeat(5000);
    const snippet = findRelevantSnippet(text, 'gross_profit');
    expect(snippet).toHaveLength(2000);
  });
});

// ── runSelfCorrection: GP > Revenue corrected by GPT ───────────────────────
describe('runSelfCorrection — corrects flagged item', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ newValue: 40 }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
  });

  it('applies correction when GPT returns valid newValue', async () => {
    const stmts = [makeISStmt(50, 80)];
    const initialValidation = validateExtraction(stmts);
    expect(initialValidation.flaggedItems.length).toBeGreaterThan(0);

    const result = await runSelfCorrection('Revenue 50M, gross profit 40M', stmts, initialValidation);
    expect(result.corrections.length).toBeGreaterThan(0);
    expect(result.corrections[0].itemsCorrected[0].oldValue).toBe(80);
    expect(result.corrections[0].itemsCorrected[0].newValue).toBe(40);
  });
});

// ── runSelfCorrection: GPT returns null → no correction applied ────────────
describe('runSelfCorrection — GPT returns null', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ newValue: null }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    });
  });

  it('does not crash and makes no correction', async () => {
    const stmts = [makeISStmt(50, 80)];
    const initialValidation = validateExtraction(stmts);
    const result = await runSelfCorrection('Revenue 50M', stmts, initialValidation);
    const corrected = result.corrections.flatMap(c => c.itemsCorrected);
    expect(corrected).toHaveLength(0);
  });
});

// ── runSelfCorrection: max retries exhausted → needsManualReview = true ────
describe('runSelfCorrection — max retries exhausted', () => {
  beforeEach(() => {
    // GPT returns a value still > revenue, so validation keeps failing
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ newValue: 100 }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    });
  });

  it('sets needsManualReview=true when still invalid after retries', async () => {
    const stmts = [makeISStmt(50, 80)];
    const initialValidation = validateExtraction(stmts);
    const result = await runSelfCorrection('Revenue 50M', stmts, initialValidation);
    expect(result.needsManualReview).toBe(true);
  });
});

// ── runSelfCorrection: no flagged items → no corrections ──────────────────
describe('runSelfCorrection — no flagged items', () => {
  it('returns empty corrections and needsManualReview=false', async () => {
    const stmts = [makeISStmt(100, 40)]; // valid
    const initialValidation = validateExtraction(stmts);
    expect(initialValidation.isValid).toBe(true);
    expect(initialValidation.flaggedItems).toHaveLength(0);

    const result = await runSelfCorrection('Revenue 100M gross profit 40M', stmts, initialValidation);
    expect(result.corrections).toHaveLength(0);
    expect(result.needsManualReview).toBe(false);
  });
});
