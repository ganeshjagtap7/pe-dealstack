// Lazy-load the two compiled Express bundles (apps/api/dist/app-lite.js and
// app-ai.js) and route incoming /api/* paths to the correct one. The dispatch
// table mirrors vercel.json's old `rewrites` block one-for-one — heavy
// AI-bound endpoints (chat, financial extraction, memos, etc.) go to app-ai;
// everything else to app-lite. The dynamic import resolves at runtime
// against apps/api/dist/, which is built by `npm run build:api` before the
// web-next build (vercel.json's buildCommand chains them in that order).

import type { ExpressHandler } from "./api-adapter";

// The path is relative from this file (apps/web-next/src/lib/api-bundles.ts):
//   ../          → apps/web-next/src/
//   ../../       → apps/web-next/
//   ../../../    → apps/
// Then into api/dist/. Verified to resolve to
// /<repo>/apps/api/dist/app-{lite,ai}.js.
const LITE_PATH = "../../../api/dist/app-lite.js";
const AI_PATH = "../../../api/dist/app-ai.js";

type BundleModule = { default: ExpressHandler } | ExpressHandler;

// Some bundlers / interop layers expose `default` as the module itself; others
// nest the export. Normalise so callers always get a plain handler.
function resolveDefault(mod: BundleModule): ExpressHandler {
  const candidate = (mod as { default?: ExpressHandler }).default ?? mod;
  return candidate as ExpressHandler;
}

let liteAppPromise: Promise<ExpressHandler> | null = null;
let aiAppPromise: Promise<ExpressHandler> | null = null;

export function getLiteApp(): Promise<ExpressHandler> {
  if (!liteAppPromise) {
    liteAppPromise = import(/* webpackIgnore: true */ LITE_PATH).then(
      (m: BundleModule) => resolveDefault(m),
    );
  }
  return liteAppPromise;
}

export function getAiApp(): Promise<ExpressHandler> {
  if (!aiAppPromise) {
    aiAppPromise = import(/* webpackIgnore: true */ AI_PATH).then(
      (m: BundleModule) => resolveDefault(m),
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
  if (pathname.startsWith("/api/memos/")) return "ai";
  if (pathname === "/api/ingest" || pathname.startsWith("/api/ingest/"))
    return "ai";
  if (pathname === "/api/onboarding" || pathname.startsWith("/api/onboarding/"))
    return "ai";
  return "lite";
}
