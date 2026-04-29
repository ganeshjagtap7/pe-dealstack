// Lazy-load the two compiled Express bundles via plain dynamic import().
// Without /* webpackIgnore */ the tracer still follows the import path at
// build time, so apps/api/dist/* and every transitive require (express,
// helmet, supabase, sentry, ...) get packaged into the lambda. Lazy is
// required because app-lite.js / app-ai.js initialise Supabase + LLM
// clients at module load and throw if env vars are missing — running that
// during Next's page-data collection breaks the build. First request on
// the live lambda triggers the load instead, where env vars are present.

import type { ExpressHandler } from "./api-adapter";

type BundleModule = { default: ExpressHandler } | ExpressHandler;

function resolveDefault(mod: unknown): ExpressHandler {
  const candidate =
    (mod as { default?: ExpressHandler }).default ?? (mod as ExpressHandler);
  return candidate;
}

let liteAppPromise: Promise<ExpressHandler> | null = null;
let aiAppPromise: Promise<ExpressHandler> | null = null;

export function getLiteApp(): Promise<ExpressHandler> {
  if (!liteAppPromise) {
    liteAppPromise = import("../../../api/dist/app-lite.js").then(
      (m) => resolveDefault(m as BundleModule),
    );
  }
  return liteAppPromise;
}

export function getAiApp(): Promise<ExpressHandler> {
  if (!aiAppPromise) {
    aiAppPromise = import("../../../api/dist/app-ai.js").then(
      (m) => resolveDefault(m as BundleModule),
    );
  }
  return aiAppPromise;
}

// Decide which bundle handles a given pathname. Mirrors the vercel.json
// rewrite list exactly so behaviour is unchanged from the legacy standalone
// functions:
//   /api/ai/*                                              → ai
//   /api/deals/:id/{chat,generate-thesis,analyze-risks,
//                   ai-cache,conversations/*,financials*}  → ai
//   /api/documents/:id/extract-financials                  → ai
//   /api/conversations(/*)?                                → ai
//   /api/memos/*                                           → ai
//   /api/ingest(/*)?                                       → ai
//   /api/onboarding(/*)?                                   → ai
//   everything else under /api/*                           → lite
const AI_DEAL_SUFFIX_RE =
  /^\/api\/deals\/[^/]+\/(chat|generate-thesis|analyze-risks|ai-cache|conversations|financials)(\/|$)/;
const AI_DOC_EXTRACT_RE =
  /^\/api\/documents\/[^/]+\/extract-financials\/?$/;

export function pickBundle(pathname: string): "ai" | "lite" {
  if (pathname === "/api/ai" || pathname.startsWith("/api/ai/")) return "ai";
  if (AI_DEAL_SUFFIX_RE.test(pathname)) return "ai";
  if (AI_DOC_EXTRACT_RE.test(pathname)) return "ai";
  if (pathname === "/api/conversations" || pathname.startsWith("/api/conversations/"))
    return "ai";
  if (pathname === "/api/memos" || pathname.startsWith("/api/memos/")) return "ai";
  if (pathname === "/api/ingest" || pathname.startsWith("/api/ingest/"))
    return "ai";
  if (pathname === "/api/onboarding" || pathname.startsWith("/api/onboarding/"))
    return "ai";
  return "lite";
}
