/**
 * financial-extraction.ts — Standalone extraction API route.
 *
 * POST /api/financial-extraction/extract
 *   Accepts a multipart file upload (PDF, Excel, or Image) and runs the
 *   full extraction pipeline, returning structured financial statements,
 *   validation results, and cost metadata.
 *
 * This route is intentionally separate from the deal-scoped
 * /api/deals/:dealId/financials/extract route so it can be used for
 * ad-hoc testing / assignment evaluation without Supabase state.
 *
 * Integrates with the existing app.ts middleware chain
 * (auth, orgScope, errorHandler) and is registered in app.ts.
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { runExtractionPipeline } from '../services/extraction/pipeline.js';
import { log } from '../utils/logger.js';
import { logAuditEvent, AUDIT_ACTIONS, RESOURCE_TYPES } from '../services/auditLog.js';
import { getOrgId } from '../middleware/orgScope.js';

const router = Router();

// ─── Multer — disk storage so pipeline can read by path ───────

const upload = multer({
  dest: path.join(process.cwd(), 'uploads', 'extraction'),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/octet-stream', // Fallback for some browsers/systems
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/tiff',
    ];
    const extAllowed = /\.(pdf|xlsx|xls|xlsm|xlsb|png|jpg|jpeg|webp|tiff?)$/i;

    const mimeOk = allowed.includes(file.mimetype);
    const extOk = extAllowed.test(file.originalname ?? '');

    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      console.warn('File upload rejected:', {
        mimetype: file.mimetype,
        originalname: file.originalname,
        mimeOk,
        extOk
      });
      cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname}). Please upload a PDF, Excel, or Image file.`));
    }
  },
});

// ─── Cleanup helper ───────────────────────────────────────────

async function cleanupUploadedFile(filePath?: string): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // Non-fatal — temp file cleanup failure should not affect the response
  }
}

// ─── POST /api/financial-extraction/extract ───────────────────

/**
 * @route  POST /api/financial-extraction/extract
 * @desc   Run end-to-end financial extraction pipeline on an uploaded file
 * @access Private (requires auth middleware from app.ts)
 *
 * Request body (multipart/form-data):
 *   file  — PDF, Excel, or Image (max 20 MB)
 *
 * Response 200:
 * {
 *   "status": "success" | "partial",
 *   "statements": [...],
 *   "validation": { "checks": [], "errorCount": 0, ... },
 *   "corrections": null | { "corrections": [], "needsManualReview": false, ... },
 *   "metadata": {
 *     "fileName": "...",
 *     "format": "pdf" | "excel" | "image",
 *     "processingTime": { "totalMs": 1234, ... },
 *     "tokensUsed": 2500,
 *     "estimatedCost": 0.0175
 *   }
 * }
 *
 * Response 400: No file / unsupported format
 * Response 422: Pipeline ran but extracted nothing
 * Response 500: Unexpected server error
 */
router.post('/extract', upload.single('file'), async (req, res) => {
  const uploadedPath = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'failed',
        errorCode: 'NO_FILE_PROVIDED',
        message: 'A file is required. Send it as multipart/form-data with field name "file".',
      });
    }

    const { path: filePath, mimetype, originalname } = req.file;

    log.info('financial-extraction route: file received', {
      fileName: originalname,
      mimeType: mimetype,
      sizeBytes: req.file.size,
    });

    const result = await runExtractionPipeline(filePath, mimetype, originalname);

    // Always clean up the temp upload
    await cleanupUploadedFile(filePath);

    if (result.status === 'failed') {
      return res.status(422).json({
        ...result,
        errorCode: 'EXTRACTION_FAILED',
        message: result.metadata.error ?? 'Could not extract financial data from the document.',
      });
    }

    // Audit log — fire and forget, never blocks the HTTP response
    const dealId = req.body?.dealId as string | undefined;
    logAuditEvent(
      {
        action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
        userId: (req as any).user?.id,
        organizationId: getOrgId(req),
        resourceType: RESOURCE_TYPES.DOCUMENT,
        resourceId: dealId,
        resourceName: req.file.originalname,
        description: `Financial extraction: ${result.status}`,
        metadata: {
          event: 'financial_extraction',
          status: result.status,
          format: result.metadata.format,
          statementsExtracted: result.statements.length,
          tokensUsed: result.metadata.tokensUsed,
          estimatedCostUsd: result.metadata.estimatedCost,
          processingTimeMs: result.metadata.processingTime.total,
          validationPassed: result.validation.isValid,
          needsManualReview: result.corrections?.needsManualReview ?? false,
        },
      },
      req,
    ).catch(() => {
      // Non-fatal — never surface audit errors to the user
    });

    return res.status(200).json(result);
  } catch (err: any) {
    await cleanupUploadedFile(uploadedPath);

    log.error('financial-extraction route: unexpected error', err);

    const isUnsupportedFormat = err.message?.toLowerCase().includes('unsupported');
    const isPasswordProtected = err.message?.toLowerCase().includes('password');

    if (isUnsupportedFormat || isPasswordProtected) {
      return res.status(400).json({
        status: 'failed',
        errorCode: isPasswordProtected ? 'PASSWORD_PROTECTED_PDF' : 'UNSUPPORTED_FORMAT',
        message: err.message,
      });
    }

    return res.status(500).json({
      status: 'failed',
      errorCode: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred during extraction.',
    });
  }
});

// ─── GET /api/financial-extraction/health ────────────────────

/**
 * Lightweight health check for the extraction service.
 * Useful for CI and integration test setup.
 */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'financial-extraction',
    timestamp: new Date().toISOString(),
  });
});

export default router;
