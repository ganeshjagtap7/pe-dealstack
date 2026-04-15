import type { NextConfig } from "next";

// Single source of truth for the API origin. All client code calls /api/* and
// Next's rewrite proxies to this URL server-side — keeping requests same-origin
// and avoiding CORS. Set API_PROXY_URL in production env; localhost is dev-only.
const API_PROXY_URL = process.env.API_PROXY_URL || "http://localhost:3001";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
