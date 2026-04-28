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
