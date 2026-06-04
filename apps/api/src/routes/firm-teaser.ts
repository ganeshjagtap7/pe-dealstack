// ─── /api/firm-teaser router ─────────────────────────────────────────
// CRUD for the firm's named investment-criteria profiles, plus a non-persisted
// preview endpoint that powers the settings "GEN" button.
//
// All routes are org-scoped via getOrgId(req).

import { Router } from 'express';
import { z } from 'zod';
import { getOrgId } from '../middleware/orgScope.js';
import { log } from '../utils/logger.js';
import {
  getFirmTeaserConfig,
  saveFirmTeaserConfig,
  generateProfilePrompt,
  type TeaserProfile,
} from '../services/firmTeaserService.js';

const router = Router();

// ─── Validation schemas ─────────────────────────────────────────────

const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  criteria: z.array(criterionSchema),
  updatedAt: z.string(),
});

const saveBodySchema = z.object({
  profiles: z.array(profileSchema),
});

const generatePromptBodySchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  criteria: z.array(criterionSchema),
});

// ─── GET /api/firm-teaser → { profiles } ────────────────────────────
router.get('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const config = await getFirmTeaserConfig(orgId);
    res.json({ profiles: config.profiles });
  } catch (error) {
    log.error('firm-teaser: GET failed', error);
    res.status(500).json({ error: 'Failed to load firm teaser profiles' });
  }
});

// ─── PUT /api/firm-teaser → { profiles } (with stale/cleanup side effects) ──
router.put('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const parsed = saveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const profiles = await saveFirmTeaserConfig(orgId, parsed.data.profiles as TeaserProfile[]);
    res.json({ profiles });
  } catch (error) {
    log.error('firm-teaser: PUT failed', error);
    res.status(500).json({ error: 'Failed to save firm teaser profiles' });
  }
});

// ─── POST /api/firm-teaser/generate-prompt → { systemPrompt } (NOT persisted) ──
// Expands the user's rough recommendations + criteria into an elaborate system
// prompt for the settings "GEN" button. Auth/org-scope is enforced by the
// middleware chain; this route reads/writes no org-scoped data.
router.post('/generate-prompt', async (req, res) => {
  try {
    const parsed = generatePromptBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const systemPrompt = await generateProfilePrompt(parsed.data);
    res.json({ systemPrompt });
  } catch (error) {
    log.error('firm-teaser: generate-prompt failed', error);
    const message = error instanceof Error ? error.message : 'Failed to generate system prompt';
    res.status(500).json({ error: 'Failed to generate system prompt', message });
  }
});

export default router;
