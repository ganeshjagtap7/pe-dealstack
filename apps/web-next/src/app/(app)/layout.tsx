import AppClientLayout from "./client-layout";

// Auth-required pages are inherently dynamic (cookies/auth lookup per request).
// Force-dynamic prevents Next from attempting build-time prerender — which
// would invoke the Supabase factory chain through the AuthProvider before env
// vars are bound (the CI build was crashing on /coming-soon, /admin, etc.
// because of this).
//
// CRITICAL: this server-component shell is what carries the `dynamic` route
// segment config. Route-segment exports only work in SERVER components — when
// they were on the previous client-side layout they were silently ignored.
// This file exists solely so `dynamic = "force-dynamic"` is honoured; all
// real layout logic lives in client-layout.tsx.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppClientLayout>{children}</AppClientLayout>;
}
