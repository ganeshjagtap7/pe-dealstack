import path from "node:path";
import type { NextConfig } from "next";

// Dev-only proxy: forward /api/* to the local Express API on :3001 so client
// fetches stay same-origin. In prod on Vercel the API is co-located as a
// Vercel Function (api/index.ts) and reached via vercel.json rewrites — no
// Next.js rewrite needed. Pointing this at the same Vercel domain triggers
// DNS_HOSTNAME_RESOLVED_PRIVATE (Vercel blocks self-loops) and 404s /api/*.
const nextConfig: NextConfig = {
  // npm workspaces hoist node_modules to the repo root. Without this, Next's
  // file tracer scopes to apps/web-next/ and misses next/dist/compiled/* on
  // Vercel, breaking the lambda packaging step (ENOENT on @opentelemetry/api).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // The /api catch-all dynamically imports apps/api/dist/{app-lite,app-ai}.js
  // at runtime via pathToFileURL+webpackIgnore so Next's static tracer never
  // sees the import. Force-include the dist files (and the Express deps that
  // back them) so they end up physically packaged in the lambda.
  outputFileTracingIncludes: {
    "/api/[[...slug]]": [
      "../api/dist/**/*",
      "../../node_modules/express/**",
      "../../node_modules/helmet/**",
      "../../node_modules/cors/**",
      "../../node_modules/multer/**",
      "../../node_modules/express-rate-limit/**",
      "../../node_modules/compression/**",
      "../../node_modules/dotenv/**",
      "../../node_modules/@sentry/node/**",
      "../../node_modules/@supabase/supabase-js/**",
      "../../node_modules/@anthropic-ai/sdk/**",
      "../../node_modules/openai/**",
      "../../node_modules/@google/generative-ai/**",
      "../../node_modules/@langchain/**",
      "../../node_modules/@llamaindex/cloud/**",
      "../../node_modules/@azure/ai-form-recognizer/**",
      "../../node_modules/apify-client/**",
      "../../node_modules/csv-parse/**",
      "../../node_modules/mailparser/**",
      "../../node_modules/mammoth/**",
      "../../node_modules/pdf-parse/**",
      "../../node_modules/pino/**",
      "../../node_modules/pino-pretty/**",
      "../../node_modules/resend/**",
      "../../node_modules/xlsx/**",
      "../../node_modules/zod/**",
    ],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    const apiProxy = process.env.API_PROXY_URL ?? "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxy}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
