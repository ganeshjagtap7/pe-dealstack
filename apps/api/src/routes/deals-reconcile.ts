// ─── Per-deal quantitative reconciliation endpoint ───────────────
// GET /api/deals/:id/reconcile
//
// Phase 1 of the extraction-quality audit tool: aggregates the deal's
// stored FinancialStatement rows into computed ground truth (annual
// sums, TTM, MRR, margins), channel concentration + HHI, asking-price
// vs micro-SaaS comp bands, and OpEx step-up findings. No LLM calls —
// pure TS over data already in the DB.
//
// Returns JSON. Sets Content-Disposition: attachment so the browser
// downloads `reconcile-{dealId}-{ISO-date}.json` for diff/grep.
//
// Auth: same gate as every other deal-child route — getOrgId +
// verifyDealAccess. Mounted in deals.ts before /:id catch-all in
// deals-list so the literal "reconcile" segment matches first.

import { Router } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import {
  rowsToReconcilerInput,
  runQuantitativeReconciliationPhase1,
  type FinancialStatementRow,
} from '../services/quantitativeReconciler.js';

const router = Router();

router.get('/:id/reconcile', async (req, res) => {
  try {
    const dealId = req.params.id;
    const orgId = getOrgId(req);

    const dealAccess = await verifyDealAccess(dealId, orgId);
    if (!dealAccess) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Pull the asking price + currency off the Deal row. dealSize is
    // stored in millions per the established schema convention — we
    // convert to actual dollars before feeding the reconciler.
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .select('id, name, currency, dealSize')
      .eq('id', dealId)
      .eq('organizationId', orgId)
      .single();

    if (dealErr || !deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Active rows only — the reconciler should not double-count
    // superseded extractions. The extraction-debug route includes
    // inactive rows for audit; this one doesn't.
    const { data: stmts, error: stmtsErr } = await supabase
      .from('FinancialStatement')
      .select(
        'id, documentId, statementType, period, periodType, lineItems, unitScale, currency, extractionConfidence, isActive',
      )
      .eq('dealId', dealId)
      .eq('isActive', true);

    if (stmtsErr) throw stmtsErr;

    const rows = (stmts ?? []) as FinancialStatementRow[];
    const reconcilerInput = rowsToReconcilerInput(rows);
    const askingPriceUsd =
      typeof deal.dealSize === 'number' && deal.dealSize > 0
        ? deal.dealSize * 1_000_000
        : null;

    const result = runQuantitativeReconciliationPhase1({
      statements: reconcilerInput,
      ctx: {
        askingPriceUsd,
        currency: (deal.currency as string) ?? 'USD',
      },
    });

    const payload = {
      generatedAt: new Date().toISOString(),
      phase: 1,
      deal: {
        id: deal.id,
        name: deal.name,
        currency: deal.currency ?? 'USD',
        askingPriceUsd,
        askingPriceSource: 'Deal.dealSize × 1,000,000',
      },
      inputSummary: {
        totalActiveStatements: rows.length,
        statementsByType: rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.statementType] = (acc[r.statementType] ?? 0) + 1;
          return acc;
        }, {}),
      },
      ...result,
    };

    const datePart = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reconcile-${dealId}-${datePart}.json"`,
    );
    res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (err) {
    log.error('GET /api/deals/:id/reconcile error', err);
    res.status(500).json({ error: 'Failed to build reconciliation payload' });
  }
});

export default router;
