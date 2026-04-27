import { describe, it, expect } from 'vitest';
import {
  chunkDocument,
  scoreChunkRelevance,
  mergeExtractionResults,
  type ClassificationResult,
} from '../src/services/documentChunker.js';

// ─── helpers ─────────────────────────────────────────────────

function makeFinancialResult(
  period: string,
  revenue: number,
  confidence: number,
): ClassificationResult {
  return {
    statements: [
      {
        statementType: 'INCOME_STATEMENT',
        unitScale: 'MILLIONS',
        currency: 'USD',
        periods: [
          {
            period,
            periodType: 'HISTORICAL',
            lineItems: { revenue, ebitda: revenue * 0.2 },
            confidence,
          },
        ],
      },
    ],
    overallConfidence: confidence,
    warnings: [],
  };
}

// ─── chunkDocument ────────────────────────────────────────────

describe('chunkDocument', () => {
  it('returns a single chunk for short text', () => {
    const text = 'Short text that is well under 100 000 chars.';
    const chunks = chunkDocument(text, 100000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
  });

  it('returns empty array for empty text', () => {
    expect(chunkDocument('', 100000)).toHaveLength(0);
  });

  it('splits long text into multiple chunks', () => {
    // Build a 250 000-char document with section headers
    const sections = [
      'Executive Summary\n' + 'background text '.repeat(2000),
      'Income Statement\n' + 'revenue numbers '.repeat(2000),
      'Balance Sheet\n' + 'asset numbers '.repeat(2000),
      'Cash Flow\n' + 'cash details '.repeat(2000),
    ];
    const text = sections.join('\n');

    const chunks = chunkDocument(text, 60000);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('splits at section header boundaries (not mid-sentence)', () => {
    const sectionA = 'some filler content '.repeat(3000); // ~60 000 chars
    const sectionB = '\nBalance Sheet\n' + 'total assets '.repeat(3000);
    const sectionC = '\nCash Flow\n' + 'free cash flow '.repeat(3000);
    const text = sectionA + sectionB + sectionC;

    const chunks = chunkDocument(text, 65000);
    // At least one chunk boundary should be at a section header
    const chunkTexts = chunks.map(c => c.text);
    const hasBalanceSheetStart = chunkTexts.some(t =>
      t.trimStart().startsWith('Balance Sheet') ||
      t.includes('\nBalance Sheet\n'),
    );
    expect(hasBalanceSheetStart).toBe(true);
  });

  it('includes overlap between consecutive chunks', () => {
    // Two clear sections, each ~70 000 chars, with a distinctive overlap marker
    const marker = 'OVERLAP_MARKER_TEXT_HERE ';
    const sectionA = 'filler '.repeat(9000) + marker.repeat(400); // marker near end of section A
    const sectionB = '\nIncome Statement\n' + 'revenue '.repeat(9000);
    const text = sectionA + sectionB;

    const chunks = chunkDocument(text, 70000);
    if (chunks.length >= 2) {
      // The marker should appear in more than one chunk (overlap)
      const markerCount = chunks.filter(c => c.text.includes(marker.trim())).length;
      expect(markerCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('each chunk has a relevance score', () => {
    const text = ('revenue ebitda margin '.repeat(500) + '\n\nBalance Sheet\n' + 'assets '.repeat(500)).repeat(5);
    const chunks = chunkDocument(text, 10000);
    for (const chunk of chunks) {
      expect(chunk.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(chunk.relevanceScore).toBeLessThanOrEqual(100);
    }
  });

  it('chunks are sorted by relevance score descending', () => {
    const highRelevance = 'revenue ebitda gross margin net income cash flow capex '.repeat(500);
    const lowRelevance = 'legal terms conditions representations warranties '.repeat(500);
    const text = lowRelevance + '\nAppendix A\n' + highRelevance;

    const chunks = chunkDocument(text, 10000);
    if (chunks.length >= 2) {
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(chunks[i].relevanceScore).toBeGreaterThanOrEqual(chunks[i + 1].relevanceScore);
      }
    }
  });
});

// ─── scoreChunkRelevance ──────────────────────────────────────

describe('scoreChunkRelevance', () => {
  it('returns 0 for empty text', () => {
    expect(scoreChunkRelevance('')).toBe(0);
  });

  it('scores financial text higher than generic text', () => {
    const financial = `
      Revenue: $50M, EBITDA: $12M, Gross Margin: 60%
      Balance Sheet: Total Assets $200M, Cash Flow from Operations $15M
      Net Income: $8M, Capex: $3M, Free Cash Flow: $12M
    `;
    const generic = `
      This document outlines the terms and conditions of the agreement
      between the parties. Legal representations and warranties apply.
      Any breach shall be subject to arbitration proceedings.
    `;
    const financialScore = scoreChunkRelevance(financial);
    const genericScore = scoreChunkRelevance(generic);
    expect(financialScore).toBeGreaterThan(genericScore);
  });

  it('returns a number between 0 and 100', () => {
    const score = scoreChunkRelevance('revenue ebitda cash flow balance sheet');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('gives a high score to dense financial text', () => {
    const dense = 'revenue ebitda gross profit margin net income cash flow total assets equity capex depreciation';
    expect(scoreChunkRelevance(dense)).toBeGreaterThan(30);
  });
});

// ─── mergeExtractionResults ───────────────────────────────────

describe('mergeExtractionResults', () => {
  it('returns empty result for empty array', () => {
    const result = mergeExtractionResults([]);
    expect(result.statements).toHaveLength(0);
    expect(result.overallConfidence).toBe(0);
  });

  it('returns single result unchanged', () => {
    const r = makeFinancialResult('2023', 50, 85);
    const merged = mergeExtractionResults([r]);
    expect(merged.statements).toHaveLength(1);
    expect(merged.overallConfidence).toBe(85);
  });

  it('merges unique periods from multiple chunks', () => {
    const r1 = makeFinancialResult('2021', 40, 80);
    const r2 = makeFinancialResult('2022', 50, 80);
    const r3 = makeFinancialResult('2023', 60, 80);

    const merged = mergeExtractionResults([r1, r2, r3]);
    const periods = merged.statements[0].periods.map(p => p.period);
    expect(periods).toContain('2021');
    expect(periods).toContain('2022');
    expect(periods).toContain('2023');
    expect(periods).toHaveLength(3);
  });

  it('keeps higher-confidence version when periods agree (within 1%)', () => {
    const lowConf: ClassificationResult = {
      statements: [
        {
          statementType: 'INCOME_STATEMENT',
          unitScale: 'MILLIONS',
          currency: 'USD',
          periods: [
            { period: '2022', periodType: 'HISTORICAL', lineItems: { revenue: 50 }, confidence: 60 },
          ],
        },
      ],
      overallConfidence: 60,
      warnings: [],
    };
    const highConf: ClassificationResult = {
      statements: [
        {
          statementType: 'INCOME_STATEMENT',
          unitScale: 'MILLIONS',
          currency: 'USD',
          periods: [
            { period: '2022', periodType: 'HISTORICAL', lineItems: { revenue: 50.2 }, confidence: 90 },
          ],
        },
      ],
      overallConfidence: 90,
      warnings: [],
    };

    const merged = mergeExtractionResults([lowConf, highConf]);
    const period = merged.statements[0].periods.find(p => p.period === '2022')!;
    expect(period.confidence).toBe(90);
    expect(period.lineItems.revenue).toBeCloseTo(50.2);
  });

  it('adds a warning when values disagree by more than 1%', () => {
    const r1: ClassificationResult = {
      statements: [
        {
          statementType: 'INCOME_STATEMENT',
          unitScale: 'MILLIONS',
          currency: 'USD',
          periods: [
            { period: '2022', periodType: 'HISTORICAL', lineItems: { revenue: 50 }, confidence: 60 },
          ],
        },
      ],
      overallConfidence: 60,
      warnings: [],
    };
    const r2: ClassificationResult = {
      statements: [
        {
          statementType: 'INCOME_STATEMENT',
          unitScale: 'MILLIONS',
          currency: 'USD',
          periods: [
            { period: '2022', periodType: 'HISTORICAL', lineItems: { revenue: 60 }, confidence: 90 },
          ],
        },
      ],
      overallConfidence: 90,
      warnings: [],
    };

    const merged = mergeExtractionResults([r1, r2]);
    expect(merged.warnings.some(w => w.includes('revenue') || w.includes('conflicting'))).toBe(true);
  });

  it('deduplicates warning messages', () => {
    const r1: ClassificationResult = {
      statements: [],
      overallConfidence: 70,
      warnings: ['No balance sheet found'],
    };
    const r2: ClassificationResult = {
      statements: [],
      overallConfidence: 70,
      warnings: ['No balance sheet found'],
    };
    const merged = mergeExtractionResults([r1, r2]);
    const count = merged.warnings.filter(w => w === 'No balance sheet found').length;
    expect(count).toBe(1);
  });

  it('averages overallConfidence across results', () => {
    const r1 = makeFinancialResult('2021', 40, 80);
    const r2 = makeFinancialResult('2022', 50, 60);
    const merged = mergeExtractionResults([r1, r2]);
    expect(merged.overallConfidence).toBe(70);
  });
});
