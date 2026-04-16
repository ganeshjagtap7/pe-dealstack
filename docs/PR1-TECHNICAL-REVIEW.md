# PR #1 Technical Review — `feat(web-next): scaffold Next.js app + dev fixes`

**Reviewer:** Ganesh Jagtap (Tech Lead)
**Date:** 2026-04-16
**Branch:** `frontend/dev` → `main`
**Author:** Aditya Negi

---

## Status: Changes Requested

Good foundation work on the Next.js migration, Aditya. The project setup, auth middleware, and design system are solid. However, there are several issues that need to be addressed before this can be merged. I've categorized everything by priority — start with Critical and work down.

---

## 🔴 CRITICAL — Must Fix Before Next Review

### 1. Vercel Preview Completely Broken (API Proxy)
**Every API call returns 500** on the Vercel preview because `API_PROXY_URL` is not set in Vercel environment variables. The `next.config.ts` falls back to `http://localhost:3001` which doesn't exist on Vercel.

**What's broken:** Dashboard tasks, deal chat, AI Meeting Prep, AI Email Drafter, admin actions, contact interactions — essentially everything.

**Fix:** Add `API_PROXY_URL` to Vercel env vars pointing to the production API origin. Then redeploy and verify all features work.

### 2. XSS Vulnerability in Markdown Renderer
**File:** `src/lib/markdown.ts:11`
```ts
if (trimmed.startsWith("<")) return text; // Already HTML — pass through.
```
This bypasses HTML escaping entirely. If an AI response starts with `<script>` or `<img onerror=...>`, it executes arbitrary JavaScript in the user's browser via `dangerouslySetInnerHTML` in memo-builder.

**Fix:** Remove this passthrough line. If you need to render trusted HTML from the server, use DOMPurify to sanitize it first.

### 3. `getSession()` vs `getUser()` in AuthProvider
**File:** `src/providers/AuthProvider.tsx`

You correctly use `getUser()` in the middleware (which validates with the Supabase server), but the AuthProvider uses `getSession()` which only reads from local storage — it's not guaranteed to be valid. Supabase docs explicitly warn about this.

**Fix:** Change the initial auth check to use `getUser()`, or at minimum validate the session after reading it.

---

## 🟡 MAJOR — Must Fix Before Merge

### 4. Six Files Exceed 500-Line Limit
Our coding standard (CLAUDE.md) says max 500 lines per file. These need splitting:

| File | Lines | How to Split |
|------|-------|-------------|
| `deals/[id]/page.tsx` | **1064** | Extract: DealHeader, DealChat, DealDocuments, DealActivity, StageModal |
| `deal-intake/page.tsx` | **769** | Extract each form step into its own component |
| `memo-builder/page.tsx` | **768** | Extract: MemoChat, MemoSidebar, MemoEditor |
| `settings/page.tsx` | **589** | Extract ProfileSection (you already split Preferences/Security — do the same for Profile) |
| `dashboard/page.tsx` | **569** | Extract: StatsCards, PortfolioChart, ActivityFeed, MarketSentiment |
| `admin/modals.tsx` | **564** | One file per modal: AssignDealModal, CreateTaskModal, ScheduleReviewModal, SendReminderModal |

**Why this matters:** The deal detail page will grow to 2000+ lines when we migrate the financials module. It needs to be composable now.

### 5. No `error.tsx` or `loading.tsx` Files
Zero error boundaries or loading states at the route level. This means:
- Any uncaught JS error → **white screen**, no recovery
- No streaming SSR feedback during navigation
- 19 different hand-rolled loading spinner implementations

**Fix:** Add at minimum:
- `src/app/(app)/error.tsx` — catches errors in all app pages
- `src/app/(app)/loading.tsx` — shows skeleton/spinner during route transitions
- `src/app/error.tsx` — global fallback

### 6. Native `alert()` / `window.confirm()` Still Used
We fixed this in Session 48 for the vanilla app. The Next.js app reintroduces them:
- `contacts/page.tsx` — **5 uses** of `alert()`
- `admin/TaskTable.tsx` — `window.confirm()` for delete
- `data-room/[dealId]/page.tsx` — 2 uses of `window.confirm()`
- `settings/page.tsx` — 2 uses of `window.confirm()`

**Fix:** Use the same ConfirmDialog/Toast pattern from the vanilla app, or build a shared `components/ui/ConfirmDialog.tsx`.

### 7. Auth Route Bypass with `startsWith`
**File:** `src/lib/supabase/routing.ts`

The routing classifier uses `startsWith` for auth prefixes, so `/logindata` or `/signupfoo` would bypass auth. Your own test file documents this limitation.

**Fix:** Check for exact match or ensure the prefix is followed by `/` or end-of-string:
```ts
AUTH_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"))
```

---

## 🟠 IMPORTANT — Fix in Next Iteration

### 8. Zero Server Components — Not Using Next.js Properly
Every page is `"use client"`. This means the app is essentially a React SPA with file-based routing — we're not getting any Next.js benefits (SSR, streaming, smaller client bundles).

**Pages that should be partially server-rendered:**
- Dashboard (stats cards, activity feed)
- Deals list (initial data load)
- Contacts list
- Data room folder tree
- Admin team/task data

**Approach:** Use the server component as the page, fetch data there, pass to client sub-components that need interactivity. Look into React Server Components patterns.

### 9. No Data Caching / Fetching Library
There's no SWR, React Query, or TanStack Query. Every page navigation re-fetches everything from scratch. The deals list re-fetches 50 deals on every filter change.

**Impact:** Slow-feeling navigation, unnecessary API load, no optimistic updates.

**Recommendation:** Add `@tanstack/react-query` or `swr`. This gives you:
- Automatic caching + revalidation
- Request deduplication (multiple components need the same data)
- Optimistic updates for mutations
- Built-in loading/error states

### 10. Zero AbortController Usage — Race Conditions
Not a single `AbortController` in 15,158 lines. Every async fetch can:
- Complete after the user navigates away (state update on unmounted component)
- Stack up when rapidly switching tabs/filters
- Return stale data that overwrites newer data

**Example race condition** in `deals/[id]/page.tsx:174`:
```ts
useEffect(() => {
  if (activeTab === "Activity") loadActivities();
  if (activeTab === "Chat") loadChatHistory();
}, [activeTab, ...]);
```
Rapidly switching tabs fires multiple fetches — older responses can overwrite newer ones.

### 11. 22 Empty `catch {}` Blocks — Silent Failures
These hide real bugs from users AND from us. When the API proxy failed in preview, users got zero feedback because errors were silently swallowed.

**Worst offenders:**
- `deals/[id]/page.tsx` — 5 empty catches
- `memo-builder/page.tsx` — 3 empty catches

**Fix:** At minimum, log to console.warn. Better: show a toast notification so users know something went wrong.

### 12. No Shared UI Component Library
There's no `components/ui/` directory. Every page re-implements:
- Buttons (inline styles scattered across 19 pages)
- Modals (admin has Modal.tsx, but other pages roll their own)
- Loading spinners (8+ different implementations)
- Toast/error notifications (4 different patterns)
- Empty states, status badges, form inputs

**Fix:** Create `components/ui/` with: Button, Modal, ConfirmDialog, Toast, Spinner, Badge, Card, EmptyState. Then refactor pages to use them.

### 13. Duplicate Type Definitions
Despite having `types/index.ts`, pages define their own interfaces:
- `dashboard/page.tsx` — defines `Deal`, `Task`, `MarketSentiment`
- `deals/[id]/page.tsx` — defines `DealDetail`, `DocItem`, `TeamMember`, `ChatMessage`, `Activity`
- `admin/types.ts` — defines its own `Task`, `TeamMember`, `Deal`

Same entity, different shapes. When the API changes, some pages will break and others won't.

**Fix:** Define all types in `types/` and import everywhere.

---

## 🔵 MINOR — Nice to Have

### 14. Missing Security Headers
`next.config.ts` has no security headers. Add:
```ts
async headers() {
  return [{ source: "/(.*)", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ]}];
}
```

### 15. No Focus Trap in Modals
The Admin Modal has Escape key handling but no focus trap. Tab key lets users escape the modal into background content. Add `role="dialog"` and `aria-modal="true"`, and trap focus within.

### 16. `fetchUser` Not Wrapped in `useCallback`
In UserProvider.tsx, `fetchUser` is defined as a plain function and passed as `refetch` in context — the reference changes every render.

### 17. CORS Allowlist Includes API's Own Port
`apps/api/src/app.ts` — Adding `http://localhost:3001` to CORS origins is the API allowing requests from itself. Remove it.

### 18. File Upload Has No Client-Side Validation
`deals/[id]/page.tsx` — No file type or size checks before uploading. Add client-side validation for early rejection and better UX.

### 19. Tailwind CDN Warning in Production
Console shows: `cdn.tailwindcss.com should not be used in production`. Some component or page is loading Tailwind via CDN script tag instead of the PostCSS build pipeline.

### 20. Error Messages Show `[object Object]`
AI Meeting Prep and Email Drafter show `[object Object]` to users when they fail. Parse the error properly before displaying.

---

## ✅ What's Done Well

- **API proxy pattern** — `/api` rewrite eliminates CORS. Smart architectural decision.
- **Auth middleware** — Supabase SSR done correctly. Routing classifier with 10 unit tests is solid.
- **Design system** — Tailwind v4 `@theme inline` with proper PE OS color variables.
- **Stable Supabase client** — `useState(() => createClient())` prevents re-creation.
- **UserProvider refresh guard** — `lastUserIdRef` skips re-fetch on silent token refresh.
- **HTML escaping** — Both `dangerouslySetInnerHTML` usages properly escape (except markdown passthrough).
- **View Transitions** — Progressive enhancement with `@supports` guard.
- **Color refactor** — Fixed `#1269e2` → `#003366` across all vanilla pages.
- **19/29 pages migrated** — All core app flows covered.
- **Signup validation** — Password strength meter, match indicator, all checks present.

---

## Migration Coverage

**Migrated (19):** Dashboard, Deals (list + detail), Contacts, Admin, Settings, Data Room (list + detail), Memo Builder, Deal Intake, Templates, Coming Soon, Login, Signup, Forgot Password, Reset Password, Verify Email, Accept Invite, Landing Page

**Not Yet Migrated (10):** Pricing, Documentation, API Reference, Help Center, Resources, Solutions, Company, Privacy Policy, Terms of Service, Landing Page (duplicate)

**Critical Missing Feature:** Financial Statements module (~2000 lines across 5 vanilla JS files) — this is our core AI feature and the hardest to migrate.

---

## Recommended Order of Work

1. Set `API_PROXY_URL` in Vercel → redeploy → verify everything works
2. Fix markdown XSS
3. Fix AuthProvider `getSession()` → `getUser()`
4. Add `error.tsx` + `loading.tsx`
5. Split the 6 oversized files
6. Replace all `alert()` / `window.confirm()` with proper UI
7. Fix auth route `startsWith` bypass
8. Resolve `package-lock.json` merge conflict with main
9. Retest on Vercel preview → request re-review

---

## Scorecard

| Area | Score | Notes |
|------|:---:|---|
| Project Setup | 8/10 | Monorepo, proxy, turbo — clean |
| Auth & Middleware | 8/10 | Solid Supabase SSR, tested |
| Design System | 7/10 | Proper theme vars |
| Security | 6/10 | XSS in markdown |
| React Patterns | 4/10 | No cancellation, silent errors |
| Component Architecture | 3/10 | Monolith pages, no shared UI |
| Next.js Utilization | 3/10 | All client-side |
| Accessibility | 4/10 | Missing focus traps, native alerts |
| Test Coverage | 2/10 | Only 10 routing tests |
| **Overall** | **5/10** | **Solid beta foundation, not production-ready yet** |

Good start — let's get it to 7+/10 before merge.

— Ganesh
