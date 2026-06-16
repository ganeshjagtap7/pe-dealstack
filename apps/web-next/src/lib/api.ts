import { createClient } from "@/lib/supabase/client";

// All API calls go through Next's rewrite at /api/* → API origin (configured via
// API_PROXY_URL in next.config.ts). This keeps fetches same-origin in every
// environment so no CORS config is needed. Do NOT point this at an absolute
// cross-origin URL unless you've also configured CORS on the API.
const API_BASE_URL = "/api";

// Typed error for 404 responses so callers can distinguish "endpoint not found
// yet" from real errors and fail gracefully (empty state, no retry).
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

// Typed error for non-OK responses that preserves the API's `code` field so
// callers can branch on intent (e.g. `INVITE_SELF`) without parsing message
// strings.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  // We only need the access token to attach to the request — the API
  // re-validates that JWT server-side on every call (apps/api/.../auth.ts), so
  // validating it a second time here is redundant. getSession() reads the
  // cached session locally; the previous getUser() call hit Supabase's auth
  // server on EVERY api.get/post/patch/delete, adding a full network
  // round-trip to each request and making page data loads feel slow.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  // DELETE endpoints return 204 No Content with empty body
  if (res.status === 204) {
    return undefined as T;
  }

  if (res.status === 404) {
    throw new NotFoundError(`Not found: ${path}`);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    const message =
      (body as { error?: string; message?: string }).error ||
      (body as { message?: string }).message ||
      res.statusText ||
      `API error ${res.status}`;
    const code = (body as { code?: string }).code;

    // Org has enforced 2FA but the user hasn't enrolled — bounce them to
    // the security panel where the existing enrollment UI lives. The API
    // bypasses /api/auth/, /api/users/me, and /api/organizations/me so the
    // enrollment flow itself can still run after the redirect.
    if (res.status === 403 && code === "MFA_REQUIRED" && typeof window !== "undefined") {
      window.location.href = "/settings#section-security";
      throw new ApiError(message, res.status, code);
    }

    throw new ApiError(message, res.status, code);
  }

  return res.json();
}

/**
 * Lower-level fetch that returns the raw Response with auth headers attached.
 * Use when the response may not be JSON (e.g., binary downloads where the
 * server may stream a file OR return a JSON URL pointer).
 *
 * 401 still triggers a /login redirect. Other status codes are the caller's
 * problem to inspect.
 */
async function requestRaw(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  return res;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  getRaw: (path: string) => requestRaw(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
