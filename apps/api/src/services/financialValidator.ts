import { log } from '../utils/logger.js';

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  corrections: Record<string, { original: any; corrected: any; reason: string }>;
}

/**
 * Validate and sanity-check extracted financial data.
 * PE deals typically range $5M-$5B. Flag anything outside norms.
 */
export function validateFinancials(data: {
  revenue?: number | null;
  ebitda?: number | null;
  ebitdaMargin?: number | null;
  revenueGrowth?: number | null;
  dealSize?: number | null;
  employees?: number | null;
}): ValidationResult {
  const warnings: string[] = [];
  const corrections: Record<string, { original: any; corrected: any; reason: string }> = {};

  // Revenue sanity check (expect values in millions)
  if (data.revenue !== null && data.revenue !== undefined) {
    if (data.revenue > 50000) {
      warnings.push(`Revenue $${data.revenue}M seems too high. May be in thousands.`);
      corrections.revenue = {
        original: data.revenue,
        corrected: data.revenue / 1000,
        reason: 'Value exceeds $50B — likely reported in thousands, not millions',
      };
    }
    if (data.revenue > 0 && data.revenue < 0.1) {
      warnings.push(`Revenue $${data.revenue}M seems too low. May be in wrong units.`);
    }
    if (data.revenue < 0) {
      warnings.push('Revenue is negative — likely an error.');
    }
  }

  // EBITDA margin check
  if (data.ebitdaMargin !== null && data.ebitdaMargin !== undefined) {
    if (data.ebitdaMargin > 80) {
      warnings.push(`EBITDA margin of ${data.ebitdaMargin}% is unusually high. Verify.`);
    }
    if (data.ebitdaMargin < -50) {
      warnings.push(`EBITDA margin of ${data.ebitdaMargin}% indicates significant losses.`);
    }
  }

  // Cross-check: EBITDA vs Revenue
  if (data.revenue && data.ebitda && data.revenue > 0) {
    const calculatedMargin = (data.ebitda / data.revenue) * 100;
    if (data.ebitdaMargin && Math.abs(calculatedMargin - data.ebitdaMargin) > 5) {
      warnings.push(
        `EBITDA margin mismatch: extracted ${data.ebitdaMargin}% but calculated ${calculatedMargin.toFixed(1)}% from revenue/EBITDA.`
      );
    }
    if (data.ebitda > data.revenue) {
      warnings.push('EBITDA exceeds revenue — likely an extraction error.');
    }
  }

  // Revenue growth check
  if (data.revenueGrowth !== null && data.revenueGrowth !== undefined) {
    if (data.revenueGrowth > 200) {
      warnings.push(`Revenue growth of ${data.revenueGrowth}% is exceptionally high. Verify.`);
    }
  }

  // Employee count check
  if (data.employees !== null && data.employees !== undefined) {
    if (data.employees > 100000) {
      warnings.push(`${data.employees} employees seems very high for a PE target.`);
    }
    if (data.revenue && data.employees > 0) {
      const revenuePerEmployee = (data.revenue * 1000000) / data.employees;
      if (revenuePerEmployee < 10000) {
        warnings.push(`Revenue per employee ($${(revenuePerEmployee / 1000).toFixed(0)}K) is unusually low.`);
      }
    }
  }

  if (warnings.length > 0) {
    log.warn('Financial validation warnings', { warnings, corrections });
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    corrections,
  };
}
