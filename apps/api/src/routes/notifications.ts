import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase';

const router = Router();

// Validation schemas
const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(['DEAL_UPDATE', 'DOCUMENT_UPLOADED', 'MENTION', 'AI_INSIGHT', 'TASK_ASSIGNED', 'COMMENT', 'SYSTEM']),
  title: z.string().min(1).max(255),
  message: z.string().optional(),
  dealId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
});

const updateNotificationSchema = z.object({
  isRead: z.boolean(),
});

// GET /api/notifications - List notifications for a user
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, type, isRead, limit, offset } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let query = supabase
      .from('Notification')
      .select(`
        *,
        Deal (
          id,
          name
        )
      `)
      .eq('userId', userId)
      .order('createdAt', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    if (isRead !== undefined) {
      query = query.eq('isRead', isRead === 'true');
    }

    if (limit) {
      query = query.limit(parseInt(limit as string, 10));
    }

    if (offset) {
      const limitNum = parseInt(limit as string || '50', 10);
      const offsetNum = parseInt(offset as string, 10);
      query = query.range(offsetNum, offsetNum + limitNum - 1);
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('Notification')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)
      .eq('isRead', false);

    res.json({
      notifications: notifications || [],
      unreadCount: unreadCount || 0
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/notifications/:id - Get a single notification
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data: notification, error } = await supabase
      .from('Notification')
      .select(`
        *,
        Deal (
          id,
          name,
          stage
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Notification not found' });
      }
      throw error;
    }

    res.json(notification);
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications - Create a notification
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = createNotificationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { data: notification, error } = await supabase
      .from('Notification')
      .insert(validation.data)
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notifications/:id - Mark as read/unread
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validation = updateNotificationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors
      });
    }

    const { data: notification, error } = await supabase
      .from('Notification')
      .update(validation.data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Notification not found' });
      }
      throw error;
    }

    res.json(notification);
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/mark-all-read - Mark all notifications as read for a user
router.post('/mark-all-read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabase
      .from('Notification')
      .update({ isRead: true })
      .eq('userId', userId)
      .eq('isRead', false);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('Notification')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notifications - Delete all notifications for a user
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, readOnly } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let query = supabase
      .from('Notification')
      .delete()
      .eq('userId', userId);

    if (readOnly === 'true') {
      query = query.eq('isRead', true);
    }

    const { error } = await query;

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Utility function to create notifications (exported for use in other routes)
export async function createNotification(data: {
  userId: string;
  type: string;
  title: string;
  message?: string;
  dealId?: string;
  documentId?: string;
}) {
  const { data: notification, error } = await supabase
    .from('Notification')
    .insert(data)
    .select()
    .single();

  if (error) {
    console.error('Failed to create notification:', error);
    return null;
  }

  return notification;
}

// Utility to notify all team members of a deal
export async function notifyDealTeam(
  dealId: string,
  type: string,
  title: string,
  message?: string,
  excludeUserId?: string
) {
  // Get all team members for the deal
  const { data: teamMembers, error } = await supabase
    .from('DealTeamMember')
    .select('userId')
    .eq('dealId', dealId);

  if (error || !teamMembers) {
    console.error('Failed to get deal team members:', error);
    return;
  }

  // Create notifications for each team member
  const notifications = teamMembers
    .filter(tm => tm.userId !== excludeUserId)
    .map(tm => ({
      userId: tm.userId,
      type,
      title,
      message,
      dealId,
    }));

  if (notifications.length > 0) {
    const { error: insertError } = await supabase
      .from('Notification')
      .insert(notifications);

    if (insertError) {
      console.error('Failed to create team notifications:', insertError);
    }
  }
}

export default router;
