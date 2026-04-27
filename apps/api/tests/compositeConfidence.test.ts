import { describe, it, expect } from 'vitest';
import { computeCompositeConfidence, getConfidenceTier } from '../src/services/compositeConfidence.js';

describe('computeCompositeConfidence', () => {
  it('returns high confidence when all signals agree', () => {
    const score = computeCompositeConfidence({
      llmConfidence: 95, sourceMatch: 100, mathValidation: 100, crossModelAgreement: 100,
    });
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it('returns low confidence when models disagree', () => {
    const score = computeCompositeConfidence({
      llmConfidence: 90, sourceMatch: 80, mathValidation: 100, crossModelAgreement: 30,
    });
    expect(score).toBeLessThan(80);
  });

  it('redistributes weight when Claude is unavailable', () => {
    const score = computeCompositeConfidence({
      llmConfidence: 90, sourceMatch: 90, mathValidation: 100, crossModelAgreement: null,
    });
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('getConfidenceTier', () => {
  it('returns "high" for 90-100', () => { expect(getConfidenceTier(95)).toBe('high'); });
  it('returns "medium" for 80-89', () => { expect(getConfidenceTier(85)).toBe('medium'); });
  it('returns "low" for 60-79', () => { expect(getConfidenceTier(70)).toBe('low'); });
  it('returns "very_low" for <60', () => { expect(getConfidenceTier(45)).toBe('very_low'); });
});
