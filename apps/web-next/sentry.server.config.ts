// Sentry Node SDK init for the Next.js server runtime (route handlers, RSC,
// middleware on Node). Loaded by src/instrumentation.ts when NEXT_RUNTIME
// === "nodejs". Server DSN is non-public — keep it out of NEXT_PUBLIC_*.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV || "development",
});
