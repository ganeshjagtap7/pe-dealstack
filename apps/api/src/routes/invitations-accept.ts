import { Router, Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { createNotification } from './notifications.js';
import { getOrgId } from '../middleware/orgScope.js';
import { sendInvitationEmail, getExpirationDate } from './invitations.js';

const router = Router();

// GET /api/invitations/verify/:token - Verify invitation token (public endpoint)
router.get('/verify/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;

    const { data: invitation, error } = await supabase
      .from('Invitation')
      .select(`
        id,
        email,
        firmName,
        organizationId,
        role,
        status,
        expiresAt,
        inviter:User!invitedBy(name, avatar),
        organization:Organization!organizationId(id, name, logo)
      `)
      .eq('token', token)
      .single();

    if (error || !invitation) {
      return res.status(404).json({ error: 'Invalid invitation' });
    }

    // Check if expired
    if (new Date(invitation.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // Check status
    if (invitation.status !== 'PENDING') {
      return res.status(410).json({ error: `Invitation has been ${invitation.status.toLowerCase()}` });
    }

    const org = invitation.organization as any;
    res.json({
      valid: true,
      email: invitation.email,
      firmName: org?.name || invitation.firmName,
      organizationLogo: org?.logo || null,
      role: invitation.role,
      inviter: invitation.inviter,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/invitations/accept/:token - Accept invitation (creates user account)
router.post('/accept/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const { password, fullName } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Get invitation with organization data
    const { data: invitation, error: invError } = await supabase
      .from('Invitation')
      .select('*, organization:Organization!organizationId(id, name)')
      .eq('token', token)
      .single();

    if (invError || !invitation) {
      return res.status(404).json({ error: 'Invalid invitation' });
    }

    // Check if expired
    if (new Date(invitation.expiresAt) < new Date()) {
      await supabase
        .from('Invitation')
        .update({ status: 'EXPIRED' })
        .eq('id', invitation.id);
      return res.status(410).json({ error: 'Invitation has expired' });
    }

    // Check status
    if (invitation.status !== 'PENDING') {
      return res.status(410).json({ error: `Invitation has already been ${invitation.status.toLowerCase()}` });
    }

    const org = invitation.organization as any;
    const orgName = org?.name || invitation.firmName;

    // Create auth user via Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        data: {
          full_name: fullName || invitation.email.split('@')[0],
          firm_name: orgName,
          role: invitation.role,
          invited: true,
        },
      },
    });

    if (authError) {
      log.error('Auth signup error', authError);
      return res.status(400).json({ error: authError.message });
    }

    // Create User record with organizationId from the invitation
    const { data: newUser, error: userError } = await supabase
      .from('User')
      .insert({
        authId: authData.user?.id,
        email: invitation.email,
        name: fullName || invitation.email.split('@')[0],
        firmName: orgName,
        organizationId: invitation.organizationId,
        role: invitation.role,
        isActive: true,
      })
      .select()
      .single();

    if (userError) {
      log.error('User creation error', userError);
      // Don't fail completely - auth user was created
    }

    // Update invitation status
    await supabase
      .from('Invitation')
      .update({
        status: 'ACCEPTED',
        acceptedAt: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    // Audit log
    await AuditLog.log(req, {
      action: 'INVITATION_ACCEPTED',
      resourceType: 'Invitation',
      resourceId: invitation.id,
      userId: newUser?.id,
      metadata: { email: invitation.email, organizationId: invitation.organizationId },
    });

    // Notify org admins: new member joined (fire-and-forget)
    const memberName = fullName || invitation.email.split('@')[0];
    (async () => {
      try {
        const { data: admins } = await supabase
          .from('User')
          .select('id')
          .eq('organizationId', invitation.organizationId)
          .eq('role', 'ADMIN');
        if (admins) {
          for (const admin of admins) {
            await createNotification({
              userId: admin.id,
              type: 'SYSTEM',
              title: `${memberName} joined your workspace`,
              message: `Accepted invitation as ${invitation.role}`,
            });
          }
        }
      } catch (err) {
        log.error('Notification error (invite accept)', err);
      }
    })();

    res.json({
      success: true,
      message: 'Account created successfully',
      user: newUser,
      session: authData.session,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/invitations/:id - Revoke invitation
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    // Get the invitation — verify it belongs to user's org
    const { data: invitation, error: getError } = await supabase
      .from('Invitation')
      .select('*')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (getError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Update status to revoked
    const { error: updateError } = await supabase
      .from('Invitation')
      .update({ status: 'REVOKED' })
      .eq('id', id)
      .eq('organizationId', orgId);

    if (updateError) throw updateError;

    // Audit log
    await AuditLog.log(req, {
      action: 'INVITATION_REVOKED',
      resourceType: 'Invitation',
      resourceId: id,
      metadata: { email: invitation.email },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/invitations/:id/resend - Resend invitation email
router.post('/:id/resend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const orgId = getOrgId(req);

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get invitation — verify it belongs to user's org
    const { data: invitation, error: getError } = await supabase
      .from('Invitation')
      .select('*')
      .eq('id', id)
      .eq('organizationId', orgId)
      .single();

    if (getError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only resend pending invitations' });
    }

    const { data: currentUser } = await supabase
      .from('User')
      .select('name')
      .eq('authId', user.id)
      .maybeSingle();

    // Get org name for email
    const { data: org } = await supabase
      .from('Organization')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgName = org?.name || invitation.firmName;

    // Extend expiration
    const newExpiry = getExpirationDate();
    await supabase
      .from('Invitation')
      .update({ expiresAt: newExpiry.toISOString() })
      .eq('id', id);

    // Resend email
    const emailResult = await sendInvitationEmail(
      invitation.email,
      currentUser?.name || 'A team member',
      orgName,
      invitation.token,
      invitation.role
    );

    res.json({
      success: true,
      emailSent: emailResult.success,
      newExpiresAt: newExpiry.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
