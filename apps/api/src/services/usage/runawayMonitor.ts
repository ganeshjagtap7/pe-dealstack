import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { sendEmail } from '../email.js';

/**
 * Check whether `userId` has crossed today's cost or token threshold.
 * Side effects (all best-effort, never throws):
 * - Insert dedup row in UsageAlert (PK conflict = already alerted today)
 * - Send email to INTERNAL_ALERT_EMAIL describing the threshold cross
 * - If USAGE_AUTO_THROTTLE=true, set User.isThrottled=true
 *
 * Designed to be called fire-and-forget from recordUsageEvent — must not
 * propagate errors back to the LLM call path.
 */
export async function checkRunawayThreshold(userId: string): Promise<void> {
  try {
    const costThreshold = Number(process.env.USAGE_DAILY_COST_ALERT_USD ?? 20);
    const tokenThreshold = Number(process.env.USAGE_DAILY_TOKEN_ALERT ?? 500_000);
    const autoThrottle = process.env.USAGE_AUTO_THROTTLE === 'true';
    const alertEmail = process.env.INTERNAL_ALERT_EMAIL;
    if (!alertEmail) return;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('UsageEvent')
      .select('costUsd, totalTokens')
      .eq('userId', userId)
      .gte('createdAt', dayStart.toISOString());
    if (error) {
      log.error('runawayMonitor: query failed', error);
      return;
    }
    const rows = (data ?? []) as Array<{ costUsd: number | null; totalTokens: number | null }>;
    const totalCost = rows.reduce((acc, r) => acc + Number(r.costUsd ?? 0), 0);
    const totalTokens = rows.reduce((acc, r) => acc + Number(r.totalTokens ?? 0), 0);

    const triggers: Array<{ kind: 'cost' | 'tokens'; value: number; threshold: number }> = [];
    if (totalCost >= costThreshold) {
      triggers.push({ kind: 'cost', value: totalCost, threshold: costThreshold });
    }
    if (totalTokens >= tokenThreshold) {
      triggers.push({ kind: 'tokens', value: totalTokens, threshold: tokenThreshold });
    }
    if (triggers.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);

    for (const t of triggers) {
      // Dedup via PK conflict — silently skip on duplicate
      const { error: alertErr } = await supabase
        .from('UsageAlert')
        .insert({ userId, alertDate: today, kind: t.kind });
      if (alertErr) {
        const msg = String(alertErr.message ?? '').toLowerCase();
        if (msg.includes('duplicate') || msg.includes('unique')) {
          // Already alerted today — skip this trigger
          continue;
        }
        log.error('runawayMonitor: alert insert failed', alertErr);
        continue;
      }

      void sendEmail({
        to: alertEmail,
        subject: `[Pocket Fund] Runaway usage: user ${userId} crossed ${t.kind} threshold`,
        text:
          `User ${userId} crossed today's ${t.kind} threshold.\n` +
          `Value: ${t.value}\n` +
          `Threshold: ${t.threshold}\n` +
          `Total cost today: $${totalCost.toFixed(4)}\n` +
          `Total tokens today: ${totalTokens}\n`,
      });

      if (autoThrottle) {
        await supabase.from('User').update({ isThrottled: true }).eq('id', userId);
      }
    }
  } catch (err) {
    log.error('runawayMonitor: unexpected error', err);
  }
}
