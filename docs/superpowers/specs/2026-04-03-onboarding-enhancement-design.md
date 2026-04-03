# Onboarding Enhancement — Design Spec

**Date:** April 3, 2026
**Goal:** Make onboarding guide new users through the product with a pre-loaded sample deal, auto-detecting step completion, and polished UX.

---

## Part 1: Sample Deal (Lukhtara)

### Concept
When a new user signs up, a fully loaded sample deal is auto-created in their org so they see a real product experience instead of empty screens.

### Data Seeded Per New Org

| Record | Details |
|--------|---------|
| **Company** | Lukhtara (industry, description) |
| **Deal** | Lukhtara Acquisition — stage: DUE_DILIGENCE, real revenue/EBITDA/IRR, `isSample: true` tag |
| **Documents (3)** | Sample CIM PDF, Financial Model Excel, Teaser — stored in Supabase storage `seed/` prefix |
| **VDR Folders (3)** | Financials, Legal, Company Overview — with documents assigned |
| **FinancialStatements** | Income Statement, Balance Sheet, Cash Flow — 2-3 periods, real extracted numbers |
| **Activities (3)** | Deal created, Document uploaded, Extraction completed |

### Implementation

**Backend — `apps/api/src/services/sampleDealService.ts` (NEW)**
- `createSampleDeal(orgId: string, userId: string): Promise<Deal>`
- Creates Company + Deal + Documents + Folders + FinancialStatements + Activities in a single transaction
- Deal gets `tags: ['sample']` to identify it (uses existing `tags` JSONB field — no schema change)
- Financial data hardcoded as constants in the service file (real Lukhtara numbers)
- Documents reference pre-uploaded seed files in Supabase storage (`seed/lukhtara-cim.pdf`, etc.)

**Trigger — `apps/api/src/services/userService.ts`**
- In `findOrCreateUser()`, after creating a new User + Org, call `createSampleDeal(orgId, userId)`
- Only runs when a brand-new Organization is created (not when joining an existing org via invitation)

**Frontend — CRM card badge**
- In `crm.js` / `crm-cards.js`: if `deal.tags?.includes('sample')`, render an amber "Sample Deal" badge on the card
- Add a small "x" dismiss button on the badge → `DELETE /api/deals/:id` (existing endpoint)

**Auto-removal**
- In `POST /api/deals` (create deal endpoint): after successfully creating a real deal, check if org has any sample deals (`tags @> '["sample"]'`) and soft-delete them (set `status: 'ARCHIVED'`)
- Sample deals with `status: 'ARCHIVED'` are filtered out of the CRM list (already filtered by existing query)

### Seed Files
- Pre-upload 3 files to Supabase storage under `seed/` path (one-time manual upload)
- `seed/lukhtara-cim.pdf` — Sample CIM document
- `seed/lukhtara-financials.xlsx` — Sample financial model
- `seed/lukhtara-teaser.pdf` — Sample teaser
- These files are referenced by all sample deals (shared across orgs, read-only)

---

## Part 2: Auto-Detection for All 5 Steps

### Detection Matrix

| Step | Location | Type | Trigger Logic |
|------|----------|------|---------------|
| `createDeal` | `apps/web/crm.js` | Frontend | Already implemented — detects when deals load |
| `uploadDocument` | `apps/api/src/routes/documents-upload.ts` | API-side | After successful document upload, call onboarding complete-step |
| `reviewExtraction` | `apps/web/js/financials.js` | Frontend | When financial statements render on deal page |
| `tryDealChat` | `apps/web/js/deal-chat.js` | Frontend | After first chat message is sent successfully |
| `inviteTeamMember` | `apps/api/src/routes/invitations.ts` | API-side | After successful invitation creation |

### API-Side Detection (upload + invite)

Add a helper `tryCompleteOnboardingStep(userId: string, step: string)` in `apps/api/src/routes/onboarding.ts` and export it.

**In `documents-upload.ts`** — after successful upload response:
```typescript
tryCompleteOnboardingStep(req.userId, 'uploadDocument');
```

**In `invitations.ts`** — after successful invitation creation:
```typescript
tryCompleteOnboardingStep(req.userId, 'inviteTeamMember');
```

These are fire-and-forget (async, no await, no error propagation). Onboarding detection must never block core functionality.

### Frontend Detection (review + chat)

**In `financials.js`** — when statements render successfully:
```javascript
if (statements.length > 0 && window.OnboardingAPI) {
    OnboardingAPI.completeStep('reviewExtraction');
}
```

**In `deal-chat.js`** — after first message gets a successful response:
```javascript
if (window.OnboardingAPI) {
    OnboardingAPI.completeStep('tryDealChat');
}
```

Both use the existing `OnboardingAPI.completeStep()` which is optimistic and no-ops if already complete.

---

## Part 3: Completion Celebration

### When All 5 Steps Complete

**Trigger:** `OnboardingAPI.completeStep()` checks if all steps are now true after marking one complete.

**UX:**
1. Confetti animation (CSS-only, no library — 30-40 colored particles falling for 3 seconds)
2. Toast notification: "You're all set! You've completed the PE OS onboarding." (green success toast using existing `showNotification`)
3. Checklist widget auto-hides after 2-second delay

### Implementation

**New file: `apps/web/js/onboarding/onboarding-celebrate.js`**
- `triggerCelebration()` — injects CSS confetti keyframes + particles into DOM, auto-removes after 3s
- Called from `OnboardingAPI.completeStep()` when all steps become true

**Modify: `onboarding-api.js`**
- In `completeStep()`, after optimistic update, check if all 5 steps are now true
- If yes, call `window.triggerCelebration?.()` and `window.showNotification?.('Onboarding Complete', 'You\'re all set! ...', 'success')`

---

## Part 4: Extended Page Coverage

### Pages That Should Load Onboarding Scripts

| Page | Currently Loads | Should Add |
|------|----------------|------------|
| `dashboard.html` | All 6 scripts | Nothing — complete |
| `crm.html` | config + api + feedback | Nothing — adequate |
| `contacts.html` | config + api + feedback | Nothing — adequate |
| `deal.html` | None | config + api + feedback (for auto-detection + feedback button) |
| `settings.html` | None | config + api + feedback (for feedback button) |

### Better Empty States

Use existing `onboarding-empty.js` `renderOnboardingEmptyState()` on pages that currently show generic "no data" messages:

- **Contacts page** — when no contacts exist, show the `contacts` empty state from config
- **Templates page** — when no templates exist, show the `templates` empty state from config
- These empty state configs already exist in `onboarding-config.js` — just need to call `renderOnboardingEmptyState()` in the right places

---

## Files Changed Summary

| Category | Files |
|----------|-------|
| **New** | `sampleDealService.ts`, `onboarding-celebrate.js` |
| **Modified — API** | `userService.ts`, `onboarding.ts`, `documents-upload.ts`, `invitations.ts` |
| **Modified — Frontend** | `onboarding-api.js`, `financials.js`, `deal-chat.js`, `crm.js` or `crm-cards.js` |
| **Modified — HTML** | `deal.html`, `settings.html` (add script tags) |
| **Manual** | Upload 3 seed files to Supabase storage `seed/` path |

---

## Out of Scope

- Interactive guided tour with tooltips/highlights (future enhancement)
- Lukhtara-specific chat history pre-seeded (user can chat with the sample deal naturally)
- Email notifications for onboarding progress
- Analytics/tracking of onboarding completion rates
