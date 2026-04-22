import { Router } from 'express';
import { z } from 'zod';
import { getAuditLogs, getAuditSummary, AUDIT_ACTIONS, RESOURCE_TYPES, SEVERITY } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { getOrgId, verifyDealAccess } from '../middleware/orgScope.js';
import { supabase } from '../supabase.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Attach userName to each audit log by looking up the org's User table.
 * Scoped to organizationId so a log's userId from another org cannot resolve here.
 */
async function enrichLogsWithUserNames(logs: any[], orgId: string): Promise<any[]> {
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))];
  if (userIds.length === 0) return logs;

  const { data: users } = await supabase
    .from('User')
    .select('id, name')
    .eq('organizationId', orgId)
    .in('id', userIds);

  if (!users) return logs;
  const nameMap = new Map(users.map((u: any) => [u.id, u.name]));
  return logs.map((l) => ({ ...l, userName: nameMap.get(l.userId) || null }));
}

// ─── Query Schema ────────────────────────────────────────────

const auditQuerySchema = z.object({
  resourceId: z.string().uuid().optional(),
  resourceType: z.string().optional(),
  action: z.string().optional(),
  severity: z.string().optional(),
  userId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ─── GET /api/audit — List audit logs with filtering ─────────

router.get('/', async (req, res) => {
  try {
    const validation = auditQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: validation.error.errors });
    }

    const { resourceId, resourceType, action, severity, userId, startDate, endDate, limit, offset } = validation.data;
    const orgId = getOrgId(req);

    const { data, error, count } = await getAuditLogs({
      resourceId,
      resourceType: resourceType as any,
      action: action as any,
      severity: severity as any,
      userId,
      organizationId: orgId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit,
      offset,
    });

    if (error) {
      log.error('Audit log query error', error);
      return res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }

    const enrichedLogs = await enrichLogsWithUserNames(data || [], orgId);

    res.json({
      success: true,
      count,
      limit,
      offset,
      logs: enrichedLogs,
    });
  } catch (error) {
    log.error('Audit route error', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// ─── GET /api/audit/entity/:entityId — Get audit trail for a specific entity ───

router.get('/entity/:entityId', async (req, res) => {
  try {
    const { entityId } = req.params;
    const orgId = getOrgId(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const { data, error, count } = await getAuditLogs({
      resourceId: entityId,
      organizationId: orgId,
      limit,
      offset,
    });

    if (error) {
      log.error('Audit entity query error', error);
      return res.status(500).json({ error: 'Failed to retrieve audit trail' });
    }

    const enrichedLogs = await enrichLogsWithUserNames(data || [], orgId);

    res.json({
      success: true,
      entityId,
      count,
      logs: enrichedLogs,
    });
  } catch (error) {
    log.error('Audit entity route error', error);
    res.status(500).json({ error: 'Failed to retrieve audit trail' });
  }
});

// ─── GET /api/audit/summary — Get audit summary statistics ───

router.get('/summary', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const orgId = getOrgId(req);
    const summary = await getAuditSummary(days, orgId);

    res.json({
      success: true,
      period: `${days} days`,
      ...summary,
    });
  } catch (error) {
    log.error('Audit summary error', error);
    res.status(500).json({ error: 'Failed to retrieve audit summary' });
  }
});

export default router;
