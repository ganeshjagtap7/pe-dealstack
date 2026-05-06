import { createBrowserClient } from "@supabase/ssr";

// Memoise the browser client so every caller in the app shares one instance.
// gotrue-js's auth-refresh mutex is keyed by storage key, not by client object,
// so multiple clients don't give you isolation — they just thrash the same
// `lock:sb-<project>-auth-token` lock. With ~30 callsites (api.ts on every
// fetch, every page that does direct DB queries, etc.), parallel requests were
// timing out at gotrue-js's 5s lockTimeout and stealing each other's locks,
// surfacing as `AbortError: Lock broken by another request with the 'steal'
// option` on the dashboard. One client also lets gotrue-js's in-flight-request
// dedup collapse N concurrent getUser() calls into a single network round-trip.
let cached: ReturnType<typeof makeClient> | null = null;

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return createBrowserClient(url, key);
}

export function createClient() {
  if (!cached) cached = makeClient();
  return cached;
}
