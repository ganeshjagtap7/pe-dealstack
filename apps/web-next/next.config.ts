import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Map root .env vars to NEXT_PUBLIC_ so all apps share one .env
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_API_URL: process.env.VITE_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
