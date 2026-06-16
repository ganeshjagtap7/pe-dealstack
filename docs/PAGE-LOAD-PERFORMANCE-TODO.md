# Page-Load Performance — Developer Action Items

**Owner:** _(assign)_
**Branch / PR:** `perf/page-load-speed`
**Created:** 2026-06-16
**Goal:** Make navigation between pages in the **deployed** (`apps/web-next`, Vercel) product feel fast — target sub-second perceived page transitions for authenticated users.

---

## TL;DR

Slow page-to-page navigation in production is caused by **stacked, sequential network round-trips on every navigation**, an **uncached/force-dynamic render path**, a **heavy cold-starting API lambda**, and a **fetch-on-mount data pattern** that shows a spinner before any data loads.

This PR already lands the two **safe, high-impact** fixes (Phase 0 below). The rest of this document is the roadmap for the developer to finish the job. Do the phases in order; **measure before and after each phase** so we can prove the wins.

---

## Background — the slow chain (read this first)

On a single authenticated page navigation in production today, the request path was:

1. **Middleware `getUser()`** — network round-trip to Supabase auth servers, ran on *every* request including every `/api/*` call. `src/lib/supabase/middleware.ts`
2. **`force-dynamic` render** — nothing cached/prerendered. `src/app/(app)/layout.tsx`
3. **Page mounts as a client component** → shows `Loading...` spinner → *then* starts fetching. 152 `"use client"` pages.
4. **Each API call does another `getUser()`** before reading the token. `src/lib/api.ts` → `getAuthHeaders()`
5. **API cold start** — one catch-all lambda bundling LangChain + OpenAI + Anthropic + Azure + xlsx + pdf-parse, slow first response after idle. `vercel.json`, `apps/web-next/src/app/api/[...slug]/route.ts`

Net: ~3 sequential auth round-trips + uncached render + possible cold start per navigation.

---

## Phase 0 — DONE in this PR (baseline wins, low risk)

> These are already committed. Listed so reviewers/devs understand the starting point.

- [x] **Remove redundant `getUser()` from `getAuthHeaders()`** — `src/lib/api.ts`. Now uses `getSession()` (local read) only. The API re-validates the JWT server-side, so client-side re-validation was pure waste. Removes one network round-trip from **every** `api.get/post/patch/delete`.
- [x] **Stop the auth middleware running on `/api/*`, static assets, and public pages** — `src/middleware.ts` (narrowed matcher) + `src/lib/supabase/middleware.ts` (early-return for non-auth routes). `getUser()` (with token refresh) still runs on real app-route navigations and on `/login`+`/signup`. Removes a network round-trip from every API call and every marketing/legal page.

**Why these are safe:** security is unchanged — the API still verifies every Bearer JWT in `apps/api/src/middleware/auth.ts`. Token refresh is preserved for the routes that gate on it.

**Verify Phase 0:**
```bash
cd apps/web-next
npx tsc --noEmit      # clean
npm test              # all pass
npm run lint
```

---

## Phase 1 — Measure the baseline (do this BEFORE the lifts below)

We need numbers to prove each phase helps and to avoid guessing.

- [ ] Enable **Vercel Speed Insights** (or Web Vitals) on the project if not already on. Record **p75 TTFB, FCP, LCP, INP** on `/dashboard`, `/deals`, `/contacts`.
- [ ] In Chrome DevTools → Network, capture a **warm** and a **cold** navigation between `/dashboard` ↔ `/deals`. Note: time to first byte, time to first contentful paint, time until data renders.
- [ ] Measure **API cold start**: hit an `/api/*` endpoint after ~15 min idle; record total time vs a warm call. Check the Vercel function logs for `Init Duration`.
- [ ] Write the baseline numbers into this doc (table below) so after-numbers are comparable.

| Metric | Baseline (p75) | After Phase 2 | After Phase 3 | Target |
|---|---|---|---|---|
| Dashboard TTFB | | | | < 500ms |
| Deals nav → data visible | | | | < 1s |
| API cold start (Init Duration) | | | | < 1.5s |
| Largest JS route bundle | | | | < 250KB gz |

---

## Phase 2 — Cut API cold starts (high impact on first-load)

**Problem:** the single catch-all API function bundles every heavy dependency, so the lambda is large and cold-starts slowly. See `serverExternalPackages` in `next.config.ts` and the bundle picker in `src/lib/api-bundles.ts` (`app-lite.js` vs `app-ai.js`).

- [ ] **Audit what's in the "lite" bundle.** Confirm `pickBundle()` routes non-AI traffic (deals, contacts, dashboard, auth) to `app-lite.js` and that `app-lite.js` does **not** transitively import LangChain/OpenAI/Anthropic/Azure/xlsx/pdf-parse. Build the API and inspect bundle sizes:
  ```bash
  npm run build:api
  ls -la apps/api/dist/   # compare app-lite vs app-ai sizes
  ```
- [ ] **Lazy-import heavy deps** inside the route handlers that actually use them (dynamic `await import(...)`), not at module top-level, so they don't load on cold start of unrelated routes.
- [ ] **Right-size the function.** In `vercel.json` the AI function has `memory: 1769`. Check whether the lite/common path needs that much; smaller memory can cold-start faster (test both — more memory = more CPU on Vercel, so measure, don't assume).
- [ ] **Consider keeping the hot function warm** (Vercel Fluid Compute / a cron ping to a cheap health endpoint every few minutes) **only if** measured cold starts are a real user problem after the bundle split.
- [ ] Re-measure API cold start and fill in the table.

**Acceptance:** non-AI API routes cold-start meaningfully faster (target Init Duration < 1.5s) and warm calls are unaffected.

---

## Phase 3 — Fix the fetch-on-mount pattern (biggest perceived-speed win)

**Problem:** pages are client components that mount, show a spinner, then fetch. Navigation feels like "blank → spinner → content" instead of "instant".

Pick **one** consistent approach (recommend **A** for hot pages, **B** everywhere else):

- [ ] **A — Server-render initial data for hot pages.** Move the first data fetch for `/dashboard` and `/deals` into a Server Component (or a route-level `loadData()` awaited in the server page) so the HTML arrives with data. Keep interactivity in child client components. See `apps/web-next/CLAUDE.md` → "Server components are the default."
- [ ] **B — Add a client cache (SWR or React Query).** Wrap `api.ts` calls so revisiting a page shows **cached data instantly** then revalidates in the background. This kills the spinner on repeat navigations. Centralize in a hook (e.g. `useApi`) so all 150+ pages benefit without rewrites.
- [ ] **Skeletons, not spinners.** Replace the generic spinner (`src/app/(app)/loading.tsx`) and per-page loading states with **layout-shaped skeletons** so the page feels populated immediately. Add `loading.tsx` to the busiest route segments (`/dashboard`, `/deals`, `/contacts`, `/data-room`).
- [ ] **Confirm `<Link>` prefetch is on.** App-router `<Link>` prefetches by default — grep for `prefetch={false}` and remove unless intentional. Prefetching warms the next route while the user hovers.

**Acceptance:** repeat navigation between two visited pages shows content with **no full-screen spinner**; first-visit shows a layout skeleton, not a blank spinner.

---

## Phase 4 — Client bundle size

**Problem:** 152 client components; heavy libs may ship on routes that don't need them.

- [ ] Run the production build and read the per-route JS sizes:
  ```bash
  cd apps/web-next && npm run build   # check the route table in output
  ```
  Optionally add `@next/bundle-analyzer` temporarily to visualize.
- [ ] **Dynamic-import heavy, rarely-used libs:** `chart.js` / `react-chartjs-2` (only on pages with charts) and `html2pdf.js` (only when the user exports a PDF). Use `next/dynamic` with `{ ssr: false }` for these.
- [ ] Look for accidental barrel-import bloat (importing a whole module for one helper).

**Acceptance:** largest route JS bundle < ~250KB gzipped; charts/PDF libs no longer in the shared/common chunk.

---

## Phase 5 — Static-render the marketing/public pages

**Problem:** the marketing/legal/docs pages (`/`, `/pricing`, `/security`, `/privacy-policy`, etc.) don't need per-request rendering.

- [ ] Confirm these routes are **statically rendered / ISR**, not dynamic. They should not inherit `force-dynamic`. (`force-dynamic` belongs only on `(app)`/`(auth)` where auth state is per-request — see the comment in `src/app/(app)/layout.tsx`.)
- [ ] Verify the security headers from `next.config.ts` still apply to the static pages.

**Acceptance:** public pages serve from cache/CDN with TTFB dominated by network, not compute.

---

## Phase 6 — OPTIONAL: local JWT verification in middleware

**Only if** middleware auth latency is still significant after Phases 2–3.

- Supabase `getClaims()` can verify the JWT **locally** (no network) — *but only when the project uses asymmetric signing keys*, and it does **not** refresh expiring tokens (plain `getClaims()` would bounce users to `/login` when their hourly access token expires).
- [ ] If pursued: (1) migrate the Supabase project to asymmetric JWT signing keys, (2) use `getClaims()` for the gate decision, (3) **add an explicit token-refresh path** (call `getUser()`/`refreshSession()` when the token is near expiry) so sessions don't drop. Document and test the expiry case thoroughly.

> Deliberately **not** done in Phase 0 because of the refresh regression risk. Treat as a separate, carefully-tested change.

---

## Out of scope / don't do

- Don't fold this into the security branch (`fix/security-phase1-p0`) — keep perf isolated.
- Don't remove `outputFileTracingRoot` or the `serverExternalPackages` list in `next.config.ts` (breaks the lambda — see `apps/web-next/CLAUDE.md`).
- Don't switch middleware to `getSession()`-only for the **gate** decision (it doesn't validate server-side) — the gate must keep `getUser()` or a verified `getClaims()`.

---

## Definition of done

- [ ] Phases 1–5 complete with before/after numbers filled into the Phase 1 table.
- [ ] p75 dashboard navigation feels < 1s on a warm session; no full-screen spinner on repeat nav.
- [ ] `npx tsc --noEmit`, `npm test`, `npm run lint` all clean in `apps/web-next`.
- [ ] `npm run build` succeeds and route bundle sizes are within target.
- [ ] PR description summarizes the measured improvement.
