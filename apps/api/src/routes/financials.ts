import { Router } from 'express';
import { z } from 'zod';
import { createRequire } from 'module';
import { prisma } from '../db.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { runFastPass, runDeepPass } from '../services/financialExtractionOrchestrator.js';
import { classifyFinancials } from '../services/financialClassifier.js';
import { validateStatements } from '../services/financialValidator.js';
import type { ClassifiedStatement, FinancialPeriod } from '../services/financialClassifier.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────

/** Download a file from a public URL and return its buffer */
async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

/** Extract text from a PDF URL */
async function extractTextFromUrl(fileUrl: string): Promise<string | null> {
  const buffer = await fetchBuffer(fileUrl);
  if (!buffer) return null;
  try {
    const data = await pdfParse(buffer);
    return data.text || null;
  } catch (err) {
    log.error('PDF parse error in financials route', err);
    return null;
  }
}

/** Convert DB FinancialStatement rows back into ClassifiedStatement[] for validation */
function rowsToClassifiedStatements(rows: any[]): ClassifiedStatement[] {
  const byType = new Map<string, ClassifiedStatement>();

  for (const row of rows) {
    if (!byType.has(row.statementType)) {
      byType.set(row.statementType, {
        statementType: row.statementType,
        unitScale: row.unitScale,
        currency: row.currency,
        periods: [],
      });
    }
    byType.get(row.statementType)!.periods.push({
      period: row.period,
      periodType: row.periodType,
      lineItems: row.lineItems as Record<string, number | null>,
      confidence: row.extractionConfidence,
    });
  }

  return Array.from(byType.values());
}

// ─── Validation Schemas ───────────────────────────────────────

const patchStatementSchema = z.object({
  lineItems: z.record(z.number().nullable()).optional(),
  period: z.string().optional(),
  periodType: z.enum(['HISTORICAL', 'PROJECTED', 'LTM']).optional(),
  currency: z.string().optional(),
  unitScale: z.enum(['MILLIONS', 'THOUSANDS', 'ACTUALS']).optional(),
});

const extractSchema = z.object({
  documentId: z.string().uuid().optional(),
});

// ─── 5a: GET /api/deals/:dealId/financials ────────────────────
// All stored financial statements for a deal

router.get('/deals/:dealId/financials', async (req, res) => {
  try {
    const { dealId } = req.params;

    const statements = await prisma.financialStatement.findMany({
      where: { dealId },
      orderBy: [{ statementType: 'asc' }, { period: 'asc' }],
    });

    res.json(statements);
  } catch (err) {
    log.error('GET financials error', err);
    res.status(500).json({ error: 'Failed to fetch financial statements' });
  }
});

// ─── 5b: GET /api/deals/:dealId/financials/summary ───────────
// Top-line summary: latest revenue, EBITDA, margins + all periods for charts

router.get('/deals/:dealId/financials/summary', async (req, res) => {
  try {
    const { dealId } = req.params;

    const incomeRows = await prisma.financialStatement.findMany({
      where: { dealId, statementType: 'INCOME_STATEMENT' },
      orderBy: { period: 'asc' },
    });

    if (incomeRows.length === 0) {
      return res.json({ hasData: false, periods: [] });
    }

    // Latest historical period for the headline numbers
    const historical = incomeRows
      .filter(r => r.periodType === 'HISTORICAL')
      .sort((a, b) => b.period.localeCompare(a.period));

    const latest = historical[0];
    const li = (row: any, key: string) =>
      (row.lineItems as Record<string, number | null>)?.[key] ?? null;

    const revenue = li(latest, 'revenue');
    const ebitda = li(latest, 'ebitda');
    const ebitdaMargin = revenue && ebitda && revenue > 0
      ? parseFloat(((ebitda / revenue) * 100).toFixed(1))
      : li(latest, 'ebitda_margin_pct');

    // Build sparkline data for all income periods
    const periods = incomeRows.map(r => ({
      period: r.period,
      periodType: r.periodType,
      revenue: li(r, 'revenue'),
      ebitda: li(r, 'ebitda'),
      ebitdaMargin: li(r, 'ebitda_margin_pct'),
      confidence: r.extractionConfidence,
    }));

    res.json({
      hasData: true,
      latestPeriod: latest.period,
      revenue,
      ebitda,
      ebitdaMargin,
      overallConfidence: Math.round(
        incomeRows.reduce((sum, r) => sum + r.extractionConfidence, 0) / incomeRows.length,
      ),
      periods,
    });
  } catch (err) {
    log.error('GET financials summary error', err);
    res.status(500).json({ error: 'Failed to fetch financial summary' });
  }
});

// ─── 5c: PATCH /api/deals/:dealId/financials/:statementId ────
// User edits/corrects an extracted value

router.patch('/deals/:dealId/financials/:statementId', async (req, res) => {
  try {
    const { dealId, statementId } = req.params;
    const user = (req as any).user;
    const updates = patchStatementSchema.parse(req.body);

    // Confirm ownership
    const existing = await prisma.financialStatement.findFirst({
      where: { id: statementId, dealId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const updated = await prisma.financialStatement.update({
      where: { id: statementId },
      data: {
        ...updates,
        reviewedAt: new Date(),
        reviewedBy: user?.id ?? null,
        // Mark as manually reviewed — preserves extraction metadata
        extractionSource: existing.extractionSource === 'gpt4o' ? 'gpt4o' : existing.extractionSource,
      },
    });

    res.json(updated);
  } catch (err) {
    log.error('PATCH financials error', err);
    res.status(500).json({ error: 'Failed to update financial statement' });
  }
});

// ─── 5d: POST /api/deals/:dealId/financials/extract ──────────
// Trigger deep pass extraction on a deal's documents

router.post('/deals/:dealId/financials/extract', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { documentId } = extractSchema.parse(req.body);

    // 1. Find the document to extract from
    let doc: any = null;

    if (documentId) {
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType')
        .eq('id', documentId)
        .eq('dealId', dealId)
        .single();
      doc = data;
    } else {
      // Default: use the most recent CIM or FINANCIALS document
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType')
        .eq('dealId', dealId)
        .in('type', ['CIM', 'FINANCIALS'])
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();
      doc = data;

      // Fallback to any document if no CIM/FINANCIALS
      if (!doc) {
        const { data: anyDoc } = await supabase
          .from('Document')
          .select('id, fileUrl, name, type, mimeType')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false })
          .limit(1)
          .single();
        doc = anyDoc;
      }
    }

    if (!doc?.fileUrl) {
      return res.status(404).json({ error: 'No document found to extract from' });
    }

    // 2. Extract text from the document
    const text = await extractTextFromUrl(doc.fileUrl);
    if (!text || text.trim().length < 100) {
      return res.status(422).json({ error: 'Could not extract readable text from document' });
    }

    // 3. Run deep pass
    const deepPassResult = await runDeepPass({
      text,
      dealId,
      documentId: doc.id,
    });

    res.json({
      success: true,
      documentUsed: { id: doc.id, name: doc.name },
      result: deepPassResult,
    });
  } catch (err) {
    log.error('POST financials extract error', err);
    res.status(500).json({ error: 'Financial extraction failed' });
  }
});

// ─── 5e: GET /api/deals/:dealId/financials/validation ────────
// Run validation checks on stored statements + return red flags

router.get('/deals/:dealId/financials/validation', async (req, res) => {
  try {
    const { dealId } = req.params;

    const rows = await prisma.financialStatement.findMany({
      where: { dealId },
      orderBy: [{ statementType: 'asc' }, { period: 'asc' }],
    });

    if (rows.length === 0) {
      return res.json({
        hasData: false,
        checks: [],
        errorCount: 0,
        warningCount: 0,
        overallPassed: true,
      });
    }

    const statements = rowsToClassifiedStatements(rows);
    const result = validateStatements(statements);

    // Only return failed checks to the client — passed checks are noise
    const flagged = result.checks.filter(c => !c.passed);

    res.json({
      hasData: true,
      checks: flagged,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      infoCount: result.infoCount,
      overallPassed: result.overallPassed,
    });
  } catch (err) {
    log.error('GET financials validation error', err);
    res.status(500).json({ error: 'Failed to run validation' });
  }
});

export default router;
