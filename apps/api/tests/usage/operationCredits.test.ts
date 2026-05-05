import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCreditsForOperation, _resetOperationCreditsCache } from '../../src/services/usage/operationCredits.js';

vi.mock('../../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({
        data: [
          { operation: 'deal_chat', credits: 1, description: 'chat' },
          { operation: 'firm_research', credits: 40, description: 'research' },
        ],
        error: null,
      })),
    })),
  },
}));

describe('operationCredits', () => {
  beforeEach(() => _resetOperationCreditsCache());

  it('returns credits for a known operation', async () => {
    expect(await getCreditsForOperation('deal_chat')).toBe(1);
    expect(await getCreditsForOperation('firm_research')).toBe(40);
  });

  it('returns default 1 credit for unknown operation and warns', async () => {
    expect(await getCreditsForOperation('unknown_op')).toBe(1);
  });
});
