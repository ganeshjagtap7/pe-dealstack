import { Router } from 'express';
import { z } from 'zod';
import { createRequire } from 'module';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { runDeepPass } from '../services/financialExtractionOrchestrator.js';
import { classifyFinancialsVision } from '../services/visionExtractor.js';
import { extractTextFromExcel, isExcelFile } from '../services/excelFinancialExtractor.js';
import { validateStatements } from '../services/financialValidator.js';
import { extractTablesFromPdf, isAzureConfigured } from '../services/azureDocIntelligence.js';
import type { ClassifiedStatement } from '../services/financialClassifier.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import { runFinancialAgent } from '../services/agents/financialAgent/index.js';
import type { FileType } from '../services/agents/financialAgent/index.js';
import { acquireExtractionSlot, releaseExtractionSlot } from '../services/agents/financialAgent/concurrency.js';
import { downloadFileBuffer, extractStoragePath } from '../utils/storage.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────

/** Download a file from Supabase storage (supports both storage paths and legacy full URLs) */
async function fetchBuffer(fileUrlOrPath: string): Promise<Buffer | null> {
  return downloadFileBuffer(fileUrlOrPath);
}

/** Extract text from a PDF stored in Supabase */
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

/** Detect file type for the financial agent */
function detectFileType(mimeType?: string | null, fileName?: string | null): FileType {
  if (isExcelFile(mimeType, fileName)) return 'excel';
  return 'pdf';
}

// ─── Validation Schemas ───────────────────────────────────────

const extractSchema = z.object({
  documentId: z.string().uuid().optional(),
  documentType: z.enum(['financial_statements', 'payment_data', 'bank_statement', 'accounting_export', 'auto_detect']).optional().default('auto_detect'),
  // 'single'         — most-recent CIM/FINANCIALS, fallback to any (default, BC).
  // 'all_financials' — every CIM/FINANCIALS doc on the deal, sequentially.
  // 'all'            — every doc on the deal regardless of type.
  // Always coerced to 'single' when documentId is provided.
  mode: z.enum(['single', 'all_financials', 'all']).optional().default('single'),
});

// Per-doc helper: runs slot acquire/release + runFinancialAgent for one doc
// and returns a normalized record for the aggregate response.

interface PerDocResult {
  id: string;
  name: string;
  status: 'completed' | 'failed' | 'skipped_no_slot';
  statementsStored: number;
  periodsStored: number;
  overallConfidence: number | null;
  hasConflicts: boolean;
  extractionMethod?: string;
  agent?: any;
  error?: string;
}

async function processOneDoc(
  doc: { id: string; fileUrl: string; name: string | null; type?: string | null; mimeType?: string | null },
  dealId: string,
  orgId: string,
): Promise<PerDocResult> {
  const baseName = doc.name ?? 'document';
  const fail = (status: 'failed' | 'skipped_no_slot', error: string): PerDocResult => ({
    id: doc.id, name: baseName, status, statementsStored: 0, periodsStored: 0, overallConfidence: null, hasConflicts: false, error,
  });

  const fileBuffer = await fetchBuffer(doc.fileUrl);
  if (!fileBuffer) return fail('failed', 'Could not download document file');
  if (!acquireExtractionSlot(orgId)) return fail('skipped_no_slot', 'Extraction slot unavailable');

  try {
    const agentResult = await runFinancialAgent({
      dealId,
      documentId: doc.id,
      fileBuffer,
      fileName: baseName,
      fileType: detectFileType(doc.mimeType, doc.name),
      organizationId: orgId,
    });
    return {
      id: doc.id,
      name: baseName,
      status: agentResult.status === 'completed' ? 'completed' : 'failed',
      statementsStored: agentResult.statementIds.length,
      periodsStored: agentResult.periodsStored,
      overallConfidence: agentResult.overallConfidence,
      hasConflicts: agentResult.hasConflicts,
      extractionMethod: agentResult.extractionSource,
      agent: {
        status: agentResult.status,
        retryCount: agentResult.retryCount,
        validationResult: agentResult.validationResult,
        steps: agentResult.steps,
        error: agentResult.error,
        crossVerifyResult: agentResult.crossVerifyResult || null,
      },
      error: agentResult.error ?? undefined,
    };
  } catch (err: any) {
    log.error('processOneDoc failed', { dealId, docId: doc.id, err: err?.message });
    return fail('failed', err?.message ?? 'Agent run failed');
  } finally {
    releaseExtractionSlot(orgId);
  }
}

// ─── 5d: POST /api/deals/:dealId/financials/extract ──────────
// Trigger financial agent extraction on a deal's documents

router.post('/deals/:dealId/financials/extract', async (req, res) => {
  try {
    const { dealId } = req.params;
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    const { documentId, documentType, mode } = extractSchema.parse(req.body);

    // Resolve target documents based on mode + documentId precedence.
    // documentId always wins (single-doc behaviour) regardless of mode.
    let docs: any[] = [];
    let effectiveMode: 'single' | 'all_financials' | 'all' = mode;

    if (documentId) {
      effectiveMode = 'single';
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType, createdAt')
        .eq('id', documentId)
        .eq('dealId', dealId)
        .single();
      if (data) docs = [data];
    } else if (mode === 'all_financials') {
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType, createdAt')
        .eq('dealId', dealId)
        .in('type', ['CIM', 'FINANCIALS'])
        .order('createdAt', { ascending: false });
      docs = (data ?? []).filter((d) => !!d.fileUrl);
    } else if (mode === 'all') {
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType, createdAt')
        .eq('dealId', dealId)
        .order('createdAt', { ascending: false });
      docs = (data ?? []).filter((d) => !!d.fileUrl);
    } else {
      // mode === 'single': prefer most recent CIM or FINANCIALS, fallback to any.
      const { data } = await supabase
        .from('Document')
        .select('id, fileUrl, name, type, mimeType, createdAt')
        .eq('dealId', dealId)
        .in('type', ['CIM', 'FINANCIALS'])
        .order('createdAt', { ascending: false })
        .limit(1)
        .single();
      if (data) docs = [data];

      if (docs.length === 0) {
        const { data: anyDoc } = await supabase
          .from('Document')
          .select('id, fileUrl, name, type, mimeType, createdAt')
          .eq('dealId', dealId)
          .order('createdAt', { ascending: false })
          .limit(1)
          .single();
        if (anyDoc) docs = [anyDoc];
      }
    }

    if (docs.length === 0 || !docs[0]?.fileUrl) {
      return res.status(404).json({ error: 'No document found to extract from' });
    }

    // CSV-style parsers (payment/bank/accounting) are single-doc only — explicit
    // user choices, no multi-doc loop. Preserves pre-existing single-doc shape.
    if (
      effectiveMode === 'single' &&
      (documentType === 'payment_data' || documentType === 'bank_statement' || documentType === 'accounting_export')
    ) {
      const doc = docs[0];
      const fileBuffer = await fetchBuffer(doc.fileUrl);
      if (!fileBuffer) {
        return res.status(422).json({ error: 'Could not download document file' });
      }

      let result;
      let method = 'csv_parser';

      if (documentType === 'payment_data') {
        const { parsePaymentData } = await import('../services/parsers/parserRouter.js');
        result = await parsePaymentData(fileBuffer, doc.name, dealId, doc.id);
      } else if (documentType === 'bank_statement') {
        const { parseBankCSV } = await import('../services/parsers/bankParser.js');
        result = await parseBankCSV(fileBuffer, doc.name, dealId, doc.id);
        method = 'bank_parser';
      } else {
        const { parseAccountingCSV } = await import('../services/parsers/accountingParser.js');
        result = await parseAccountingCSV(fileBuffer, doc.name, dealId, doc.id);
        method = 'accounting_parser';
      }

      return res.json({
        success: true,
        mode: effectiveMode,
        documentUsed: { id: doc.id, name: doc.name },
        documentsProcessed: [
          {
            id: doc.id,
            name: doc.name ?? 'document',
            status: 'completed',
            statementsStored: result.periodsStored,
            periodsStored: result.periodsStored,
            overallConfidence: 100,
          },
        ],
        extractionMethod: method,
        result: {
          statementsStored: result.periodsStored,
          periodsStored: result.periodsStored,
          documentsUsed: 1,
          documentsFailed: 0,
          overallConfidence: 100,
          statementIds: result.statementIds,
          warnings: result.warnings,
          hasConflicts: false,
        },
        hasConflicts: false,
        agent: { status: 'completed', retryCount: 0, steps: result.steps },
      });
    }

    // Agent-based extraction. Sequential loop — each doc acquires/releases its
    // own slot inside processOneDoc, keeping the 2-concurrent-per-org invariant.
    // Single-mode: surface 429 up-front if no slot (BC). Multi-doc modes:
    // record 'skipped_no_slot' per doc and continue.
    const perDoc: PerDocResult[] = [];

    for (const doc of docs) {
      if (effectiveMode === 'single') {
        if (!acquireExtractionSlot(orgId)) {
          return res.status(429).json({
            error: 'Too many concurrent extractions. Please wait for the current extraction to complete.',
          });
        }
        // Release immediately — processOneDoc re-acquires its own slot.
        releaseExtractionSlot(orgId);
      }

      const r = await processOneDoc(doc, dealId, orgId);
      perDoc.push(r);
      if (r.status !== 'completed') {
        log.warn('Per-doc extraction issue', { dealId, docId: doc.id, status: r.status, error: r.error });
      }
    }

    const totals = perDoc.reduce(
      (acc, r) => {
        acc.statementsStored += r.statementsStored;
        acc.periodsStored += r.periodsStored;
        if (r.status === 'completed') acc.documentsUsed += 1;
        else acc.documentsFailed += 1;
        if (r.hasConflicts) acc.hasConflicts = true;
        return acc;
      },
      { statementsStored: 0, periodsStored: 0, documentsUsed: 0, documentsFailed: 0, hasConflicts: false },
    );

    const aggregateSuccess = perDoc.some((r) => r.status === 'completed');

    // Single-doc back-compat: flat fields alongside the new aggregate.
    const first = perDoc[0];
    const singleDocFields =
      effectiveMode === 'single' && first
        ? { documentUsed: { id: first.id, name: first.name }, extractionMethod: first.extractionMethod, agent: first.agent ?? null }
        : {};

    return res.json({
      success: aggregateSuccess,
      mode: effectiveMode,
      ...singleDocFields,
      documentsProcessed: perDoc.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        statementsStored: r.statementsStored,
        periodsStored: r.periodsStored,
        overallConfidence: r.overallConfidence,
        ...(r.error ? { error: r.error } : {}),
      })),
      result: {
        statementsStored: totals.statementsStored,
        periodsStored: totals.periodsStored,
        documentsUsed: totals.documentsUsed,
        documentsFailed: totals.documentsFailed,
        overallConfidence: first?.overallConfidence ?? null,
        hasConflicts: totals.hasConflicts,
      },
      hasConflicts: totals.hasConflicts,
    });
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
    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    const { data: rows, error } = await supabase
      .from('FinancialStatement')
      .select('*')
      .eq('dealId', dealId)
      .eq('isActive', true)
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

    const orgId = getOrgId(req);
    const dealAccess = await verifyDealAccess(doc.dealId, orgId);
    if (!dealAccess) return res.status(404).json({ error: 'Deal not found' });

    // Download file buffer for the agent
    const fileBuffer = await fetchBuffer(doc.fileUrl);
    if (!fileBuffer) {
      return res.status(422).json({ error: 'Could not download document file' });
    }

    // Run the LangGraph financial agent
    if (!acquireExtractionSlot(orgId)) {
      return res.status(429).json({
        error: 'Too many concurrent extractions. Please wait for the current extraction to complete.',
      });
    }

    let agentResult;
    try {
      agentResult = await runFinancialAgent({
        dealId: doc.dealId,
        documentId: doc.id,
        fileBuffer,
        fileName: doc.name ?? 'document',
        fileType: detectFileType(doc.mimeType, doc.name),
        organizationId: orgId,
      });
    } finally {
      releaseExtractionSlot(orgId);
    }

    res.json({
      success: agentResult.status === 'completed',
      documentUsed: { id: doc.id, name: doc.name },
      dealId: doc.dealId,
      extractionMethod: agentResult.extractionSource,
      result: {
        statementsStored: agentResult.statementIds.length,
        periodsStored: agentResult.periodsStored,
        overallConfidence: agentResult.overallConfidence,
        statementIds: agentResult.statementIds,
        warnings: agentResult.warnings,
        hasConflicts: agentResult.hasConflicts,
      },
      agent: {
        status: agentResult.status,
        retryCount: agentResult.retryCount,
        validationResult: agentResult.validationResult,
        steps: agentResult.steps,
        error: agentResult.error,
        crossVerifyResult: agentResult.crossVerifyResult || null,
      },
    });
  } catch (err: any) {
    log.error('POST document extract-financials error', err);
    const status = err.message?.includes('Could not') || err.message?.includes('appears empty') ? 422 : 500;
    res.status(status).json({ error: err.message ?? 'Financial extraction failed' });
  }
});

export default router;
