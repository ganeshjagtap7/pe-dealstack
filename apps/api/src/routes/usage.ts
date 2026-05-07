import { Router, Request, Response } from 'express';
import { supabase } from '../supabase.js';
import { requireOrg } from '../middleware/orgScope.js';

const router = Router();

router.get('/me', requireOrg, async (req: Request, res: Response) => {
  const authId = req.user?.id;
  if (!authId) return res.status(401).json({ error: 'Unauthorized' });

  // Resolve internal User.id from authId (req.user.id is the Supabase Auth UUID)
  const { data: userRow } = await supabase
    .from('User')
    .select('id')
    .eq('authId', authId)
    .single();
  if (!userRow) return res.status(404).json({ error: 'User not found' });

  // Calendar-month rollup
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('UsageEvent')
    .select('operation, credits')
    .eq('userId', userRow.id)
    .gte('createdAt', monthStart.toISOString());
  if (error) return res.status(500).json({ error: error.message });

  const byOp = new Map<string, { count: number; credits: number }>();
  let totalCredits = 0;
  for (const e of (data ?? []) as Array<{ operation: string; credits: number | null }>) {
    const cur = byOp.get(e.operation) ?? { count: 0, credits: 0 };
    cur.count += 1;
    cur.credits += Number(e.credits ?? 0);
    byOp.set(e.operation, cur);
    totalCredits += Number(e.credits ?? 0);
  }
  const breakdown = [...byOp.entries()]
    .map(([operation, v]) => ({ operation, ...v }))
    .sort((a, b) => b.credits - a.credits);

  res.json({ totalCredits, breakdown, monthStart: monthStart.toISOString() });
});

export default router;
