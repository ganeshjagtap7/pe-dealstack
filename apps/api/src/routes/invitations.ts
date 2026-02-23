import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../supabase.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';
import { createNotification } from './notifications.js';

const router = Router();

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Validation schemas
const createInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

const bulkInviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(20),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

// Helper: Generate secure token
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper: Get expiration date (7 days from now)
function getExpirationDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

// Helper: Send invitation email via Resend
async function sendInvitationEmail(
  email: string,
  inviterName: string,
  firmName: string,
  token: string,
  role: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/accept-invite.html?token=${token}`;

    log.info('Sending invitation email', { email, inviterName, firmName, role, inviteUrl });

    if (!resend) {
      log.warn('Resend not configured — RESEND_API_KEY missing. Invitation URL logged above.');
      return { success: false, error: 'Email service not configured (RESEND_API_KEY missing)' };
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const { data, error } = await resend.emails.send({
      from: `PE OS <${fromEmail}>`,
      to: [email],
      subject: `You're invited to join ${firmName} on PE OS`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #003366, #0055aa); padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">PE OS</h1>
            <p style="color: #b3d1ff; margin: 8px 0 0; font-size: 14px;">AI-Powered Private Equity CRM</p>
          </div>
          <div style="padding: 32px;">
            <h2 style="color: #003366; margin: 0 0 16px; font-size: 20px;">You're Invited! 🎉</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              <strong>${inviterName}</strong> has invited you to join <strong>${firmName}</strong> on PE OS.
            </p>
            <p style="color: #555; font-size: 15px; line-height: 1.6;">
              You've been assigned the role of <strong>${role}</strong>. Click the button below to create your account and get started.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${inviteUrl}"
                 style="background: linear-gradient(135deg, #003366, #0055aa); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 16px; font-weight: 600; letter-spacing: 0.5px;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #888; font-size: 13px; text-align: center;">This invitation expires in 7 days.</p>
          </div>
          <hr style="border: none; border-top: 1px solid #eef2f7; margin: 0;" />
          <div style="padding: 20px 32px; text-align: center;">
            <p style="color: #aaa; font-size: 12px; margin: 0;">
              PE OS — AI-Powered Private Equity CRM<br/>
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        </div>
      `,
    });

    if (error) {
      log.error('Resend email error', error);
      return { success: false, error: error.message || 'Failed to send email' };
    }

    log.info('Invitation email sent successfully', { email, messageId: data?.id });
    return { success: true };
  } catch (error) {
    log.error('Email send error', error);
    return { success: false, error: 'Failed to send invitation email' };
  }
}

// GET /api/invitations - List invitations for current user's firm
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const { status } = req.query;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get current user's firmName
    const { data: currentUser, error: userError } = await supabase
      .from('User')
      .select('firmName, role')
      .eq('authId', user.id)
      .maybeSingle();

    if (userError) throw userError;

    if (!currentUser?.firmName) {
      return res.json([]);
    }

    // Build query
    let query = supabase
      .from('Invitation')
      .select(`
        id,
        email,
        role,
        status,
        createdAt,
        expiresAt,
        acceptedAt,
        inviter:User!invitedBy(id, name, email, avatar)
      `)
      .eq('firmName', currentUser.firmName)
      .order('createdAt', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: invitations, error } = await query;

    if (error) throw error;

    res.json(invitations || []);
  } catch (error) {
    next(error);
  }
});

// POST /api/invitations - Create and send invitation
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const validation = createInvitationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { email, role } = validation.data;

    log.info('Creating invitation', { email, role, userId: user.id });

    // Get current user's info (user.id from auth middleware is the Supabase auth UUID, stored as authId in User table)
    const { data: currentUser, error: userError } = await supabase
      .from('User')
      .select('id, name, firmName, role')
      .eq('authId', user.id)
      .maybeSingle();

    log.info('Current user lookup result', { currentUser: currentUser?.id, firmName: currentUser?.firmName, userError: userError?.message });

    if (userError) throw userError;

    if (!currentUser) {
      return res.status(400).json({ error: 'User profile not found' });
    }

    if (!currentUser?.firmName) {
      return res.status(400).json({ error: 'You must belong to a firm to invite members' });
    }

    // Only ADMIN can invite ADMINs
    if (role === 'ADMIN' && currentUser.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can invite admin users' });
    }

    // Check if user already exists in the firm
    const { data: existingUser, error: existingUserErr } = await supabase
      .from('User')
      .select('id')
      .eq('email', email)
      .eq('firmName', currentUser.firmName)
      .maybeSingle();

    log.info('Existing user check', { existingUser, error: existingUserErr?.message });

    if (existingUser) {
      return res.status(400).json({ error: 'User is already a member of your firm' });
    }

    // Check for existing pending invitation
    const { data: existingInvite, error: existingInviteErr } = await supabase
      .from('Invitation')
      .select('id')
      .eq('email', email)
      .eq('firmName', currentUser.firmName)
      .eq('status', 'PENDING')
      .maybeSingle();

    log.info('Existing invite check', { existingInvite, error: existingInviteErr?.message });

    if (existingInvite) {
      return res.status(400).json({ error: 'An invitation is already pending for this email' });
    }

    // Create invitation
    const token = generateToken();
    const expiresAt = getExpirationDate();

    log.info('Inserting invitation record', { email, firmName: currentUser.firmName, role });

    const { data: invitation, error: insertError } = await supabase
      .from('Invitation')
      .insert({
        email,
        firmName: currentUser.firmName,
        role,
        invitedBy: currentUser.id,
        token,
        expiresAt: expiresAt.toISOString(),
        status: 'PENDING',
      })
      .select()
      .single();

    if (insertError) {
      log.error('Invitation insert error', insertError);
      throw insertError;
    }

    // Send invitation email
    const emailResult = await sendInvitationEmail(
      email,
      currentUser.name || 'A team member',
      currentUser.firmName,
      token,
      role
    );

    if (!emailResult.success) {
      log.warn('Email send failed but invitation created', { error: emailResult.error });
    }

    // Audit log
    await AuditLog.log(req, {
      action: 'INVITATION_SENT',
      resourceType: 'Invitation',
      resourceId: invitation.id,
      metadata: { email, role, firmName: currentUser.firmName },
    });

    res.status(201).json({
      ...invitation,
      emailSent: emailResult.success,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/invitations/bulk - Send multiple invitations
router.post('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const validation = bulkInviteSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { emails, role } = validation.data;

    // Get current user's info (user.id is supabase auth UUID)
    const { data: currentUser, error: userError } = await supabase
      .from('User')
      .select('id, name, firmName, role')
      .eq('authId', user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!currentUser) {
      return res.status(400).json({ error: 'User profile not found' });
    }

    if (!currentUser?.firmName) {
      return res.status(400).json({ error: 'You must belong to a firm to invite members' });
    }

    const results: { email: string; status: 'sent' | 'exists' | 'pending' | 'error'; error?: string }[] = [];

    for (const email of emails) {
      try {
        // Check if user already exists
        const { data: existingUser } = await supabase
          .from('User')
          .select('id')
          .eq('email', email)
          .eq('firmName', currentUser.firmName)
          .maybeSingle();

        if (existingUser) {
          results.push({ email, status: 'exists' });
          continue;
        }

        // Check for pending invitation
        const { data: existingInvite } = await supabase
          .from('Invitation')
          .select('id')
          .eq('email', email)
          .eq('firmName', currentUser.firmName)
          .eq('status', 'PENDING')
          .maybeSingle();

        if (existingInvite) {
          results.push({ email, status: 'pending' });
          continue;
        }

        // Create invitation
        const token = generateToken();
        const expiresAt = getExpirationDate();

        const { error: insertError } = await supabase
          .from('Invitation')
          .insert({
            email,
            firmName: currentUser.firmName,
            role,
            invitedBy: currentUser.id,
            token,
            expiresAt: expiresAt.toISOString(),
            status: 'PENDING',
          });

        if (insertError) throw insertError;

        // Send email
        await sendInvitationEmail(
          email,
          currentUser.name || 'A team member',
          currentUser.firmName,
          token,
          role
        );

        results.push({ email, status: 'sent' });
      } catch (error) {
        results.push({ email, status: 'error', error: 'Failed to process' });
      }
    }

    res.json({
      total: emails.length,
      sent: results.filter(r => r.status === 'sent').length,
      results,
    });
  } catch (error) {
    next(error);
  }
});

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
        role,
        status,
        expiresAt,
        inviter:User!invitedBy(name, avatar)
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

    res.json({
      valid: true,
      email: invitation.email,
      firmName: invitation.firmName,
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

    // Get invitation
    const { data: invitation, error: invError } = await supabase
      .from('Invitation')
      .select('*')
      .eq('token', token)
      .single();

    if (invError || !invitation) {
      return res.status(404).json({ error: 'Invalid invitation' });
    }

    // Check if expired
    if (new Date(invitation.expiresAt) < new Date()) {
      // Update status to expired
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

    // Check if email already registered in auth
    // This would be handled by Supabase auth.signUp

    // Create auth user via Supabase admin
    // Note: In production, this would use the service role key
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        data: {
          full_name: fullName || invitation.email.split('@')[0],
          firm_name: invitation.firmName,
          role: invitation.role,
          invited: true,
        },
      },
    });

    if (authError) {
      log.error('Auth signup error', authError);
      return res.status(400).json({ error: authError.message });
    }

    // Create User record in public.User table
    const { data: newUser, error: userError } = await supabase
      .from('User')
      .insert({
        authId: authData.user?.id,
        email: invitation.email,
        name: fullName || invitation.email.split('@')[0],
        firmName: invitation.firmName,
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
      metadata: { email: invitation.email, firmName: invitation.firmName },
    });

    // Notify firm admins: new member joined (fire-and-forget)
    const memberName = fullName || invitation.email.split('@')[0];
    (async () => {
      try {
        const { data: admins } = await supabase
          .from('User')
          .select('id')
          .eq('firmName', invitation.firmName)
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
      // Include session if auto-confirmed
      session: authData.session,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/invitations/:id - Revoke invitation
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const { id } = req.params;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get the invitation
    const { data: invitation, error: getError } = await supabase
      .from('Invitation')
      .select('*, inviter:User!invitedBy(firmName)')
      .eq('id', id)
      .single();

    if (getError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if user is from the same firm
    const { data: currentUser } = await supabase
      .from('User')
      .select('firmName')
      .eq('authId', user.id)
      .maybeSingle();

    if (currentUser?.firmName !== invitation.firmName) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Update status to revoked
    const { error: updateError } = await supabase
      .from('Invitation')
      .update({ status: 'REVOKED' })
      .eq('id', id);

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

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get invitation and current user
    const { data: invitation, error: getError } = await supabase
      .from('Invitation')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Can only resend pending invitations' });
    }

    const { data: currentUser } = await supabase
      .from('User')
      .select('name, firmName')
      .eq('authId', user.id)
      .maybeSingle();

    if (currentUser?.firmName !== invitation.firmName) {
      return res.status(403).json({ error: 'Not authorized' });
    }

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
      invitation.firmName,
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
