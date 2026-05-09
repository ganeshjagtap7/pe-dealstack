import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// We mock @/lib/supabase/client BEFORE importing the API module so the
// auth-fetching path uses our stubs. The session/token wiring is tested by
// the calls we make through the api object.
const getUserMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      getSession: getSessionMock,
    },
  }),
}));

import { api, NotFoundError } from "./api";

describe("api wrapper", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocation = window.location;
    // jsdom locks window.location.href setter sometimes — replace the whole
    // object with a writable stub so the 401 redirect path can be observed.
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "/" } as Location,
    });

    // default: authenticated user with a token
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
    vi.restoreAllMocks();
    getUserMock.mockReset();
    getSessionMock.mockReset();
  });

  it("prefixes the path with /api and forwards a Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await api.get<{ ok: boolean }>("/deals");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/deals");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("throws NotFoundError on 404 instead of a generic Error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 })) as unknown as typeof fetch;

    await expect(api.get("/missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("redirects to /login on 401", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 401 })) as unknown as typeof fetch;

    await expect(api.get("/secure")).rejects.toThrow("Unauthorized");
    expect(window.location.href).toBe("/login");
  });

  it("posts the body as JSON with method=POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "d1" }), { status: 200 })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await api.post<{ id: string }>("/deals", { name: "Acme" });

    expect(result).toEqual({ id: "d1" });
    const [, init] = fetchMock.mock.calls[0];
    const opts = init as RequestInit;
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ name: "Acme" }));
  });

  it("returns undefined on 204 without parsing body", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof fetch;

    const result = await api.delete<undefined>("/deals/d1");
    expect(result).toBeUndefined();
  });
});
