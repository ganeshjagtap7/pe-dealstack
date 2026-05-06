// Next.js instrumentation hook. Next 16 calls register() once per runtime
// at server startup; we use it to load the matching Sentry init file. The
// dynamic import (vs a top-level import) is what keeps Node-only code out
// of the edge bundle and vice versa.
//
// Path note: this file lives at apps/web-next/src/instrumentation.ts, so
// "../sentry.server.config" resolves to apps/web-next/sentry.server.config.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Re-export Sentry's onRequestError hook so Next 16 reports React render
// errors from server components / route handlers automatically. v10 of
// @sentry/nextjs renamed the export to `captureRequestError`; Next still
// looks for `onRequestError` from the instrumentation module, so we alias.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
