// Sentry init for the Edge runtime (middleware, edge route handlers).
// Trimmed: no replay, no profiling — those rely on Node/browser APIs that
// aren't available on the edge. Sentry warns at build time if this file is
// missing, so it has to exist even when we don't use edge handlers heavily.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV || "development",
});
