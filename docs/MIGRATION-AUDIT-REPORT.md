# Migration Audit Report — Vanilla JS → Next.js

**Author:** Ganesh Jagtap (Tech Lead)
**Date:** 2026-04-29
**Subject:** Frontend migration completeness assessment — `apps/web` → `apps/web-next`
**Status:** **MIGRATION INCOMPLETE — Action Required**

---

## Executive Summary

The Next.js migration was merged to `main` on 2026-04-28 (PR #1 + follow-up cleanup PRs). Production traffic now flows through `apps/web-next`. Functionally, the new app works.

**However, the migration is not "done."** It was declared complete prematurely. A senior engineering review of the merged state surfaces **23 outstanding items** that must be addressed before this can be considered shipped, including:

- The legacy `apps/web/` directory (7.8 MB, 135 files) is still in the repository, partially referenced by build scripts, and contains 16 pages that were never ported.
- There is **zero CI/CD pipeline** in this repository — no automated tests, no build verification, no lint enforcement on PRs.
- Production error monitoring (**Sentry**) was lost in the migration and has not been re-instrumented.
- The new app has **1 test file** for 36,047 lines of TypeScript/React code (~0.0001% test coverage).
- Documentation files in the new app are **placeholder text** (`README.md` is the `create-next-app` default; `CLAUDE.md` literally says "test").
- 13 files violate our 500-line file-size standard, with two new files at >1000 lines.

This document inventories every outstanding item with file references, prioritizes them by severity, and assigns ownership. **Phase 1 (cleanup of legacy code) is non-negotiable and must be completed within 5 business days.**

---

## Section A — Migration Coverage Gaps

### A1. Legacy Pages That Were Never Ported (16 pages)

The following HTML pages exist in `apps/web/` but have **no equivalent** in `apps/web-next/`:

| Page | Type | Decision Required |
|------|------|-------------------|
| `index.html` | Marketing/Home | Migrate or remove |
| `landingpage.html` | Marketing | Likely duplicate of index — remove |
| `pricing.html` | Marketing | Migrate to Next.js (SEO-critical) |
| `documentation.html` | Marketing | Migrate or move to docs site |
| `api-reference.html` | Marketing | Migrate or move to docs site |
| `solutions.html` | Marketing | Migrate or remove |
| `resources.html` | Marketing | Migrate or remove |
| `company.html` | Marketing | Migrate or remove |
| `help-center.html` | Marketing | Migrate or remove |
| `privacy-policy.html` | Legal | **Must migrate** — required for production |
| `terms-of-service.html` | Legal | **Must migrate** — required for production |
| `admin-dashboard.html` | App | Confirm `/admin` covers all functionality, then delete |
| `crm.html` | App | Confirm `/contacts` covers it, then delete |
| `crm-dynamic.html` | App | Confirm `/deals` covers it, then delete |
| `deal.html` | App | Confirm `/deals/[id]` covers it, then delete |
| `vdr.html` | App | Confirm `/data-room` covers it, then delete |

### A2. Production Observability Lost — Sentry Not Migrated

The vanilla app had Sentry error tracking initialized on every HTML page:

- File: `apps/web/login.html` (and 25 other HTML files)
- DSN: `https://a440d07ec7cf49304b1b3f7362ff7030@o4510874560233472.ingest.us.sentry.io/4510874637303808`

The new Next.js app has **no Sentry integration**:
- `apps/web-next/package.json` does not include `@sentry/nextjs`
- No `Sentry.init()` calls anywhere in `apps/web-next/src/`

**Impact:** We have no production error monitoring on the live site since the migration cut over. Any user-facing crashes are invisible.

**Required:** Install `@sentry/nextjs`, configure `sentry.client.config.ts` and `sentry.server.config.ts`, verify events flow to the existing Sentry project.

### A3. Features Where Migration Status Is Unclear

The following legacy modules show **zero references** in the new app — needs explicit verification that the feature was rebuilt under a different name, or admit it is missing:

| Legacy file | Lines | References in `web-next/src/` |
|-------------|------:|:-:|
| `apps/web/js/dealFullscreen.js` | 176 | **0** |
| `apps/web/js/docPreview.js` | 543 | **0** |
| `apps/web/js/shareModal.js` | 400 | **0** |
| `apps/web/js/globalSearch.js` | ? | **0** |

**Action:** Aditya must confirm in writing whether each of these was migrated (and where) or is missing from the new app.

---

## Section B — Repository Hygiene & Cleanup

### B1. The Legacy `apps/web/` Directory Is Still Live in the Workspace

| Metric | Value |
|--------|------:|
| Disk size | **7.8 MB** |
| Source files (.html / .js / .css) | **135** |
| Workspace name | `@ai-crm/web` (in `apps/*` workspaces glob) |
| Vercel deployment | Not deployed (root `vercel.json` points to `web-next`) |

**Status:** Dead code occupying 7.8MB of repo space and adding cognitive load for every developer browsing the codebase.

**Required:** Delete the entire `apps/web/` directory (after Section A is resolved).

### B2. Stale Build Scripts in Root `package.json`

Three scripts still reference the deleted-in-spirit legacy app:

```json
"build:web": "npm run build --workspace=@ai-crm/web",
"build:prod": "npm run build:web && npm run build:api",
"dev:web": "npm run dev --workspace=@ai-crm/web"
```

**Required:** Remove `build:web`, `dev:web`. Update `build:prod` to use the Next.js workspace, or remove it entirely.

### B3. Build Artifacts Tracked Outside `.gitignore`

`apps/web/dist/` exists on disk at 2.6 MB. While not committed (verified via `git ls-files`), the directory has no project-level `.gitignore` enforcement and will reappear on every legacy build. Becomes irrelevant once Section B1 is complete.

### B4. Stale Cross-Reference Comment in API Code

File: `apps/api/src/services/dealImportMapper.ts`
```ts
// SYNC: Transform logic duplicated in apps/web/js/deal-import.js — keep both in sync
```
The vanilla file is going away. This comment will become misleading the moment Section B1 completes.

**Required:** Update the comment to reference the new file path (`apps/web-next/src/.../deal-import.tsx`) or delete it entirely.

### B5. Redundant Vercel Project

There are currently **two** Vercel projects deploying the same application:
- `pe-dealstack` (root config now serves Next.js — current production)
- `pe-dealstack-nextjs` (separate project, also serves Next.js)

**Required:** Delete `pe-dealstack-nextjs`. One production target only. Eliminates confusion about which preview URL to test.

---

## Section C — Code Quality Inside the New `apps/web-next/`

### C1. Documentation Is Placeholder / Boilerplate

| File | Current State | Issue |
|------|---------------|-------|
| `apps/web-next/README.md` | Default `create-next-app` template | Reads "This is a Next.js project bootstrapped with create-next-app" — no project context |
| `apps/web-next/CLAUDE.md` | Contains literal text "test" | No agent instructions, no architecture notes |
| `apps/web-next/AGENTS.md` | Generic Next.js 16 warning | No project-specific guidance |

**Required:** Replace `README.md` with actual project documentation (setup, env vars, architecture, deploy). Replace `CLAUDE.md` with project-specific agent context matching the depth of the root `CLAUDE.md`.

### C2. File-Size Rule Violations (13 Files)

Project standard from `CLAUDE.md`: **Keep files under 500 lines.** The migration introduced these violations:

| Lines | File |
|------:|------|
| **1067** | `apps/web-next/src/app/(app)/deals/[id]/deal-financials.tsx` |
| **1049** | `apps/web-next/src/app/(app)/deals/[id]/deal-analysis-panels.tsx` |
| **886**  | `apps/web-next/src/app/(app)/deals/[id]/page.tsx` |
| **738**  | `apps/web-next/src/app/(app)/deals/page.tsx` |
| **704**  | `apps/web-next/src/app/(app)/data-room/[dealId]/page.tsx` |
| **679**  | `apps/web-next/src/app/(app)/deals/components.tsx` |
| **610**  | `apps/web-next/src/app/(app)/memo-builder/page.tsx` |
| **602**  | `apps/web-next/src/app/(app)/dashboard/page.tsx` |
| **580**  | `apps/web-next/src/app/(app)/contacts/page.tsx` |
| **569**  | `apps/web-next/src/components/layout/CommandPalette.tsx` |
| **561**  | `apps/web-next/src/app/(app)/deals/[id]/deal-tabs.tsx` |
| **531**  | `apps/web-next/src/app/(app)/dashboard/widgets/customize-modal.tsx` |
| **505**  | `apps/web-next/src/app/(app)/admin/TaskTable.tsx` |

**Required:** All 13 files split into composable sub-modules, each under 500 lines.

### C3. Silent Error Handling — 82 Empty `catch {}` Blocks

Across the codebase, **82** instances of `} catch {}` swallow errors with no logging, no telemetry, no user feedback. This pattern made debugging the production 500 errors during the Vercel-preview testing phase nearly impossible.

**Required:** Audit every empty catch block. Each must either:
1. Log to console.warn with context, or
2. Surface the error to the user via toast/notification, or
3. Be replaced with a typed `catch (err)` that handles the case explicitly.

### C4. Native `alert()` / `window.confirm()` — 14 Instances

Despite this being a known anti-pattern in our codebase (fixed in the vanilla app in Session 48), the migration reintroduced them in:
- `apps/web-next/src/app/(app)/contacts/csv-import-modal.tsx`
- `apps/web-next/src/app/(app)/contacts/detail-modals.tsx`
- `apps/web-next/src/app/(app)/contacts/detail-panel.tsx`
- `apps/web-next/src/app/(app)/contacts/page.tsx`
- `apps/web-next/src/app/(app)/deals/[id]/page.tsx`
- `apps/web-next/src/app/(auth)/login/page.tsx`

**Required:** Replace all 14 instances with the project's existing modal/toast UI components.

### C5. Server Components Underutilized

Of 24 page/layout files, **20 are client components** (`"use client"`). Only 4 use server-side rendering. The migration ported the vanilla SPA pattern verbatim instead of leveraging Next.js App Router's primary value proposition (server components, streaming, smaller client bundles).

**Required:** Audit all 20 client pages. For each, identify which sections genuinely need client interactivity vs. which can be server components. At minimum, the data-fetching pages (dashboard, deals list, contacts list, admin) should have a server-side data layer with client islands for interaction.

### C6. Production-Code TODOs Shipped to Main

```
apps/web-next/src/app/(app)/deals/[id]/components.tsx:67 — TODO(presence): wire to a real /api/presence
apps/web-next/src/app/(app)/deals/[id]/deal-panels.tsx:109 — TODO(presence): once a backend /presence endpoint is live
apps/web-next/src/providers/PresenceProvider.tsx:25 — TODO(presence): replace fetchPresence() with...
apps/web-next/src/providers/PresenceProvider.tsx:65 — TODO(presence): wire up backend
```

The "Team Activity" / online-presence feature is **stubbed**. The UI shows it; the backend doesn't exist.

**Required:** Either implement the backend `/api/presence` endpoint and wire it up, OR remove the placeholder UI entirely. Shipping fake-functionality UI to production is not acceptable.

---

## Section D — Engineering Process Gaps

### D1. Zero CI/CD — No GitHub Actions Workflows

The repository has **no `.github/workflows/` directory** and no automated checks on pull requests:

- ❌ No automated test runs on PR
- ❌ No automated build verification on PR
- ❌ No automated lint/type-check enforcement
- ❌ No automated security scanning (npm audit, dependency review)
- ❌ No automated bundle-size tracking

The 500 errors I caught on the Vercel preview during PR review **should have been caught by CI** before the PR ever reached me.

**Required:** Add GitHub Actions workflows for:
1. PR validation: lint + typecheck + build (both `apps/api` and `apps/web-next`)
2. PR validation: run `vitest` tests
3. Weekly `npm audit` and dependency review
4. Bundle-size diff comments on PR

### D2. Test Coverage Effectively Zero

| Metric | Value |
|--------|------:|
| Total `apps/web-next/src` lines | **36,047** |
| Test files | **1** (`routing.test.ts`) |
| Component tests | **0** |
| Integration tests | **0** |
| E2E tests | **0** |

This is **not acceptable** for an application handling private equity deal data, financial extraction, and AI-generated content. A single regression in the deal chat, financial extraction, or auth flow could cause significant user impact and we would have no way to catch it before deploy.

**Required (Phase 3):** Establish a test baseline:
1. Component tests for critical UI primitives (DealCard, FileTable, modal flows) — minimum 30% coverage
2. Integration test for the auth flow (login → session → protected route)
3. Integration test for the deal CRUD flow
4. E2E happy-path test for upload → extract → review

### D3. No Environment Variable Documentation

There is no `.env.example` file in `apps/web-next/`. New developers (or you, six months from now) have to reverse-engineer required env vars by reading source code.

**Required:** Add `apps/web-next/.env.example` listing every env var the app reads, with comments explaining each.

---

## Section E — Action Plan

### Phase 1 — Cleanup 

**Owner: Aditya Negi**

- [ ] **A1** — Decision matrix: for each of the 16 unmigrated pages, document one of: (a) migrating now, (b) deleting, (c) deferring to a tracked issue. Privacy Policy and Terms of Service must be migrated, not deleted.
- [ ] **A2** — Install and configure `@sentry/nextjs` in `apps/web-next`. Verify events appear in the existing Sentry project.
- [ ] **A3** — Confirm the four "missing" features (`dealFullscreen`, `docPreview`, `shareModal`, `globalSearch`) are migrated, with file references. Anything truly missing → migrate or open tracked issue.
- [ ] **B1** — Delete the entire `apps/web/` directory.
- [ ] **B2** — Remove `build:web`, `dev:web`, `build:prod` scripts from root `package.json`.
- [ ] **B4** — Update or delete the stale `dealImportMapper.ts` SYNC comment.
- [ ] **B5** — Delete the redundant `pe-dealstack-nextjs` Vercel project.
- [ ] **C1** — Replace `README.md` and `CLAUDE.md` in `apps/web-next` with real, project-specific documentation.
- [ ] **C6** — Either implement `/api/presence` or remove the presence UI entirely.
- [ ] **D3** — Create `apps/web-next/.env.example` with every required env var documented.

**Phase 1 acceptance:** A single PR titled `chore(migration): complete Phase 1 cleanup` that addresses every checkbox above, with each commit linked to its checkbox.

### Phase 2 — Code Quality 

**Owner: Aditya Negi**

- [ ] **C2** — Split all 13 oversized files into modules under 500 lines each.
- [ ] **C3** — Audit and fix all 82 empty catch blocks.
- [ ] **C4** — Replace all 14 native `alert()` / `window.confirm()` calls with project UI components.

### Phase 3 — Architecture & Process (Due: 2026-05-27)

**Owner: Aditya Negi (with Tech Lead review)**

- [ ] **C5** — Convert at minimum the dashboard, deals list, contacts list, and admin pages to use server components for data fetching with client islands for interactivity.
- [ ] **D1** — Add GitHub Actions workflows for PR validation (lint, typecheck, build, tests, npm audit).
- [ ] **D2** — Establish 30%+ component test coverage on critical flows. Add integration tests for auth and deal CRUD.

---

## Section F — Production Verification Required

Before any of the above phases begin, Aditya is responsible for **verifying production stability** of the migrated app:

- [ ] Smoke test login → dashboard → deals list → deal detail (with chat, financials, documents) on the live production URL
- [ ] Verify all four AI features work end-to-end: Deal Chat, AI Meeting Prep, AI Email Drafter, Memo Generation
- [ ] Verify file upload (deal intake + VDR document upload) works
- [ ] Verify notifications, invitations, and onboarding flow work
- [ ] Verify the financial extraction → review → save flow on a real CIM
- [ ] Document any bugs found in `docs/MIGRATION-BUGS.md`

---

## Section G — Why This Matters

Migrations of this scope are not complete when "the new code is in main." A migration is complete when:

1. The old code is **gone** — not coexisting, not commented out, not "kept for safety"
2. The new code achieves **feature parity** — every feature in scope is verifiably present
3. The new system has **observability** — error tracking, monitoring, alerting work
4. The new system has **safety nets** — automated tests, CI/CD, rollback procedures
5. The next engineer can **understand** the new system without reverse-engineering — documentation matches reality

By each of these criteria, this migration is currently incomplete. The scaffold and feature porting work that was delivered is substantial and well-executed in many places (auth middleware, design system, Vercel proxy pattern). But declaring the migration "done" while leaving the items in this report unaddressed creates technical debt that compounds quickly and makes future work harder for the entire team.

This document is the bar for "actually done."

---

## Appendix — Verification Commands

For Aditya, to verify each item before marking complete:

```bash
# A1 — Pages still in legacy not in next
ls apps/web/*.html | xargs -I {} basename {} .html | sort > /tmp/legacy.txt
find apps/web-next/src/app -name "page.tsx" | sed 's|.*/app/||;s|/page.tsx||' | sed 's|(app)/||;s|(auth)/||;s|(onboarding)/||' | sort > /tmp/next.txt
comm -23 /tmp/legacy.txt /tmp/next.txt   # Should be empty after Phase 1

# A2 — Sentry installed
grep "@sentry/nextjs" apps/web-next/package.json   # Must return a match

# B1 — Legacy directory gone
test ! -d apps/web && echo "OK: apps/web deleted"

# B2 — Stale scripts removed
grep -E '"(build:web|dev:web|build:prod)"' package.json && echo "FAIL: stale scripts present" || echo "OK: clean"

# C1 — README real
grep -q "create-next-app" apps/web-next/README.md && echo "FAIL: still default README" || echo "OK"

# C2 — File sizes
find apps/web-next/src -name "*.tsx" -o -name "*.ts" | while read f; do l=$(wc -l < "$f"); [ "$l" -gt 500 ] && echo "$l $f"; done

# C3 — Empty catches
grep -rn "} catch {$" apps/web-next/src --include="*.tsx" --include="*.ts" | wc -l   # Target: 0

# C4 — Native dialogs
grep -rn "alert(\|window\.confirm" apps/web-next/src --include="*.tsx" --include="*.ts" | wc -l   # Target: 0

# D1 — CI/CD
test -d .github/workflows && ls .github/workflows || echo "FAIL: no workflows"

# D3 — env example
test -f apps/web-next/.env.example && echo "OK" || echo "FAIL"
```

---

**Sign-off required:**
- [ ] Phase 1 complete (Aditya signature + date): _________________
- [ ] Phase 1 reviewed and approved (Tech Lead signature + date): _________________
- [ ] Phase 2 complete (Aditya signature + date): _________________
- [ ] Phase 2 reviewed and approved (Tech Lead signature + date): _________________
- [ ] Phase 3 complete (Aditya signature + date): _________________
- [ ] Phase 3 reviewed and approved (Tech Lead signature + date): _________________

Until all three phases are signed off, the migration is **not** considered complete.
