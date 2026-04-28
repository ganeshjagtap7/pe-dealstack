// Catch-all Route Handler that proxies every /api/* request through one of
// the two compiled Express bundles in apps/api/dist/. This replaces the old
// Vercel standalone functions at api/index.ts and api/ai.ts — those weren't
// being deployed because vercel.json declares `framework: "nextjs"`, which
// scopes Vercel's function detection to Next.js conventions only. Wrapping
// the same Express handler inside a Next.js Route Handler is the fix.
//
// Architecture: 182 endpoints, all under /api/*. Auth is Bearer JWT via
// Express middleware — we just forward the Authorization header. Body
// parsers (express.json 50MB, multer 50–100MB on 5 upload routes) read
// directly from the request body stream we expose, so multipart uploads
// work without any special handling here.

import type { NextRequest } from "next/server";
import { proxyToExpress } from "@/lib/api-adapter";
import { getAiApp, getLiteApp, pickBundle } from "@/lib/api-bundles";

// Express needs Node primitives (Buffer, streams, fs in some middleware) so
// we pin the runtime. Vercel infers maxDuration from the highest value any
// route segment exports; 300s matches the old api/ai.ts ceiling so the
// expensive AI paths (memo generation, multi-doc ingest) don't hit a 60s
// wall. Lite paths finish in well under that.
export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const bundle = pickBundle(url.pathname);
  const app = bundle === "ai" ? await getAiApp() : await getLiteApp();
  return proxyToExpress(req, app);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
