import { describe, it, expect, vi, beforeEach } from 'vitest';

const usageEventsData = vi.fn();
const insertAlertSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
const updateUserEqSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'UsageEvent') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ data: usageEventsData(), error: null }),
            }),
          }),
        };
      }
      if (table === 'UsageAlert') {
        return { insert: insertAlertSpy };
      }
      if (table === 'User') {
        return { update: () => ({ eq: updateUserEqSpy }) };
      }
      return {};
    }),
  },
}));

vi.mock('../../src/services/email.js', () => ({
  sendEmail: vi.fn(() => Promise.resolve({ sent: true })),
  isEmailConfigured: () => true,
}));

import { checkRunawayThreshold } from '../../src/services/usage/runawayMonitor.js';
import { sendEmail } from '../../src/services/email.js';

const sendEmailSpy = vi.mocked(sendEmail);

describe('runawayMonitor', () => {
  beforeEach(() => {
    usageEventsData.mockReset();
    insertAlertSpy.mockClear();
    updateUserEqSpy.mockClear();
    sendEmailSpy.mockClear();
    process.env.USAGE_DAILY_COST_ALERT_USD = '20';
    process.env.USAGE_DAILY_TOKEN_ALERT = '500000';
    process.env.USAGE_AUTO_THROTTLE = 'true';
    process.env.INTERNAL_ALERT_EMAIL = 'alerts@pocket-fund.com';
  });

  it('does nothing when below thresholds', async () => {
    usageEventsData.mockReturnValue([{ costUsd: 5, totalTokens: 10000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).not.toHaveBeenCalled();
    expect(insertAlertSpy).not.toHaveBeenCalled();
  });

  it('alerts and throttles when cost crosses', async () => {
    usageEventsData.mockReturnValue([{ costUsd: 25, totalTokens: 10000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).toHaveBeenCalledOnce();
    expect(insertAlertSpy).toHaveBeenCalledOnce();
    const alertRow = insertAlertSpy.mock.calls[0][0];
    expect(alertRow.kind).toBe('cost');
    expect(updateUserEqSpy).toHaveBeenCalled();
  });

  it('alerts on token threshold separately', async () => {
    usageEventsData.mockReturnValue([{ costUsd: 1, totalTokens: 600_000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).toHaveBeenCalledOnce();
    expect(insertAlertSpy).toHaveBeenCalledOnce();
    expect(insertAlertSpy.mock.calls[0][0].kind).toBe('tokens');
  });

  it('alerts on both kinds when both crossed', async () => {
    usageEventsData.mockReturnValue([{ costUsd: 25, totalTokens: 600_000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).toHaveBeenCalledTimes(2);
    expect(insertAlertSpy).toHaveBeenCalledTimes(2);
  });

  it('does not throttle when USAGE_AUTO_THROTTLE=false', async () => {
    process.env.USAGE_AUTO_THROTTLE = 'false';
    usageEventsData.mockReturnValue([{ costUsd: 25, totalTokens: 10000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).toHaveBeenCalledOnce();
    expect(updateUserEqSpy).not.toHaveBeenCalled();
  });

  it('skips when INTERNAL_ALERT_EMAIL is not set', async () => {
    delete process.env.INTERNAL_ALERT_EMAIL;
    usageEventsData.mockReturnValue([{ costUsd: 25, totalTokens: 10000 }]);
    await checkRunawayThreshold('user-1');
    expect(sendEmailSpy).not.toHaveBeenCalled();
  });
});
