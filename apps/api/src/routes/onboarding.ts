import { Router, Request, Response } from 'express';
import { supabase } from '../supabase.js';
import { getOrgId } from '../middleware/orgScope.js';

const router = Router();

const VALID_STEPS = ['createDeal', 'uploadDocument', 'reviewExtraction', 'tryDealChat', 'inviteTeamMember'];

const DEFAULT_STATUS = {
  welcomeShown: false,
  checklistDismissed: false,
  steps: {
    createDeal: false,
    uploadDocument: false,
    reviewExtraction: false,
    tryDealChat: false,
    inviteTeamMember: false,
  },
};

// GET /api/onboarding/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { data, error } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('id', userId)
      .single();

    if (error) throw error;

    res.json(data?.onboardingStatus || DEFAULT_STATUS);
  } catch (error: any) {
    console.error('[Onboarding] Failed to get status:', error.message);
    res.json(DEFAULT_STATUS);
  }
});

// POST /api/onboarding/complete-step
router.post('/complete-step', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { step } = req.body;

    if (!step || !VALID_STEPS.includes(step)) {
      return res.status(400).json({ error: `Invalid step. Must be one of: ${VALID_STEPS.join(', ')}` });
    }

    // Get current status
    const { data: user, error: fetchError } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    if (!status.steps) status.steps = { ...DEFAULT_STATUS.steps };
    status.steps[step] = true;

    // Check if all steps are complete
    const allComplete = VALID_STEPS.every(s => status.steps[s]);
    if (allComplete && !status.completedAt) {
      status.completedAt = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({ success: true, status });
  } catch (error: any) {
    console.error('[Onboarding] Failed to complete step:', error.message);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
});

// POST /api/onboarding/welcome-shown
router.post('/welcome-shown', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('id', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    status.welcomeShown = true;

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('id', userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Onboarding] Failed to mark welcome shown:', error.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// POST /api/onboarding/dismiss
router.post('/dismiss', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('id', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    status.checklistDismissed = true;

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('id', userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Onboarding] Failed to dismiss:', error.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

export default router;
