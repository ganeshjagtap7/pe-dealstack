import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';

const router = Router();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  avatar: z.string().url().optional(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
  department: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url().optional(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  firmName: z.string().optional(),
});

// GET /api/users - List all users
// Query params: role, department, isActive, search, firmName, excludeUserId
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, department, isActive, search, firmName, excludeUserId } = req.query;

    let query = supabase
      .from('User')
      .select('id, email, name, avatar, role, department, title, phone, isActive, firmName')
      .order('name', { ascending: true });

    // Filter by firm name (for team member selection)
    if (firmName) {
      query = query.eq('firmName', firmName);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (department) {
      query = query.eq('department', department);
    }

    if (isActive !== undefined) {
      query = query.eq('isActive', isActive === 'true');
    } else {
      // Default to only active users
      query = query.eq('isActive', true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Exclude a specific user (useful for share modal - exclude current user)
    if (excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    res.json(users || []);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me - Get current user profile
// Must be defined before /:id to avoid matching "me" as an id
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { data: userData, error } = await supabase
      .from('User')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json(userData);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me/team - Get team members from same firm as current user
// Useful for share modals - returns users that can be added to deals/VDRs
router.get('/me/team', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { search, excludeSelf } = req.query;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get current user's firmName
    const { data: currentUser, error: userError } = await supabase
      .from('User')
      .select('firmName')
      .eq('id', user.id)
      .single();

    if (userError) throw userError;

    // If user has no firm, return empty list
    if (!currentUser?.firmName) {
      return res.json([]);
    }

    // Get all users in the same firm
    let query = supabase
      .from('User')
      .select('id, email, name, avatar, role, department, title')
      .eq('firmName', currentUser.firmName)
      .eq('isActive', true)
      .order('name', { ascending: true });

    // Optionally exclude current user
    if (excludeSelf === 'true') {
      query = query.neq('id', user.id);
    }

    // Search filter
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: teamMembers, error } = await query;

    if (error) throw error;

    res.json(teamMembers || []);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Get a single user
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('User')
      .select(`
        *,
        DealTeamMember (
          id,
          role,
          addedAt,
          Deal (
            id,
            name,
            stage,
            status
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Create a new user (requires USER_CREATE permission)
router.post('/', requirePermission(PERMISSIONS.USER_CREATE), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createUserSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    // Check if email already exists
    const { data: existing } = await supabase
      .from('User')
      .select('id')
      .eq('email', validation.data.email)
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const { data: user, error } = await supabase
      .from('User')
      .insert(validation.data)
      .select()
      .single();

    if (error) throw error;

    // Audit log
    await AuditLog.userCreated(req, user.id, user.email);

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/:id - Update a user (requires USER_EDIT permission)
router.patch('/:id', requirePermission(PERMISSIONS.USER_EDIT), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validation = updateUserSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { data: user, error } = await supabase
      .from('User')
      .update({
        ...validation.data,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    // Audit log - log role changes with higher severity
    if (validation.data.role) {
      await AuditLog.userUpdated(req, user.id, user.email, { roleChanged: true, newRole: validation.data.role });
    } else {
      await AuditLog.userUpdated(req, user.id, user.email, validation.data);
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - Soft delete a user (requires USER_DELETE permission)
router.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { hard } = req.query;

    // Get user email before deleting for audit log
    const { data: userToDelete } = await supabase
      .from('User')
      .select('email')
      .eq('id', id)
      .single();

    if (hard === 'true') {
      // Hard delete - remove from database
      const { error } = await supabase
        .from('User')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } else {
      // Soft delete - set isActive to false
      const { error } = await supabase
        .from('User')
        .update({ isActive: false, updatedAt: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    }

    // Audit log
    await AuditLog.userDeleted(req, id, userToDelete?.email || 'Unknown');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/deals - Get deals assigned to a user
router.get('/:id/deals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: teamMemberships, error } = await supabase
      .from('DealTeamMember')
      .select(`
        id,
        role,
        addedAt,
        Deal (
          id,
          name,
          stage,
          status,
          industry,
          dealSize,
          irrProjected,
          Company (
            id,
            name,
            logo
          )
        )
      `)
      .eq('userId', id);

    if (error) throw error;

    res.json(teamMemberships || []);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id/notifications - Get notifications for a user
router.get('/:id/notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { unreadOnly, limit } = req.query;

    let query = supabase
      .from('Notification')
      .select('*')
      .eq('userId', id)
      .order('createdAt', { ascending: false });

    if (unreadOnly === 'true') {
      query = query.eq('isRead', false);
    }

    if (limit) {
      query = query.limit(parseInt(limit as string, 10));
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    res.json(notifications || []);
  } catch (error) {
    next(error);
  }
});

export default router;
