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
  // Tell Next/webpack not to try to bundle Express + its node-side deps —
  // they're full of dynamic requires and platform-specifics that don't
  // bundle cleanly. With these external, the tracer follows the imports
  // and packages the matching node_modules into the lambda automatically.
  serverExternalPackages: [
    "express",
    "helmet",
    "cors",
    "multer",
    "compression",
    "dotenv",
    "express-rate-limit",
    "@sentry/node",
    "@supabase/supabase-js",
    "@anthropic-ai/sdk",
    "openai",
    "@google/generative-ai",
    "@langchain/core",
    "@langchain/google-genai",
    "@langchain/langgraph",
    "@langchain/openai",
    "@llamaindex/cloud",
    "@azure/ai-form-recognizer",
    "apify-client",
    "csv-parse",
    "mailparser",
    "mammoth",
    "pdf-parse",
    "pino",
    "pino-pretty",
    "resend",
    "xlsx",
    "zod",
  ],
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
