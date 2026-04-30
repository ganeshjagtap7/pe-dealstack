import { Router, type Request, type Response, type NextFunction } from 'express';
import { log } from '../utils/logger.js';
import { routeWebhook } from '../integrations/_platform/webhookRouter.js';
import { getProvider, isProviderRegistered } from '../integrations/_platform/registry.js';
import { syncAll } from '../integrations/_platform/syncEngine.js';
import type { ProviderId } from '../integrations/_platform/types.js';

const router = Router();

router.post('/webhooks/:provider', async (req: Request, res: Response) => {
  const provider = req.params.provider as ProviderId;
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])
  ) as Record<string, string>;
  const result = await routeWebhook(provider, headers, req.body);
  if (!result.ok) {
    if (result.code === 'INVALID_SIGNATURE') return res.status(401).end();
    if (result.code === 'PROVIDER_UNKNOWN') return res.status(404).end();
    log.error('Webhook handler error', new Error(result.message), { provider });
    return res.status(500).end();
  }
  res.status(204).end();
});

router.get('/oauth/:provider/callback', async (req: Request, res: Response, _next: NextFunction) => {
  const provider = req.params.provider as ProviderId;
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code || !state) return res.status(400).send('Missing code or state');
  if (!isProviderRegistered(provider)) return res.status(404).send('Provider not registered');
  try {
    await getProvider(provider).handleCallback({ code, state });
    res.redirect(`/settings.html?integrations=connected&provider=${provider}`);
  } catch (err) {
    log.error('OAuth callback failed', err);
    res.redirect(`/settings.html?integrations=error&provider=${provider}`);
  }
});

router.post('/_cron/sync-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expected = process.env.CRON_SECRET;
    const actual = req.header('x-cron-secret');
    if (!expected || actual !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await syncAll();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

export default router;
