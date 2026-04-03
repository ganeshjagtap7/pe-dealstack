import { Router, Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { getOrgId } from '../middleware/orgScope.js';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import {
  parseCSV,
  parseExcel,
  parsePastedText,
  analyzeImportData,
  validateDealRow,
} from '../services/dealImportMapper.js';
import type { ColumnMapping } from '../services/dealImportMapper.js';

const router = Router();

// Multer for Excel file uploads (in-memory, 5MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv') || file.originalname.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are supported'));
    }
  },
});

// ============================================
// POST /api/deals/import/analyze
// ============================================

const analyzeTextSchema = z.object({
  source: z.enum(['csv', 'paste']),
  rawData: z.string().min(1, 'No data provided'),
});

router.post('/analyze', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let rows: Record<string, string>[];
    let source: 'csv' | 'excel' | 'paste';
    let parseWarnings: string[] = [];

    if (req.file) {
      // Excel file upload
      source = 'excel';
      const parsed = parseExcel(req.file.buffer);
      rows = parsed.rows;
      parseWarnings = parsed.warnings;
    } else {
      // CSV or pasted text (JSON body)
      const validation = analyzeTextSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }
      source = validation.data.source;
      rows = source === 'csv'
        ? parseCSV(validation.data.rawData)
        : parsePastedText(validation.data.rawData);
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found. Please check your file.' });
    }

    if (rows.length > 500) {
      return res.status(400).json({
        error: `Too many rows (${rows.length}). Maximum 500 deals per import. Please split your file.`,
      });
    }

    const result = await analyzeImportData(rows, source);

    // Merge parse-level warnings (e.g., multi-sheet Excel) with AI warnings
    result.warnings = [...parseWarnings, ...result.warnings];

    res.json({
      success: true,
      ...result,
      // Also send all parsed rows so frontend can re-apply mapping client-side if user changes it
      allRows: rows,
    });
  } catch (error: any) {
    log.error('Deal import analyze error', error);
    res.status(500).json({ error: error.message || 'Failed to analyze import data' });
  }
});

// ============================================
// POST /api/deals/import
// ============================================

const importDealSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  stage: z.string().optional().default('INITIAL_REVIEW'),
  status: z.string().optional().default('ACTIVE'),
  dealSize: z.number().nullable().optional(),
  ebitda: z.number().nullable().optional(),
  revenue: z.number().nullable().optional(),
  irrProjected: z.number().nullable().optional(),
  mom: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  priority: z.string().optional().default('MEDIUM'),
  tags: z.array(z.string()).optional(),
  targetCloseDate: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.any()).optional().default({}),
});

const importRequestSchema = z.object({
  deals: z.array(z.record(z.string(), z.any())).min(1).max(500),
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = importRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
    }

    const orgId = getOrgId(req);
    const { deals } = validation.data;
    const results = {
      imported: 0,
      failed: 0,
      companiesCreated: 0,
      errors: [] as Array<{ row: number; reason: string }>,
    };

    // Cache company lookups to avoid repeated queries
    const companyCache = new Map<string, string>(); // companyName -> companyId

    for (let i = 0; i < deals.length; i++) {
      try {
        // Validate the row
        const rowValidation = validateDealRow(deals[i], i);
        if (!rowValidation.valid) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: rowValidation.errors.join('; ') });
          continue;
        }

        // Parse through Zod (lenient — fills defaults)
        const parsed = importDealSchema.safeParse(deals[i]);
        if (!parsed.success) {
          results.failed++;
          results.errors.push({
            row: i + 1,
            reason: parsed.error.errors.map(e => e.message).join('; '),
          });
          continue;
        }

        const deal = parsed.data;

        // Resolve or create company
        let companyId = companyCache.get(deal.companyName.toLowerCase());
        if (!companyId) {
          // Check if company exists in this org
          const { data: existing } = await supabase
            .from('Company')
            .select('id')
            .eq('organizationId', orgId)
            .ilike('name', deal.companyName)
            .limit(1)
            .single();

          if (existing) {
            companyId = existing.id;
          } else {
            // Create new company
            const { data: newCompany, error: companyError } = await supabase
              .from('Company')
              .insert({
                name: deal.companyName,
                industry: deal.industry || null,
                organizationId: orgId,
              })
              .select('id')
              .single();

            if (companyError) {
              results.failed++;
              results.errors.push({ row: i + 1, reason: `Failed to create company: ${companyError.message}` });
              continue;
            }
            companyId = newCompany.id;
            results.companiesCreated++;
          }
          companyCache.set(deal.companyName.toLowerCase(), companyId!);
        }

        // Check for duplicate deal name in org
        const { data: existingDeal } = await supabase
          .from('Deal')
          .select('id')
          .eq('organizationId', orgId)
          .eq('name', deal.name)
          .limit(1)
          .single();

        if (existingDeal) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: `Duplicate deal name: "${deal.name}" already exists` });
          continue;
        }

        // Insert deal
        const { error: dealError } = await supabase
          .from('Deal')
          .insert({
            name: deal.name,
            companyId,
            stage: deal.stage,
            status: deal.status,
            dealSize: deal.dealSize,
            ebitda: deal.ebitda,
            revenue: deal.revenue,
            irrProjected: deal.irrProjected,
            mom: deal.mom,
            industry: deal.industry,
            description: deal.description,
            priority: deal.priority,
            tags: deal.tags || [],
            targetCloseDate: deal.targetCloseDate,
            source: deal.source,
            customFields: deal.customFields || {},
            icon: 'business_center',
            organizationId: orgId,
          });

        if (dealError) {
          results.failed++;
          results.errors.push({ row: i + 1, reason: dealError.message });
        } else {
          results.imported++;
        }
      } catch (rowErr: any) {
        results.failed++;
        results.errors.push({ row: i + 1, reason: rowErr.message || 'Unknown error' });
      }
    }

    log.info('Deal import complete', {
      total: deals.length,
      imported: results.imported,
      failed: results.failed,
      companiesCreated: results.companiesCreated,
    });

    res.status(201).json({ success: true, ...results });
  } catch (error: any) {
    log.error('Deal import error', error);
    res.status(500).json({ error: error.message || 'Failed to import deals' });
  }
});

export default router;
