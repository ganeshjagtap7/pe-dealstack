// Sentry browser SDK init. Loaded automatically by @sentry/nextjs on the
// client when this file exists at the project root. DSN comes from env —
// never hardcode. NEXT_PUBLIC_ prefix is required so it's exposed to the
// browser bundle.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance: sample 10% of transactions in prod. Bump locally if you
  // need to see traces while developing.
  tracesSampleRate: 0.1,

  // Session Replay: don't record happy-path sessions (cost), but capture
  // 100% when an error fires so we get the lead-up to the crash.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // VERCEL_ENV is "production" | "preview" | "development" on Vercel; falls
  // back to "development" for local runs where the var isn't set.
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
});
