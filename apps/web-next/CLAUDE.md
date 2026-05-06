# CLAUDE.md — `apps/web-next/`

Project-specific agent guidance for the Next.js app. Mirrors the depth of the repo-wide agent guidance but scoped to this surface. Read both — repo-wide rules still apply (file-size limits, no magic strings, conventional commits, Banker Blue `#003366` for primary buttons via inline style). The repo-wide agent guidance is loaded automatically at the start of every Claude Code session in this repo; if you're reading this outside that harness, see [`../../README.md`](../../README.md) for the equivalent context.

---

## Tech stack reminder

Next.js 16 + React 19 + Tailwind v4 are all bleeding-edge as of April 2026. Their APIs and conventions differ from older Next.js docs and from most LLM training data. **Read `node_modules/next/dist/docs/` before guessing.** Heed deprecation notices.

[`AGENTS.md`](AGENTS.md) (in this same folder) carries the same warning — leave it loaded, don't replace it.

---

## Directory map

```
apps/web-next/src/
├── app/
│   ├── (auth)/             # login, signup, verify-email, forgot-password,
│   │                       #   reset-password, accept-invite — no app chrome
│   ├── (onboarding)/       # 3-step standalone onboarding — no app chrome
│   ├── (app)/              # authenticated routes (dashboard, deals,
│   │                       #   data-room, contacts, memo-builder, templates,
│   │                       #   deal-intake, admin, settings, coming-soon)
│   ├── api/[...slug]/      # catch-all Route Handler — proxies every /api/*
│   │                       #   request to the Express bundles in apps/api/dist
│   ├── layout.tsx          # root layout
│   └── page.tsx            # marketing / landing
├── components/
│   ├── ui/                 # generic primitives
│   ├── layout/             # sidebar, header, command palette, etc.
│   ├── vdr/                # virtual data room widgets (folder tree, filters)
│   ├── deal-actions/       # buttons + modals attached to a deal
│   ├── deal-intake/        # ingest form (multipart upload)
│   └── onboarding/         # checklist, firm-focus picker, invite-team step
├── lib/
│   ├── api.ts              # api.get/post/patch/delete + NotFoundError
│   ├── api-adapter.ts      # Express ⇄ Web Response shim (proxyToExpress)
│   ├── api-bundles.ts      # picks app-lite.js vs app-ai.js by pathname
│   ├── supabase/           # browser + server + middleware Supabase clients
│   ├── vdr/                # VDR helpers (file kind, sort, filter logic)
│   ├── constants.ts        # shared constants (no magic strings)
│   ├── formatters.ts       # currency/size/date — single source of truth
│   ├── markdown.ts         # sanitised markdown rendering
│   ├── storageKeys.ts      # localStorage / sessionStorage key registry
│   ├── cn.ts               # clsx + tailwind-merge wrapper
│   └── useLiveTime.ts
├── providers/              # AuthProvider, UserProvider, ToastProvider,
│                           #   NotificationCountProvider, PresenceProvider,
│                           #   IngestDealModalProvider
├── middleware.ts           # Supabase session refresh + auth redirects
└── types/
```

**Route groups:**
- `(auth)` — unauthenticated entry points.
- `(onboarding)` — gated post-signup flow, no sidebar/header.
- `(app)` — everything else; the `(app)/layout.tsx` mounts providers, sidebar, header, presence, toasts. Add new authenticated pages here.

---

## API conventions

- **All API calls go through [`src/lib/api.ts`](src/lib/api.ts).** Use `api.get<T>(path)`, `api.post<T>(path, body)`, `api.patch<T>(path, body)`, `api.delete<T>(path)`. The wrapper:
  - Prefixes `/api` so the dev rewrite in `next.config.ts` (and the prod Route Handler) catches it.
  - Calls `supabase.auth.getUser()` first (server-validated), then reads the access token from the session and forwards it as `Authorization: Bearer <jwt>`.
  - Throws `NotFoundError` on 404 so callers can treat "endpoint not found" as an empty state instead of an error.
  - On 401 redirects to `/login`.
- **For multipart uploads** (file ingest, document upload), use `authFetchRaw(path, options)` from `src/app/(app)/deal-intake/components.tsx`. It adds the same auth header but lets you pass `FormData` as the body. Do **not** set `Content-Type` — let the browser set the multipart boundary.
- **The proxy.** `src/app/api/[...slug]/route.ts` is the single Route Handler that catches every `/api/*` request in production. It calls `pickBundle(pathname)` to choose `app-lite.js` (default) or `app-ai.js` (AI/memo/ingest/onboarding paths), then dynamic-imports the compiled bundle from `apps/api/dist/` and runs it through `proxyToExpress` in `api-adapter.ts`. In dev, `next.config.ts` rewrites `/api/*` to `http://localhost:3001` so the local API binary serves it instead.
- **Don't bypass `api.ts`.** No raw `fetch("/api/...")` in components — the auth header logic lives in one place on purpose.

---

## Auth

- Supabase (`@supabase/ssr`) — three client variants in `src/lib/supabase/` (browser, server, middleware). Use the right one for the rendering context.
- `AuthProvider` (in `src/providers/`) hydrates the user on the client and exposes `useAuth()` / related hooks.
- `middleware.ts` calls `updateSession(request)` from `src/lib/supabase/middleware.ts` on every request — refreshes the session cookie and redirects unauthenticated users away from `(app)` and `(onboarding)`.
- The API verifies the Bearer JWT via `apps/api/src/middleware/auth.ts`. The frontend never re-validates server-side — that's the API's job.

---

## Component conventions

- **File size: 500 lines max.** Same rule as the repo-wide agent guidance. The migration audit (`docs/MIGRATION-AUDIT-REPORT.md` C2) lists 13 files that already violate this — don't add to that list. Split into composable sub-modules.
- **No magic strings.** Use `lib/constants.ts` and existing helpers (`formatters.ts`, `markdown.ts`, `storageKeys.ts`).
- **Tailwind v4 + Banker Blue `#003366` for primary buttons via inline `style={{ backgroundColor: "#003366" }}`** (not a Tailwind utility). Matches the legacy app and the repo-wide style rules. The rest of the palette: white cards, Inter font, `bg-[#F8F9FA]`.
- **`cn()` from `lib/cn.ts`** for conditional class composition (clsx + tailwind-merge).
- **Sanitise HTML** with the helpers in `lib/markdown.ts` (DOMPurify wrapper). Never `dangerouslySetInnerHTML` raw user/AI output.
- **Server components are the default.** Only mark `"use client"` when you actually need client-side state, effects, or browser-only APIs (Supabase browser client, charts, etc.). Audit C5 calls out underuse — if a page is purely data-fetch + render, keep it server.

---

## Common gotchas

These are pulled directly from the migration audit. Don't reintroduce them:

- **No empty `} catch {}` blocks.** Audit C3 found 82 of these in the migrated code. Each must either log to `console.warn` with context, surface to the user via the toast provider, or use a typed `catch (err)` with explicit handling.
- **No native `alert()` / `window.confirm()`.** Audit C4 listed 14 reintroduced calls. Use the project's toast (`useToast()` from `ToastProvider`) and modal components instead.
- **Don't bundle Express.** `serverExternalPackages` in `next.config.ts` keeps Express + node-side deps external. Don't import them into client or server components — they belong in `apps/api/`, full stop.
- **Dropdown clipping.** `overflow-x-auto` on a parent will clip dropdown menus. Use `flex-wrap` instead.
- **Tailwind opacity on dark hex.** `bg-[#003366]/[0.05]` renders invisible on white. Use a neutral with `/10` (`bg-black/10`) or pick a different hex.
- **Dev port collisions.** This app owns `:3002`, the API owns `:3001`, the legacy `apps/web` owns `:3003`, and `:3000` is reserved for the main-branch worktree's legacy Vite app. If `:3002` is taken, Next picks another free port and may collide with the API. Kill stale processes first.
- **`outputFileTracingRoot` is required.** npm workspaces hoist `node_modules` to the repo root. Without this, the lambda misses `next/dist/compiled/*` and breaks. Don't remove it.

---

## Web-next parity rule

When porting a screen or feature from `apps/web/` (legacy vanilla JS), **replicate the FULL feature**. Cross-check the original HTML page **and** every JS module it loads. Several migrations shipped a simpler version that silently dropped buttons, modals, or filters — the audit (`docs/MIGRATION-AUDIT-REPORT.md` Section A) tracks the gaps. Pages to be especially careful with: deal full-screen view, doc preview, share modal, global search, contacts CSV import, admin views.

---

## Type-checking + tests

```bash
cd apps/web-next
npx tsc --noEmit       # type-check (must pass before merge)
npm test               # vitest run
npm run test:watch     # vitest watch
npm run lint
```

Run from the repo root if you'd rather use Turborepo: `npm run dev:web-next`, `npm run build`, etc.

---

## When in doubt

1. Read [`AGENTS.md`](AGENTS.md) and the relevant guide in `node_modules/next/dist/docs/`.
2. Re-read the repo-wide agent guidance (loaded automatically by the Claude Code harness) — it still applies.
3. Read [`../../docs/MIGRATION-AUDIT-REPORT.md`](../../docs/MIGRATION-AUDIT-REPORT.md) — most "should I do X?" questions are already answered there.
4. Check the legacy implementation in `apps/web/` if you're porting something — parity matters.
