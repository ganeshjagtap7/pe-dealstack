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

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  // Use getUser() — getSession() reads from local storage without server
  // validation (Supabase docs warn against relying on it for auth checks).
  // We still need the session for the access_token, but only fetch it after
  // confirming the user is valid.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { "Content-Type": "application/json" };
  }
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
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || `API error ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
