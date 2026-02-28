import { Router } from 'express';
import { z } from 'zod';
import { createRequire } from 'module';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { runFastPass, runDeepPass } from '../services/financialExtractionOrchestrator.js';
import { classifyFinancialsVision } from '../services/visionExtractor.js';
import { extractTextFromExcel, isExcelFile } from '../services/excelFinancialExtractor.js';
import { validateStatements } from '../services/financialValidator.js';
import { extractTablesFromPdf, isAzureConfigured } from '../services/azureDocIntelligence.js';
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

    const { data: statements, error } = await supabase
      .from('FinancialStatement')
      .select('*, Document(id, name)')
      .eq('dealId', dealId)
      .order('statementType', { ascending: true })
      .order('period', { ascending: true });

    if (error) throw error;

    res.json(statements ?? []);
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

    const { data: incomeRows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('statementType', 'INCOME_STATEMENT')
      .order('period', { ascending: true });

    if (error) throw error;

    if (!incomeRows || incomeRows.length === 0) {
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
    const { data: existing, error: findError } = await supabase
      .from('FinancialStatement')
      .select('id')
      .eq('id', statementId)
      .eq('dealId', dealId)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('FinancialStatement')
      .update({
        ...updates,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.id ?? null,
      })
      .eq('id', statementId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updated);
  } catch (err) {
    log.error('PATCH financials error', err);
    res.status(500).json({ error: 'Failed to update financial statement' });
  }
});

// ─── Shared extraction helper ─────────────────────────────────

/**
 * Run financial extraction on a document, choosing the right path:
 * Excel → CSV text → GPT-4o classifier
 * PDF (text-rich) → pdf-parse → GPT-4o classifier
 * PDF (scanned) → GPT-4o Vision
 */
async function extractFinancialsForDoc(
  doc: { id: string; fileUrl: string; name?: string | null; mimeType?: string | null },
  dealId: string,
): Promise<{ extractionMethod: string; result: any }> {
  const excel = isExcelFile(doc.mimeType, doc.name);

  if (excel) {
    const buffer = await fetchBuffer(doc.fileUrl);
    if (!buffer) throw new Error('Could not download Excel file');
    const excelText = extractTextFromExcel(buffer);
    if (!excelText || excelText.trim().length < 50) throw new Error('Excel file appears empty or has no readable financial data');

    const result = await runDeepPass({ text: excelText, dealId, documentId: doc.id, extractionSource: 'gpt4o' });
    return { extractionMethod: 'excel', result };
  }

  // ── Layer 1: Azure Document Intelligence (if configured) ─────
  // Best quality for structured financial tables in complex CIM layouts.
  // If not configured or returns no tables, falls through to text/vision paths.
  if (isAzureConfigured()) {
    log.info('Extraction helper: trying Azure Doc Intelligence (Layer 1)', { dealId, documentId: doc.id });
    const pdfBufferForAzure = await fetchBuffer(doc.fileUrl);
    if (pdfBufferForAzure) {
      const azureResult = await extractTablesFromPdf(pdfBufferForAzure);
      if (azureResult && azureResult.text.trim().length > 50) {
        log.info('Extraction helper: Azure succeeded, running GPT-4o classifier', {
          dealId, documentId: doc.id, tableCount: azureResult.tableCount, pageCount: azureResult.pageCount,
        });
        const result = await runDeepPass({ text: azureResult.text, dealId, documentId: doc.id, extractionSource: 'azure' });
        return { extractionMethod: 'azure', result };
      }
      log.info('Extraction helper: Azure returned no tables, falling back to text/vision', { dealId, documentId: doc.id });
    }
  }

  // ── Layer 2: pdf-parse text → GPT-4o (text-rich PDFs) ────────
  const text = await extractTextFromUrl(doc.fileUrl);
  const textIsSparse = !text || text.trim().length < 200;

  if (!textIsSparse) {
    const result = await runDeepPass({ text: text!, dealId, documentId: doc.id, extractionSource: 'gpt4o' });
    return { extractionMethod: 'text', result };
  }

  // ── Layer 3: GPT-4o Vision (scanned / image-only PDFs) ───────
  log.info('Extraction helper: PDF text sparse, switching to vision fallback', {
    dealId, documentId: doc.id, textLength: text?.trim().length ?? 0,
  });

  const pdfBuffer = await fetchBuffer(doc.fileUrl);
  if (!pdfBuffer) throw new Error('Could not download document for vision extraction');

  const visionClassification = await classifyFinancialsVision(pdfBuffer, doc.name ?? 'document.pdf');
  if (!visionClassification) throw new Error('Could not extract financial data from this document. The PDF may be encrypted or unsupported.');

  const result = await runDeepPass({ text: '', dealId, documentId: doc.id, classification: visionClassification, extractionSource: 'vision' });
  return { extractionMethod: 'vision', result };
}

// ─── 5d: POST /api/deals/:dealId/financials/extract ──────────
// Trigger deep pass extraction on a deal's documents

router.post('/deals/:dealId/financials/extract', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { documentId } = extractSchema.parse(req.body);

    // Find the document to extract from
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
      // Prefer most recent CIM or FINANCIALS document
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType')
        .eq('dealId', dealId)
        .in('type', ['CIM', 'FINANCIALS'])
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();
      doc = data;

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

    const { extractionMethod, result } = await extractFinancialsForDoc(doc, dealId);

    res.json({ success: true, documentUsed: { id: doc.id, name: doc.name }, extractionMethod, result });
  } catch (err: any) {
    log.error('POST financials extract error', err);
    const status = err.message?.includes('Could not') || err.message?.includes('appears empty') ? 422 : 500;
    res.status(status).json({ error: err.message ?? 'Financial extraction failed' });
  }
});

// ─── 5e: GET /api/deals/:dealId/financials/validation ────────
// Run validation checks on stored statements + return red flags

router.get('/deals/:dealId/financials/validation', async (req, res) => {
  try {
    const { dealId } = req.params;

    const { data: rows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .order('statementType', { ascending: true })
      .order('period', { ascending: true });

    if (error) throw error;

    if (!rows || rows.length === 0) {
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

// ─── 2: POST /api/documents/:documentId/extract-financials ────
// Document-level extraction — looks up dealId from the document itself.
// Useful when triggering extraction from the documents list rather than the deal page.

router.post('/documents/:documentId/extract-financials', async (req, res) => {
  try {
    const { documentId } = req.params;

    const { data: doc } = await supabase
      .from('Document')
      .select('id, fileUrl, name, type, mimeType, dealId')
      .eq('id', documentId)
      .single();

    if (!doc?.fileUrl || !doc?.dealId) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const { extractionMethod, result } = await extractFinancialsForDoc(doc, doc.dealId);

    res.json({
      success: true,
      documentUsed: { id: doc.id, name: doc.name },
      dealId: doc.dealId,
      extractionMethod,
      result,
    });
  } catch (err: any) {
    log.error('POST document extract-financials error', err);
    const status = err.message?.includes('Could not') || err.message?.includes('appears empty') ? 422 : 500;
    res.status(status).json({ error: err.message ?? 'Financial extraction failed' });
  }
});

export default router;
