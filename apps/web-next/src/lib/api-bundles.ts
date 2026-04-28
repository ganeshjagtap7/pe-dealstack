// Lazy-load the two compiled Express bundles (apps/api/dist/app-lite.js and
// app-ai.js) and route incoming /api/* paths to the correct one. The dispatch
// table mirrors vercel.json's old `rewrites` block one-for-one — heavy
// AI-bound endpoints (chat, financial extraction, memos, etc.) go to app-ai;
// everything else to app-lite.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExpressHandler } from "./api-adapter";

// Resolve the dist files at runtime. We can't use a relative-to-source path
// because Next bundles this file into .next/server/chunks/* and the relative
// path moves underneath us. Fixed anchors instead:
//   - On Vercel, cwd is the Next project root (/var/task/apps/web-next),
//     and outputFileTracingIncludes packages apps/api/dist sibling to it,
//     so ../../apps/api/dist/<name>.js resolves correctly.
//   - In local dev `npm run dev` from apps/web-next, same shape — cwd is
//     apps/web-next, repo is two ups.
//   - In local dev from the repo root, cwd is the repo, dist sits one level
//     in.
// We try each and pick the first that exists. If none, throw a diagnostic.
function bundlePath(name: "app-lite" | "app-ai"): string {
  const filename = `${name}.js`;
  const candidates = [
    path.resolve(process.cwd(), "../../apps/api/dist", filename),
    path.resolve(process.cwd(), "apps/api/dist", filename),
    path.resolve(process.cwd(), "../api/dist", filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `[api-bundles] Could not locate ${filename}. cwd=${process.cwd()}. Tried:\n  - ${candidates.join("\n  - ")}`,
  );
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
