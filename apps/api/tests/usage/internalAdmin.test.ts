import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/supabase.js');
vi.mock('../../src/utils/logger.js');

import { requireInternalAdmin } from '../../src/middleware/internalAdmin.js';
import { supabase } from '../../src/supabase.js';

const mockSupabase = supabase as any;

function makeReq(authId: string | undefined): any {
  return { user: authId ? { id: authId } : undefined };
}

function makeRes(): any {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe('requireInternalAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when no user on request', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when isInternal is false', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { isInternal: false }, error: null }),
        }),
      }),
    });
    const req = makeReq('auth-123');
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when DB returns an error', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'no row' } }),
        }),
      }),
    });
    const req = makeReq('auth-123');
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when isInternal is true', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { isInternal: true }, error: null }),
        }),
      }),
    });
    const req = makeReq('auth-123');
    const res = makeRes();
    const next = vi.fn();
    await requireInternalAdmin(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
