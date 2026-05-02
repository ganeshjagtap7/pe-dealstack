import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { getOrgId } from '../middleware/orgScope.js';
import { log } from '../utils/logger.js';

const router = Router();

const firmProfileSchema = z.object({
  websiteUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  aum: z.string().optional(),
  sectors: z.array(z.string()).max(20).optional(),
});

// POST /api/onboarding/firm-profile
// Persists firm-task fields (URL/LinkedIn/AUM/sectors) onto Organization.settings.firmProfile.
router.post('/firm-profile', async (req: Request, res: Response) => {
  const parsed = firmProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  }

  const { websiteUrl, linkedinUrl, aum, sectors } = parsed.data;
  if (
    websiteUrl === undefined &&
    linkedinUrl === undefined &&
    aum === undefined &&
    sectors === undefined
  ) {
    return res.status(400).json({ error: 'No fields provided' });
  }

  let orgId: string;
  try {
    orgId = getOrgId(req);
  } catch {
    return res.status(400).json({ error: 'Organization not set up yet' });
  }

  try {
    const { data: org, error: fetchError } = await supabase
      .from('Organization')
      .select('settings')
      .eq('id', orgId)
      .single();

    if (fetchError) throw fetchError;

    const existingSettings = (org?.settings || {}) as Record<string, any>;
    const existingProfile = (existingSettings.firmProfile || {}) as Record<string, any>;

    const mergedProfile: Record<string, any> = { ...existingProfile };
    if (websiteUrl !== undefined) mergedProfile.websiteUrl = websiteUrl;
    if (linkedinUrl !== undefined) mergedProfile.linkedinUrl = linkedinUrl;
    if (aum !== undefined) mergedProfile.aum = aum;
    if (sectors !== undefined) mergedProfile.sectors = sectors;

    const updatedSettings = { ...existingSettings, firmProfile: mergedProfile };

    const { error: updateError } = await supabase
      .from('Organization')
      .update({ settings: updatedSettings })
      .eq('id', orgId);

    if (updateError) throw updateError;

    res.json({ success: true, firmProfile: mergedProfile });
  } catch (error: any) {
    log.error('Onboarding firm-profile save failed', { error: error.message, orgId });
    res.status(500).json({ error: 'Failed to save firm profile' });
  }
});

export default router;
