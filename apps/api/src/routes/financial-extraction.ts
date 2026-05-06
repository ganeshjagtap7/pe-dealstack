import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { getOrgId } from '../middleware/orgScope.js';
import { runExtractionPipeline } from '../services/extraction/pipeline.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';

const router = Router();

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'extraction');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cb(null, `${unique}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.ms-excel.sheet.macroenabled.12',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/tiff',
      'application/octet-stream',
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.xlsx', '.xls', '.xlsm', '.png', '.jpg', '.jpeg', '.webp', '.tiff'];
    if (allowed.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      const err = Object.assign(new Error(`Unsupported file type: ${file.mimetype}`), { isUnsupportedFormat: true });
      cb(err as any, false);
    }
  },
});

function cleanup(filePath?: string): void {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'financial-extraction', timestamp: new Date().toISOString() });
});

router.post('/extract', upload.single('file'), async (req, res) => {
  const filePath = req.file?.path;

  try {
    const _orgId = getOrgId(req);

    if (!req.file || !filePath) {
      return res.status(400).json({ success: false, error: 'No file provided', errorCode: 'NO_FILE' });
    }

    const result = await runExtractionPipeline(filePath, req.file.mimetype, req.file.originalname);
    cleanup(filePath);

    if (result.status === 'failed') {
      return res.status(422).json({ success: false, error: result.metadata.error || 'Extraction failed', errorCode: 'EXTRACTION_FAILED', metadata: result.metadata });
    }

    if (req.user?.id && (req.user as any)?.organizationId) {
      AuditLog.log(req, {
        action: 'AI_INGEST',
        resourceType: 'DOCUMENT',
        resourceName: req.file.originalname,
        metadata: { status: result.status },
      }).catch(() => {});
    }

    return res.status(200).json(result);
  } catch (err: any) {
    cleanup(filePath);
    log.error('financial-extraction route error', err);

    if (err?.isUnsupportedFormat) {
      return res.status(400).json({ success: false, error: err.message, errorCode: 'UNSUPPORTED_FORMAT' });
    }
    if (err?.message?.includes('Password-protected')) {
      return res.status(400).json({ success: false, error: err.message, errorCode: 'PASSWORD_PROTECTED_PDF' });
    }
    return res.status(500).json({ success: false, error: 'Internal extraction error', errorCode: 'INTERNAL_ERROR' });
  }
});

export default router;
