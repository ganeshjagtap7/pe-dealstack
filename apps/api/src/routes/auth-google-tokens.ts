// ─── /api/auth/google-tokens ────────────────────────────────
// POST endpoint the frontend hits right after a Supabase
// Google-OAuth sign-in completes. The Supabase session carries
// `provider_token` + `provider_refresh_token`; we persist them
// here so `googleAuthService.getUserGoogleAccessToken(userId)`
// can mint fresh access tokens for the NDA send flow.
//
// Mounted with `authMiddleware` only — no orgMiddleware. This
// fires before org context is fully resolved on the frontend
// (the user has just logged in and is bouncing through
// callback → upsert tokens → home).
// ─────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { log } from '../utils/logger.js';
import { upsertUserGoogleTokens } from '../services/googleAuthService.js';

const router = Router();

const bodySchema = z.object({
  providerToken: z.string().min(10),
  providerRefreshToken: z.string().min(10).optional().nullable(),
  expiresIn: z.number().int().min(60).max(86_400),
  scopes: z.string().min(1),
  googleEmail: z.string().email().max(500),
});

router.post('/google-tokens', async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid body',
        details: parsed.error.errors,
      });
    }

    const refresh = parsed.data.providerRefreshToken?.trim();
    if (!refresh) {
      return res.status(400).json({
        error: 'Google sign-in did not return a refresh token. Sign out and sign in again with consent.',
        code: 'NO_REFRESH_TOKEN',
      });
    }

    await upsertUserGoogleTokens({
      userId: user.id,
      googleEmail: parsed.data.googleEmail,
      accessToken: parsed.data.providerToken,
      refreshToken: refresh,
      expiresIn: parsed.data.expiresIn,
      scopes: parsed.data.scopes,
    });

    return res.json({ ok: true });
  } catch (err) {
    log.error('POST /api/auth/google-tokens error', err);
    return res.status(500).json({ error: 'Failed to persist Google tokens' });
  }
});

export default router;
