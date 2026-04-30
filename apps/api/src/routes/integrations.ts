import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { getOrgId } from '../middleware/orgScope.js';
import { log } from '../utils/logger.js';
import { syncIntegration } from '../integrations/_platform/syncEngine.js';
import { getProvider, isProviderRegistered } from '../integrations/_platform/registry.js';
import type { ProviderId, Integration } from '../integrations/_platform/types.js';

const router = Router();

const PROVIDER_IDS: ProviderId[] = [
  'granola', 'gmail', 'google_calendar', 'fireflies', 'otter',
];

const PUBLIC_FIELDS = `id, organizationId, userId, provider, status,
  externalAccountId, externalAccountEmail, scopes, settings,
  lastSyncAt, lastSyncError, consecutiveFailures, tokenExpiresAt,
  createdAt, updatedAt` as const;

async function resolveInternalUserId(authId: string): Promise<string | null> {
  const { data } = await supabase
    .from('User').select('id').eq('authId', authId).single();
  return data?.id ?? null;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { data, error } = await supabase
      .from('Integration')
      .select(PUBLIC_FIELDS)
      .eq('organizationId', orgId)
      .order('createdAt', { ascending: false });
    if (error) throw error;
    res.json({ integrations: data ?? [] });
  } catch (err) { next(err); }
});

const connectSchema = z.object({ provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]) });

router.post('/:provider/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = connectSchema.parse({ provider: req.params.provider });
    if (!isProviderRegistered(provider)) {
      return res.status(404).json({ error: `Provider ${provider} not available yet` });
    }
    const orgId = getOrgId(req);
    const userId = await resolveInternalUserId(req.user!.id);
    if (!userId) return res.status(404).json({ error: 'User not found' });
    const { authUrl, state } = await getProvider(provider).initiateAuth(userId, orgId);
    res.json({ authUrl, state });
  } catch (err) { next(err); }
});

router.get('/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = req.params.provider as ProviderId;
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (!code || !state) return res.status(400).send('Missing code or state');
    if (!isProviderRegistered(provider)) return res.status(404).send('Provider not registered');
    await getProvider(provider).handleCallback({ code, state });
    res.redirect(`/settings.html?integrations=connected&provider=${provider}`);
  } catch (err) {
    log.error('OAuth callback failed', err);
    res.redirect(`/settings.html?integrations=error&provider=${req.params.provider}`);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: row } = await supabase
      .from('Integration')
      .select(PUBLIC_FIELDS)
      .eq('id', id).eq('organizationId', orgId).single();
    if (!row) return res.status(404).json({ error: 'Integration not found' });
    if (isProviderRegistered(row.provider as ProviderId)) {
      try {
        await getProvider(row.provider as ProviderId).disconnect(row as unknown as Integration);
      } catch (e) {
        log.warn('Provider disconnect failed (continuing with local revoke)', { e });
      }
    }
    await supabase.from('Integration').update({ status: 'revoked' }).eq('id', id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: row, error } = await supabase
      .from('Integration')
      .select('*')
      .eq('id', id).eq('organizationId', orgId).single();
    if (error || !row) return res.status(404).json({ error: 'Integration not found' });
    const result = await syncIntegration(row as unknown as Integration);
    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

router.get('/:id/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const id = req.params.id;
    const { data: integration } = await supabase
      .from('Integration')
      .select('id, organizationId')
      .eq('id', id).eq('organizationId', orgId).single();
    if (!integration) return res.status(404).json({ error: 'Integration not found' });
    const { data: events } = await supabase
      .from('IntegrationEvent')
      .select('id, externalId, type, receivedAt, processedAt, error')
      .eq('integrationId', id)
      .order('receivedAt', { ascending: false })
      .limit(50);
    res.json({ events: events ?? [] });
  } catch (err) { next(err); }
});

export default router;
