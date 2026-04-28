// Lazy-load the two compiled Express bundles (apps/api/dist/app-lite.js and
// app-ai.js) and route incoming /api/* paths to the correct one. The dispatch
// table mirrors vercel.json's old `rewrites` block one-for-one — heavy
// AI-bound endpoints (chat, financial extraction, memos, etc.) go to app-ai;
// everything else to app-lite.

import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExpressHandler } from "./api-adapter";

// Resolve the dist files via an absolute path off the lambda's working
// directory. With `outputFileTracingRoot` set to the repo root in
// next.config.ts, Vercel lays the lambda out so process.cwd() === repo root,
// which means apps/api/dist/* lands at <cwd>/apps/api/dist/*. The
// `outputFileTracingIncludes` entry in next.config.ts ensures those files
// are physically packaged into the lambda (the dynamic import itself is
// invisible to Next's static tracer).
function bundlePath(name: "app-lite" | "app-ai"): string {
  return path.join(process.cwd(), "apps", "api", "dist", `${name}.js`);
}

type BundleModule = { default: ExpressHandler } | ExpressHandler;

function resolveDefault(mod: BundleModule): ExpressHandler {
  const candidate = (mod as { default?: ExpressHandler }).default ?? mod;
  return candidate as ExpressHandler;
}

let liteAppPromise: Promise<ExpressHandler> | null = null;
let aiAppPromise: Promise<ExpressHandler> | null = null;

export function getLiteApp(): Promise<ExpressHandler> {
  if (!liteAppPromise) {
    const url = pathToFileURL(bundlePath("app-lite")).href;
    liteAppPromise = import(/* webpackIgnore: true */ url).then(
      (m: BundleModule) => resolveDefault(m),
    );
  }
  return liteAppPromise;
}

export function getAiApp(): Promise<ExpressHandler> {
  if (!aiAppPromise) {
    const url = pathToFileURL(bundlePath("app-ai")).href;
    aiAppPromise = import(/* webpackIgnore: true */ url).then(
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
