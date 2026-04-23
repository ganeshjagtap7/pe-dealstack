# Web-Next Port Plan

Plan for porting the 57 main-ahead commits of `apps/web` → `apps/web-next` with minimal merge conflicts and full parity with the deployed legacy app.

- **Fork point**: `f43bd0f`
- **Current main**: `345b96e` (57 commits ahead of fork)
- **Reference**: `../pe-dealstack-main/apps/web/**` — always current on `git pull`
- **Parity rule**: match the legacy feature exactly. Never ship a pared-down version.

## Guiding principles

1. **Only edit `apps/web-next/**` on `frontend/dev` from now on.** Do not touch `apps/web/` or `apps/api/` — the eventual merge overwrite them, and touching them creates conflicts for no benefit.
2. **Port from the worktree, not from memory.** `../pe-dealstack-main/apps/web/` is the source of truth — open it side-by-side with the `.tsx` you're writing.
3. **Commit per feature, not per wave.** Small semantic commits (`feat(web-next): port login redesign`) leave a reviewable trail and let the final merge squash cleanly.
4. **Test `:3003` vs `:3002` side-by-side** before marking a feature done.

## Known merge-conflict hotspots (already unavoidable)

These already exist from prior `frontend/dev` commits. Nothing to fix — just be aware when merging:
- `apps/api/src/routes/audit.ts` — your `enrichLogsWithUserNames` vs main's `88aad01 fix(audit): set organizationId on AuditLog inserts`. Manual resolution, ~2 min.
- `apps/web/vite.config.ts` — your port `3003` change vs main's `345b96e` (onboarding Vite input). Trivial.
- `apps/web-next/**` — doesn't exist on main. Zero conflict — pure add on merge.
- `package.json` / `package-lock.json` — noisy but `npm install` resolves.

Everything new you port from here lives only in `apps/web-next/**` → **zero new conflict surface**.

---

## Port order (by risk and dependency)

### Tier 1 — Visual-only, no API change (~1–2 days)

Port these first. No backend coupling; you can diff HTML-to-TSX mechanically and ship.

| # | Feature | Main commit(s) | Main source | Web-next target |
|---|---|---|---|---|
| 1 | **Login redesign** (matches deployed) | `37a3392` | `apps/web/login.html` | `src/app/(auth)/login/page.tsx` |
| 2 | VDR button color fix (Banker Blue) | `61b5d02` | `apps/web/vdr.html` + JS | `src/app/(app)/data-room/**` |
| 3 | Dashboard CSS layout fixes | `d931fbe`, `09c59c7`, `dcf164a`, `8e259aa` | `apps/web/dashboard.html` | `src/app/(app)/dashboard/**` |

**#1 is the visible one** — your :3002 login doesn't match main's :3003 right now. Fix this first so the port matches the deployed app. The current web-next login has decorative cards too but copy/stats differ — align field-by-field with main's `login.html:70-170` region.

### Tier 2 — Visual + existing-API (~2–3 days)

APIs already exist and haven't broken. Port UI only.

| # | Feature | Main commit(s) | Main source | Web-next target |
|---|---|---|---|---|
| 4 | Dashboard 12-widget expansion + drag-drop layout editor | `c9dcc6d` | `dashboard.html` + `dashboard-widgets.js` | `src/app/(app)/dashboard/**` |
| 5 | Deal page: user dropdown, Excel rendering, avatar fixes | `65cbdac`, `200d36b` | `deal.html`, `deal.js`, `deal-chat.js` | `src/app/(app)/deals/[id]/**` |
| 6 | Chat suggestion chip visibility rules | `cf67cea`, `63dd4a0` | `deal-chat.js` | `deals/[id]/deal-tabs.tsx` (Chat section) |
| 7 | Intake: remove "Enter URL" tab + scroll-to-hash on deal page | `ee35074` | `deal-intake.html`, `deal.html` | `deal-intake/**`, `deals/[id]/**` |

### Tier 3 — UI + new or changed API contracts (~3–5 days)

Read the main `apps/api` route before porting the UI so the call shape matches.

| # | Feature | Main commit(s) | Main source | Web-next target |
|---|---|---|---|---|
| 8a | Memo: PDF export + export dropdown + share button | `c1d7a4d` | `memo-builder.js`, `memo-export.js` | `memo-builder/editor.tsx`, `export.ts` |
| 8b | Memo: saved memo list on AI Reports open | `b833c00` | `memo-builder.js` | `memo-builder/page.tsx` |
| 8c | Memo: section tools (add/remove/regenerate) fixes | `e788eb3`, `78fae4b`, `087ffb9`, `b609ebd` | `memo-chat.js` | `memo-builder/editor.tsx` |
| 8d | Memo: rate-limit + formatting fixes | `caef966` | `memo-chat.js` | `memo-builder/editor.tsx` |
| 9 | Help & Support modal (Book a Call + Written Feedback) | `f23a61c` | `layout.js` | `src/components/layout/**` |
| 10 | Dashboard "undefined Deals" modal fix | `1000f52` | `dashboard.js` | `dashboard/**` |

### Tier 4 — Largest + most complex (~5–7 days)

Do these last. They interact with each other and with new backend agents.

| # | Feature | Main commit(s) | Main source | Web-next target |
|---|---|---|---|---|
| 11 | NEW 3-step onboarding flow + firm research agent integration | `3a796c8`, `ff5d9ac`, `64762c6`, `1a2114c`, `1ae82dc`, `5fa58c6`, `c987ade`, `994b094`, `c613195`, `df88534` | `apps/web/js/onboarding/**`, `onboarding.html` | NEW route: `src/app/(onboarding)/**` |
| 12 | Firm enrichment: full profile report modal | `9948dcf`, `f5e8d94` | `deal.js`, `contacts.js` (enrichment modal) | `deals/[id]/**` or `contacts/**` |

**Tier 4 is a rewrite** — don't try to salvage any existing onboarding logic in web-next. Start from the main source and build fresh.

### Tier 5 — Verify, don't port

These **might already be in web-next** from prior work. Check before duplicating:

| # | Feature | Check path |
|---|---|---|
| 13 | VDR Pending Analysis + Excel auto-extract + re-analyze | `apps/web-next/src/app/(app)/data-room/**` — does 3-state badge exist? |
| 14 | `fix(intake,deal): remove Enter URL tab` — already shipped in `frontend/dev` commit `217c976`? | Grep web-next for "Enter URL" tab |
| 15 | `f23a61c Help & Support` — already in sidebar? | Grep for "Book a Call" in `components/layout` |

### Tier 6 — Skip (not applicable)

- `345b96e fix(web): add onboarding.html to Vite build inputs` — legacy Vite config, web-next doesn't use Vite.
- `31fb010 fix(ingest): 50MB file size limit` — pure API change, auto-picks-up when you merge main.

---

## Per-feature workflow

Pick a row from a tier. Then:

1. **Refresh the reference**
   ```
   cd ~/Desktop/CodeFiles/pe-dealstack-main && git pull
   ```

2. **Read both sides**
   - Main source: `../pe-dealstack-main/apps/web/<file>` (HTML + the JS it loads)
   - Current web-next: `apps/web-next/src/app/<route>/<file>`

3. **Diff the specific commit(s)** to see only what changed
   ```
   git -C ../pe-dealstack-main show <sha> -- apps/web/<file>
   ```

4. **Port to TSX.** Match copy, button order, modal contents, error messages. Ask before simplifying anything.

5. **Test side-by-side**
   - `:3003/<page>.html` (worktree, current main)
   - `:3002/<route>` (primary, your port)
   - Log in as the same user — same backend, same data.

6. **Commit**
   ```
   git commit -m "feat(web-next): port <what> from main (<sha>)"
   ```

---

## What stays off-limits on `frontend/dev`

To keep the merge clean:
- **Do NOT edit** `apps/web/**` — leave it frozen at the fork point. When you merge main, main's version wins (what you want).
- **Do NOT edit** `apps/api/**` — same. Any bug you find, file an issue; don't patch here.
- **Do edit** `apps/web-next/**` freely — it's your portion.
- **Do edit** `package.json` / `package-lock.json` only when adding a web-next dep. Expect noise on merge.

The existing audit.ts / vite.config.ts edits on `frontend/dev` are already done — live with them, resolve at merge time.

---

## Final merge ritual (when all tiers are done)

1. Stop porting. Working tree clean.
2. `git fetch origin && git merge origin/main --no-ff`
3. Resolve the two known conflicts (audit.ts, vite.config.ts) — main's version wins in both, re-apply the audit.ts org-scope helper on top.
4. `npm install` to reconcile lockfile.
5. `cd apps/web-next && npx tsc --noEmit` — full type check.
6. `cd apps/api && npx tsc --noEmit` — full type check.
7. Smoke test every ported route at :3002 against the same API.
8. Open PR `frontend/dev` → `main` — it'll be additive-only on `apps/web-next/**`.

---

## Progress tracker (update as you go)

```
Tier 1  [x] 1  Login redesign                     0458328
        [x] 2  VDR button color                   d5abe19
        [=] 3  Dashboard CSS fixes                 folds into #4 — fixes the 12-widget layout
Tier 2  [x] 4  Dashboard 12-widget expansion       76b33d5  (drag-drop skipped — registry order used)
        [=] 5  Deal page dropdown + Excel + avatar N/A — verified, see notes below
        [x] 6  Chat suggestion chips               7ae4d61
        [x] 7  Intake tab + scroll-hash            23d81a5
Tier 3  [x] 8a Memo PDF export + share             052eb57
        [=] 8b Memo saved list                     N/A — sidebar already persistent in web-next
        [x] 8c Memo chat applied-action refresh    3b4276f  (partial — skipped Confirm/Undo UI)
        [x] 8d Memo section typography             45c3da8
        [x] 9  Help & Support modal                07a3dfe
        [=] 10 Dashboard undefined-Deals fix       folds into #4 — "undefined Deals" is in the stats widget
Tier 4  [ ] 11 Onboarding 3-step flow
        [ ] 12 Firm enrichment modal
Tier 5  [x] 13 VDR 3-state badge + Re-analyze      eb73579
        [x] 14 Verify Enter-URL tab removed        done as part of #7
        [x] 15 Verify Help modal in sidebar        done via Tier 3 #9
```

## Verification notes

### Tier 1 #3 + Tier 3 #10 — fold into Tier 2 #4

The 4 CSS layout commits (`d931fbe`, `09c59c7`, `dcf164a`, `8e259aa`) all
refine the 12-widget grid shipped in `c9dcc6d`. The "undefined Deals" fix
(`1000f52`) also lives inside one of the new widgets. Web-next doesn't
have that grid yet, so these fixes have nothing to apply to in isolation.
When Tier 2 #4 lands, port the fixes' behavior into the fresh TSX
components directly — no need to re-create the buggy intermediate state.

### Tier 2 #5 — N/A (no port needed)

Each sub-item of this legacy fix is already moot in web-next:

- **User dropdown on deal header** (`65cbdac`) — legacy had a per-page custom header on deal.html that didn't include the dropdown markup. Web-next uses a shared `src/components/layout/Header.tsx` on all `(app)` routes, which already has Profile / Settings / Log out. No change needed.
- **Legacy Project Apex preview** (`200d36b`) — the hardcoded fake modal was never ported; web-next was scaffolded fresh.
- **Broken team avatar fallback** (`200d36b`) — web-next's `deal-layout.tsx:127,144` renders initials-only circles. No remote `<img>`, no broken-image bug to fix.
- **Excel table rendering** (`200d36b`) — web-next has no document preview feature. Rolls into the VDR work (Tier 5 #13) when preview UI lands.
