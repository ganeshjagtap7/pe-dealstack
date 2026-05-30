"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

// Scopes mirror /login — keep them in sync. Re-auth (consent prompt) must
// request the same set or the backend will reject the second attempt for
// missing scopes.
const GOOGLE_OAUTH_SCOPES =
  "email profile https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents";

interface GoogleTokensBody {
  providerToken: string;
  providerRefreshToken: string;
  expiresIn: number;
  scopes: string;
  googleEmail: string;
}

function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

/**
 * OAuth round-trip landing page. Supabase's hosted OAuth flow lands the user
 * here with a session cookie set. We:
 *   1. Read provider_token / provider_refresh_token off the Supabase session
 *   2. POST them to /api/auth/google-tokens so the backend can hold a refresh
 *      token for Drive/Docs API calls
 *   3. On NO_REFRESH_TOKEN, kick the user through one more OAuth cycle with
 *      `prompt=consent` to force Google to mint a refresh token
 *   4. Otherwise redirect to /dashboard
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<
    | { kind: "working"; label: string }
    | { kind: "reauth"; reason: string }
    | { kind: "error"; message: string }
  >({ kind: "working", label: "Finishing sign-in…" });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function reAuthWithConsent(
      supabase: ReturnType<typeof createClient>,
    ) {
      setStatus({
        kind: "reauth",
        reason: "Google didn't return a refresh token. Re-prompting consent…",
      });
      const { error: reauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes: GOOGLE_OAUTH_SCOPES,
          queryParams: { access_type: "offline", prompt: "consent" },
          redirectTo: `${appOrigin()}/callback`,
        },
      });
      if (reauthError) {
        setStatus({
          kind: "error",
          message: `Couldn't restart Google sign-in: ${reauthError.message}`,
        });
      }
    }

    (async () => {
      const supabase = createClient();

      // Supabase will have just persisted the session cookie via the
      // ?code= exchange. Pulling the session here works in both the
      // implicit and PKCE flows.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        console.warn("[auth/callback] no session after OAuth:", sessionError);
        setStatus({
          kind: "error",
          message:
            "We couldn't read your sign-in session. Try again, and if the problem persists ask your admin to check the Google Workspace OAuth config.",
        });
        return;
      }

      const session = data.session;
      const providerToken = session.provider_token;
      const providerRefreshToken = session.provider_refresh_token;
      const email = session.user?.email;

      if (!providerToken || !email) {
        // Email-less or no-token sessions are usually personal Gmail
        // accounts that bypassed the workspace flow. Bounce to dashboard
        // so they can still see the app but NDA features will surface
        // the workspace-required notice.
        console.warn(
          "[auth/callback] missing provider_token or email; skipping token sync",
        );
        router.replace("/dashboard");
        return;
      }

      if (!providerRefreshToken) {
        // No refresh token from Google — we need to re-prompt with
        // `prompt=consent` + `access_type=offline`. Trigger that here so the
        // user doesn't have to click again.
        console.warn(
          "[auth/callback] no refresh token; restarting OAuth with prompt=consent",
        );
        await reAuthWithConsent(supabase);
        return;
      }

      const body: GoogleTokensBody = {
        providerToken,
        providerRefreshToken,
        expiresIn: session.expires_in ?? 3600,
        scopes: GOOGLE_OAUTH_SCOPES,
        googleEmail: email,
      };

      try {
        await api.post("/auth/google-tokens", body);
        router.replace("/dashboard");
      } catch (err) {
        if (err instanceof ApiError && err.code === "NO_REFRESH_TOKEN") {
          // Backend rejected — Google didn't give it a refresh token
          // either (Supabase sometimes filters it before forwarding).
          // Same fix: prompt=consent + offline.
          console.warn(
            "[auth/callback] backend NO_REFRESH_TOKEN; restarting OAuth with prompt=consent",
          );
          await reAuthWithConsent(supabase);
          return;
        }
        console.warn("[auth/callback] token sync failed:", err);
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Sign-in succeeded but we couldn't store your Google connection. Try signing in again.",
        });
      }
    })();
  }, [router]);

  const isError = status.kind === "error";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-white"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[20px]">
              candlestick_chart
            </span>
          </div>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "#003366" }}
          >
            PE<span className="font-light opacity-80">OS</span>
          </span>
        </div>

        {!isError ? (
          <>
            <div
              className="w-10 h-10 mx-auto mb-4 border-4 border-slate-200 border-t-[#003366] rounded-full animate-spin"
              aria-label="Working"
            />
            <h1 className="text-base font-semibold text-slate-900">
              {status.kind === "working" ? status.label : "Re-prompting Google…"}
            </h1>
            {status.kind === "reauth" && (
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {status.reason}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="w-10 h-10 mx-auto mb-4 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <span className="material-symbols-outlined">error</span>
            </div>
            <h1 className="text-base font-semibold text-slate-900 mb-2">
              Sign-in problem
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">
              {status.message}
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="px-4 py-2 rounded-md text-sm font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: "#003366" }}
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
