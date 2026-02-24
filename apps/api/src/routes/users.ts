import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { supabase } from '../supabase.js';
import { requirePermission, PERMISSIONS } from '../middleware/rbac.js';
import { AuditLog } from '../services/auditLog.js';
import { log } from '../utils/logger.js';

// Configure multer for avatar uploads (images only, max 5MB)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  },
});

const router = Router();

// Query parameter schemas
const usersQuerySchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional(),
  department: z.string().max(100).optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().max(200).optional(),
  firmName: z.string().max(255).optional(),
  excludeUserId: z.string().uuid().optional(),
});

const teamQuerySchema = z.object({
  search: z.string().max(200).optional(),
  excludeSelf: z.enum(['true', 'false']).optional(),
});

const userNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

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
    const params = usersQuerySchema.parse(req.query);

    let query = supabase
      .from('User')
      .select('id, email, name, avatar, role, department, title, phone, isActive, firmName')
      .order('name', { ascending: true });

    if (params.firmName) {
      query = query.eq('firmName', params.firmName);
    }

    if (params.role) {
      query = query.eq('role', params.role);
    }

    if (params.department) {
      query = query.eq('department', params.department);
    }

    if (params.isActive !== undefined) {
      query = query.eq('isActive', params.isActive === 'true');
    } else {
      query = query.eq('isActive', true);
    }

    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
    }

    if (params.excludeUserId) {
      query = query.neq('id', params.excludeUserId);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    res.json(users || []);
  } catch (error) {
    next(error);
  }
});

// Helper to find user by authId or id, or create if not exists
async function findOrCreateUser(authUser: {
  id: string;
  email: string;
  name?: string;
  firmName?: string;
  role: string;
  user_metadata?: Record<string, unknown>;
}) {
  // Try to find by authId first
  let { data: userData, error } = await supabase
    .from('User')
    .select('*')
    .eq('authId', authUser.id)
    .single();

  // If not found by authId, try by id (legacy users)
  if (error?.code === 'PGRST116') {
    const result = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.id)
      .single();
    userData = result.data;
    error = result.error;
  }

  // If still not found, create the user
  if (error?.code === 'PGRST116') {
    // Get title from user_metadata if available
    const title = authUser.user_metadata?.title as string | undefined;

    const { data: newUser, error: createError } = await supabase
      .from('User')
      .insert({
        authId: authUser.id,
        email: authUser.email,
        name: authUser.name || authUser.email?.split('@')[0] || 'User',
        role: authUser.role || 'MEMBER',  // System role: ADMIN, MEMBER, VIEWER
        title: title || null,              // Display title: Partner, Analyst, etc.
        firmName: authUser.firmName || null,
        isActive: true,
      })
      .select()
      .single();

    if (createError) throw createError;
    return newUser;
  }

  if (error) throw error;
  return userData;
}

// GET /api/users/me - Get current user profile
// Must be defined before /:id to avoid matching "me" as an id
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userData = await findOrCreateUser(user);
    res.json(userData);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/me/team - Get team members from same firm as current user
// Useful for share modals - returns users that can be added to deals/VDRs
router.get('/me/team', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const params = teamQuerySchema.parse(req.query);

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get current user (will auto-create if needed)
    const currentUser = await findOrCreateUser(user);

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
    if (params.excludeSelf === 'true') {
      query = query.neq('id', user.id);
    }

    // Search filter
    if (params.search) {
      query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%`);
    }

    const { data: teamMembers, error } = await query;

    if (error) throw error;

    res.json(teamMembers || []);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/users/me - Update current user's own profile
// No special permission needed - users can always update their own profile
const updateSelfSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatar: z.string().url().optional().nullable(),
  title: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
  // AI preferences (stored as JSON in preferences column)
  investmentFocus: z.array(z.string()).optional(),
  sourcingSensitivity: z.number().min(0).max(100).optional(),
  typography: z.enum(['modern', 'serif']).optional(),
  density: z.enum(['compact', 'default', 'relaxed']).optional(),
  // AI extraction defaults
  preferredCurrency: z.string().max(10).optional(),
  autoExtract: z.boolean().optional(),
  autoUpdateDeal: z.boolean().optional(),
  // Notification preferences
  notifications: z.record(z.boolean()).optional(),
  // Dashboard display preferences
  dealCardMetrics: z.array(z.enum(['irrProjected', 'mom', 'ebitda', 'revenue', 'dealSize'])).min(1).max(5).optional(),
});

router.patch('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const validation = updateSelfSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    // First, find the user to get the actual User table id
    const existingUser = await findOrCreateUser(user);

    // Build update object - only include fields that were provided
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (validation.data.name !== undefined) updateData.name = validation.data.name;
    if (validation.data.avatar !== undefined) updateData.avatar = validation.data.avatar;
    if (validation.data.title !== undefined) updateData.title = validation.data.title;
    if (validation.data.phone !== undefined) updateData.phone = validation.data.phone;

    // Build preferences update — merge with existing preferences
    const newPrefs: Record<string, any> = {};
    if (validation.data.investmentFocus !== undefined) newPrefs.investmentFocus = validation.data.investmentFocus;
    if (validation.data.sourcingSensitivity !== undefined) newPrefs.sourcingSensitivity = validation.data.sourcingSensitivity;
    if (validation.data.typography !== undefined) newPrefs.typography = validation.data.typography;
    if (validation.data.density !== undefined) newPrefs.density = validation.data.density;
    if (validation.data.preferredCurrency !== undefined) newPrefs.preferredCurrency = validation.data.preferredCurrency;
    if (validation.data.autoExtract !== undefined) newPrefs.autoExtract = validation.data.autoExtract;
    if (validation.data.autoUpdateDeal !== undefined) newPrefs.autoUpdateDeal = validation.data.autoUpdateDeal;
    if (validation.data.notifications !== undefined) newPrefs.notifications = validation.data.notifications;
    if (validation.data.dealCardMetrics !== undefined) newPrefs.dealCardMetrics = validation.data.dealCardMetrics;

    if (Object.keys(newPrefs).length > 0) {
      // Merge with existing preferences so we don't overwrite unrelated fields
      const existingPrefs = typeof existingUser.preferences === 'string'
        ? JSON.parse(existingUser.preferences || '{}')
        : (existingUser.preferences || {});
      updateData.preferences = { ...existingPrefs, ...newPrefs };
    }

    // Update by the actual User table id (not auth id)
    const { data: updatedUser, error } = await supabase
      .from('User')
      .update(updateData)
      .eq('id', existingUser.id)
      .select()
      .single();

    if (error) {
      // If preferences column doesn't exist, try without it
      if (error.message?.includes('preferences')) {
        delete updateData.preferences;
        const { data: retryUser, error: retryError } = await supabase
          .from('User')
          .update(updateData)
          .eq('id', existingUser.id)
          .select()
          .single();

        if (retryError) throw retryError;
        return res.json(retryUser);
      }
      throw error;
    }

    res.json(updatedUser);
  } catch (error) {
    next(error);
  }
});

// POST /api/users/me/avatar - Upload avatar for current user
router.post('/me/avatar', avatarUpload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get or create the user record
    const existingUser = await findOrCreateUser(user);

    // Generate unique filename
    const timestamp = Date.now();
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filePath = `avatars/${existingUser.id}/${timestamp}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      log.error('Avatar upload error', uploadError);
      return res.status(500).json({ error: 'Failed to upload avatar' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    const avatarUrl = urlData?.publicUrl;

    if (!avatarUrl) {
      return res.status(500).json({ error: 'Failed to get avatar URL' });
    }

    // Update user record with new avatar URL
    const { data: updatedUser, error: updateError } = await supabase
      .from('User')
      .update({
        avatar: avatarUrl,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', existingUser.id)
      .select()
      .single();

    if (updateError) {
      log.error('Failed to update user avatar', updateError);
      return res.status(500).json({ error: 'Failed to update profile with avatar' });
    }

    log.info('Avatar uploaded successfully', { userId: existingUser.id, avatarUrl });
    res.json(updatedUser);
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
    const params = userNotificationsQuerySchema.parse(req.query);

    let query = supabase
      .from('Notification')
      .select('*')
      .eq('userId', id)
      .order('createdAt', { ascending: false });

    if (params.unreadOnly === 'true') {
      query = query.eq('isRead', false);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    res.json(notifications || []);
  } catch (error) {
    next(error);
  }
});

export default router;
