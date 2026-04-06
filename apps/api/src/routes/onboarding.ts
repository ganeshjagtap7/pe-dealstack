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

// Check if user is genuinely new (no existing deals/activity)
async function isNewUser(userId: string, orgId: string): Promise<boolean> {
  const { count } = await supabase
    .from('Deal')
    .select('id', { count: 'exact', head: true })
    .eq('organizationId', orgId);
  return (count ?? 0) === 0;
}

// Auto-mark existing users as onboarded (they don't need the flow)
const COMPLETED_STATUS = {
  welcomeShown: true,
  checklistDismissed: true,
  completedAt: new Date().toISOString(),
  steps: {
    createDeal: true,
    uploadDocument: true,
    reviewExtraction: true,
    tryDealChat: true,
    inviteTeamMember: true,
  },
};

/**
 * Fire-and-forget helper to mark an onboarding step complete.
 * Used by other routes (documents, invitations) to auto-detect steps.
 * Never throws — onboarding must never block core functionality.
 */
export async function tryCompleteOnboardingStep(userId: string, step: string): Promise<void> {
  try {
    if (!VALID_STEPS.includes(step)) return;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('authId', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    if (!status.steps) status.steps = { ...DEFAULT_STATUS.steps };
    if (status.steps[step]) return; // Already complete

    status.steps[step] = true;

    const allComplete = VALID_STEPS.every(s => status.steps[s]);
    if (allComplete && !status.completedAt) {
      status.completedAt = new Date().toISOString();
    }

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('authId', userId);
  } catch (e) {
    // Silent — never block core routes
  }
}

/**
 * Backfill onboarding steps from actual user data.
 * Catches cases where the backend auto-complete hooks were missed
 * (e.g. user existed before hooks were added, or used a path that bypassed them).
 */
async function backfillStepsFromActivity(orgId: string, status: any): Promise<{ status: any; changed: boolean }> {
  if (!status.steps) status.steps = { ...DEFAULT_STATUS.steps };
  let changed = false;

  const checks: Array<{ step: string; query: () => Promise<boolean> }> = [
    {
      step: 'createDeal',
      query: async () => {
        const { count } = await supabase
          .from('Deal')
          .select('id', { count: 'exact', head: true })
          .eq('organizationId', orgId);
        return (count ?? 0) > 0;
      },
    },
    {
      step: 'uploadDocument',
      query: async () => {
        // Document table has no organizationId — scope via Deal
        const { data: deals } = await supabase
          .from('Deal')
          .select('id')
          .eq('organizationId', orgId);
        const dealIds = (deals || []).map(d => d.id);
        if (dealIds.length === 0) return false;
        const { count } = await supabase
          .from('Document')
          .select('id', { count: 'exact', head: true })
          .in('dealId', dealIds);
        return (count ?? 0) > 0;
      },
    },
    {
      step: 'reviewExtraction',
      query: async () => {
        const { data: deals } = await supabase
          .from('Deal')
          .select('id')
          .eq('organizationId', orgId);
        const dealIds = (deals || []).map(d => d.id);
        if (dealIds.length === 0) return false;
        const { count } = await supabase
          .from('FinancialStatement')
          .select('id', { count: 'exact', head: true })
          .in('dealId', dealIds);
        return (count ?? 0) > 0;
      },
    },
    {
      step: 'tryDealChat',
      query: async () => {
        const { data: deals } = await supabase
          .from('Deal')
          .select('id')
          .eq('organizationId', orgId);
        const dealIds = (deals || []).map(d => d.id);
        if (dealIds.length === 0) return false;
        const { count } = await supabase
          .from('ChatMessage')
          .select('id', { count: 'exact', head: true })
          .in('dealId', dealIds);
        return (count ?? 0) > 0;
      },
    },
    {
      step: 'inviteTeamMember',
      query: async () => {
        const { count } = await supabase
          .from('Invitation')
          .select('id', { count: 'exact', head: true })
          .eq('organizationId', orgId);
        return (count ?? 0) > 0;
      },
    },
  ];

  for (const { step, query } of checks) {
    if (status.steps[step]) continue;
    try {
      if (await query()) {
        status.steps[step] = true;
        changed = true;
      }
    } catch {
      // Best-effort — never block status fetch
    }
  }

  if (changed) {
    const allComplete = VALID_STEPS.every(s => status.steps[s]);
    if (allComplete && !status.completedAt) {
      status.completedAt = new Date().toISOString();
    }
  }

  return { status, changed };
}

// GET /api/onboarding/status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.json(DEFAULT_STATUS);
    const orgId = getOrgId(req);
    const { data, error } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('authId', userId)
      .single();

    if (error) throw error;

    let status = data?.onboardingStatus || { ...DEFAULT_STATUS };

    // If welcome hasn't been shown yet, check if this is really a new user
    // Existing users with deals/activity should skip onboarding entirely
    if (!status.welcomeShown) {
      const newUser = await isNewUser(userId, orgId);
      if (!newUser) {
        // Auto-complete onboarding for existing users
        await supabase
          .from('User')
          .update({ onboardingStatus: COMPLETED_STATUS })
          .eq('authId', userId);
        return res.json(COMPLETED_STATUS);
      }
    }

    // Backfill any steps the user has actually completed via activity
    // (handles missed hook fires + manual check-off persistence)
    if (!status.checklistDismissed) {
      const { status: updated, changed } = await backfillStepsFromActivity(orgId, status);
      if (changed) {
        status = updated;
        await supabase
          .from('User')
          .update({ onboardingStatus: status })
          .eq('authId', userId);
      }
    }

    res.json(status);
  } catch (error: any) {
    console.error('[Onboarding] Failed to get status:', error.message);
    res.json(DEFAULT_STATUS);
  }
});

// POST /api/onboarding/complete-step
router.post('/complete-step', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { step } = req.body;

    if (!step || !VALID_STEPS.includes(step)) {
      return res.status(400).json({ error: `Invalid step. Must be one of: ${VALID_STEPS.join(', ')}` });
    }

    // Get current status
    const { data: user, error: fetchError } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('authId', userId)
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
      .eq('authId', userId);

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
    const userId = req.user?.id;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('authId', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    status.welcomeShown = true;

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('authId', userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Onboarding] Failed to mark welcome shown:', error.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// POST /api/onboarding/dismiss
router.post('/dismiss', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('authId', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    status.checklistDismissed = true;

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('authId', userId);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Onboarding] Failed to dismiss:', error.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

export default router;
