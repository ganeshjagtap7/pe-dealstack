# Onboarding Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance onboarding with a pre-loaded Lukhtara sample deal, auto-detection for all 5 checklist steps, completion celebration, and extended page coverage.

**Architecture:** Sample deal created server-side in `userService.ts` when a new org is created. Auto-detection split between API-side (upload, invite) and frontend (review, chat). Celebration is CSS-only confetti + existing toast. Sample deal uses existing `tags` field — no DB migration.

**Tech Stack:** Express/TypeScript (API), Vanilla JS (frontend), Supabase PostgreSQL, existing onboarding module system.

---

## File Structure

| Category | File | Responsibility |
|----------|------|---------------|
| **New** | `apps/api/src/services/sampleDealService.ts` | Create Lukhtara sample deal with all related data |
| **New** | `apps/web/js/onboarding/onboarding-celebrate.js` | CSS confetti animation + completion trigger |
| **Modify** | `apps/api/src/services/userService.ts` | Call sample deal creation after new org |
| **Modify** | `apps/api/src/routes/onboarding.ts` | Export `tryCompleteOnboardingStep` helper |
| **Modify** | `apps/api/src/routes/documents-upload.ts` | Fire `uploadDocument` step on upload |
| **Modify** | `apps/api/src/routes/invitations.ts` | Fire `inviteTeamMember` step on invite |
| **Modify** | `apps/api/src/routes/deals.ts` | Auto-archive sample deals on real deal creation |
| **Modify** | `apps/web/js/onboarding/onboarding-api.js` | Add celebration trigger after all-complete |
| **Modify** | `apps/web/js/financials.js` | Fire `reviewExtraction` step |
| **Modify** | `apps/web/js/deal-chat.js` | Fire `tryDealChat` step |
| **Modify** | `apps/web/js/crm-cards.js` | Add "Sample" badge on sample deal cards |
| **Modify** | `apps/web/deal.html` | Add onboarding script tags |
| **Modify** | `apps/web/settings.html` | Add onboarding script tags |

---

### Task 1: Export Onboarding Step Helper from API

**Files:**
- Modify: `apps/api/src/routes/onboarding.ts:1-19`

- [ ] **Step 1: Add exported helper function**

Add this at the top of `apps/api/src/routes/onboarding.ts`, after the `DEFAULT_STATUS` constant (after line 19):

```typescript
/**
 * Fire-and-forget helper to mark an onboarding step complete.
 * Used by other routes (documents, invitations) to auto-detect steps.
 * Never throws — onboarding must never block core functionality.
 */
export async function tryCompleteOnboardingStep(userId: string, step: string): Promise<void> {
  try {
    if (!VALID_STEPS.includes(step)) return;

    const { data: user } = await supabase
      .from('User')
      .select('onboardingStatus')
      .eq('id', userId)
      .single();

    const status = user?.onboardingStatus || { ...DEFAULT_STATUS };
    if (!status.steps) status.steps = { ...DEFAULT_STATUS.steps };
    if (status.steps[step]) return; // Already complete

    status.steps[step] = true;

    const allComplete = VALID_STEPS.every(s => status.steps[s]);
    if (allComplete && !status.completedAt) {
      status.completedAt = new Date().toISOString();
    }

    await supabase
      .from('User')
      .update({ onboardingStatus: status })
      .eq('id', userId);
  } catch (e) {
    // Silent — never block core routes
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/onboarding.ts
git commit -m "feat(onboarding): export tryCompleteOnboardingStep helper for cross-route detection"
```

---

### Task 2: Wire API-Side Auto-Detection (Upload + Invite)

**Files:**
- Modify: `apps/api/src/routes/documents-upload.ts:389`
- Modify: `apps/api/src/routes/invitations.ts:287`

- [ ] **Step 1: Add upload detection in documents-upload.ts**

At the top of `apps/api/src/routes/documents-upload.ts`, add the import:

```typescript
import { tryCompleteOnboardingStep } from './onboarding.js';
```

Then before the success response at line 389 (`res.status(201).json(...)`), add:

```typescript
    // Onboarding: mark uploadDocument step complete (fire-and-forget)
    const uploadUserId = (req as any).userId;
    if (uploadUserId) {
      tryCompleteOnboardingStep(uploadUserId, 'uploadDocument');
    }
```

- [ ] **Step 2: Add invite detection in invitations.ts**

At the top of `apps/api/src/routes/invitations.ts`, add the import:

```typescript
import { tryCompleteOnboardingStep } from './onboarding.js';
```

Then between the audit log (line 286) and the response (line 288), add:

```typescript
    // Onboarding: mark inviteTeamMember step complete (fire-and-forget)
    const inviteUserId = (req as any).userId;
    if (inviteUserId) {
      tryCompleteOnboardingStep(inviteUserId, 'inviteTeamMember');
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/documents-upload.ts apps/api/src/routes/invitations.ts
git commit -m "feat(onboarding): auto-detect uploadDocument and inviteTeamMember steps"
```

---

### Task 3: Wire Frontend Auto-Detection (Review Extraction + Deal Chat)

**Files:**
- Modify: `apps/web/js/financials.js:40`
- Modify: `apps/web/js/deal-chat.js:137`

- [ ] **Step 1: Add extraction review detection in financials.js**

In `apps/web/js/financials.js`, find the line `renderFinancialSection();` (around line 40). Add immediately after it:

```javascript
  // Onboarding: mark reviewExtraction step when user views extracted financials
  if (finState.statements.length > 0 && window.OnboardingAPI) {
    OnboardingAPI.completeStep('reviewExtraction');
  }
```

- [ ] **Step 2: Add deal chat detection in deal-chat.js**

In `apps/web/js/deal-chat.js`, find the block after a successful AI response is shown (around line 137, after `addAIResponseFromAPI(data.response, data.action);`). Add immediately after:

```javascript
                    // Onboarding: mark tryDealChat step on first successful chat
                    if (window.OnboardingAPI) {
                        OnboardingAPI.completeStep('tryDealChat');
                    }
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/js/financials.js apps/web/js/deal-chat.js
git commit -m "feat(onboarding): auto-detect reviewExtraction and tryDealChat steps"
```

---

### Task 4: Celebration Animation

**Files:**
- Create: `apps/web/js/onboarding/onboarding-celebrate.js`
- Modify: `apps/web/js/onboarding/onboarding-api.js:48-63`

- [ ] **Step 1: Create celebration module**

Create `apps/web/js/onboarding/onboarding-celebrate.js`:

```javascript
/**
 * PE OS — Onboarding Celebration
 * CSS-only confetti animation when all onboarding steps are completed.
 */
(function() {
    'use strict';

    const COLORS = ['#003366', '#0066CC', '#4CAF50', '#FFD700', '#FF6B6B', '#A855F7'];
    const PARTICLE_COUNT = 40;
    const DURATION = 3000;

    window.triggerOnboardingCelebration = function() {
        // Inject confetti keyframes
        const styleId = 'pe-confetti-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes confettiFall {
                    0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
                }
                .pe-confetti-particle {
                    position: fixed;
                    top: -10px;
                    z-index: 99999;
                    pointer-events: none;
                    animation: confettiFall linear forwards;
                }
            `;
            document.head.appendChild(style);
        }

        // Create container
        const container = document.createElement('div');
        container.id = 'pe-confetti-container';
        document.body.appendChild(container);

        // Spawn particles
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const particle = document.createElement('div');
            particle.className = 'pe-confetti-particle';
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const left = Math.random() * 100;
            const size = Math.random() * 8 + 4;
            const duration = Math.random() * 2 + 1.5;
            const delay = Math.random() * 0.8;
            const isCircle = Math.random() > 0.5;

            particle.style.cssText = `
                left: ${left}%;
                width: ${size}px;
                height: ${isCircle ? size : size * 0.4}px;
                background-color: ${color};
                border-radius: ${isCircle ? '50%' : '2px'};
                animation-duration: ${duration}s;
                animation-delay: ${delay}s;
            `;
            container.appendChild(particle);
        }

        // Cleanup after animation
        setTimeout(() => {
            container.remove();
        }, DURATION + 1000);
    };
})();
```

- [ ] **Step 2: Add celebration trigger in onboarding-api.js**

In `apps/web/js/onboarding/onboarding-api.js`, replace the `completeStep` method (lines 48-63) with:

```javascript
    async completeStep(stepId) {
        // Update cache optimistically
        if (this._cache && this._cache.steps) {
            if (this._cache.steps[stepId]) return; // Already completed
            this._cache.steps[stepId] = true;
        }
        try {
            await PEAuth.authFetch(`${API_BASE_URL}/onboarding/complete-step`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step: stepId }),
            });

            // Check if all steps are now complete — trigger celebration
            if (this._cache && this._cache.steps) {
                const allDone = Object.values(this._cache.steps).every(Boolean);
                if (allDone) {
                    if (window.triggerOnboardingCelebration) {
                        triggerOnboardingCelebration();
                    }
                    if (window.showNotification) {
                        showNotification('Onboarding Complete!', 'You\'re all set — PE OS is ready for action.', 'success');
                    }
                }
            }
        } catch (error) {
            console.warn('[Onboarding] Failed to save step:', stepId, error.message);
        }
    },
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/js/onboarding/onboarding-celebrate.js apps/web/js/onboarding/onboarding-api.js
git commit -m "feat(onboarding): confetti celebration on all-steps-complete"
```

---

### Task 5: Extend Onboarding Scripts to deal.html and settings.html

**Files:**
- Modify: `apps/web/deal.html:660`
- Modify: `apps/web/settings.html:539`

- [ ] **Step 1: Add scripts to deal.html**

In `apps/web/deal.html`, after the last `<script>` tag (around line 663, after `js/dealFullscreen.js`), add:

```html
    <!-- Onboarding modules -->
    <script src="js/onboarding/onboarding-config.js"></script>
    <script src="js/onboarding/onboarding-api.js"></script>
    <script src="js/onboarding/onboarding-celebrate.js"></script>
    <script src="js/onboarding/onboarding-feedback.js"></script>
```

- [ ] **Step 2: Add scripts to settings.html**

In `apps/web/settings.html`, after the last `<script>` tag (line 539, after `settings.js`), add:

```html
    <!-- Onboarding modules -->
    <script src="js/onboarding/onboarding-config.js"></script>
    <script src="js/onboarding/onboarding-api.js"></script>
    <script src="js/onboarding/onboarding-celebrate.js"></script>
    <script src="js/onboarding/onboarding-feedback.js"></script>
```

- [ ] **Step 3: Add celebrate script to dashboard.html**

In `apps/web/dashboard.html`, after `onboarding-checklist.js` (line 360), add:

```html
<script src="js/onboarding/onboarding-celebrate.js"></script>
```

- [ ] **Step 4: Add celebrate script to crm.html**

In `apps/web/crm.html`, after the existing onboarding scripts (around line 519), add:

```html
<script src="js/onboarding/onboarding-celebrate.js"></script>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/deal.html apps/web/settings.html apps/web/dashboard.html apps/web/crm.html
git commit -m "feat(onboarding): extend onboarding scripts to deal.html, settings.html + celebrate on all pages"
```

---

### Task 6: Sample Deal Service

**Files:**
- Create: `apps/api/src/services/sampleDealService.ts`

- [ ] **Step 1: Create the sample deal service**

Create `apps/api/src/services/sampleDealService.ts`:

```typescript
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Creates a fully-loaded Lukhtara sample deal for a new organization.
 * Includes: Company, Deal, VDR Folders, Documents (references), FinancialStatements, Activities.
 * Uses existing `tags` field with ['sample'] — no schema changes needed.
 */

const LUKHTARA_COMPANY = {
  name: 'Lukhtara Industries',
  industry: 'Manufacturing & Distribution',
  website: 'https://lukhtara.example.com',
  description: 'Diversified manufacturing company specializing in industrial components and distribution across South Asia. Strong revenue growth with expanding margins.',
};

const LUKHTARA_DEAL = {
  name: 'Lukhtara Industries — Acquisition',
  stage: 'DUE_DILIGENCE',
  status: 'ACTIVE',
  industry: 'Manufacturing & Distribution',
  description: 'Potential acquisition of Lukhtara Industries, a diversified manufacturer with strong regional presence. Company shows consistent revenue growth and improving margins across core segments.',
  aiThesis: 'Strong manufacturing base with expanding distribution network. Revenue growing at 15% CAGR with EBITDA margins improving from 18% to 22%. Key risks: customer concentration (top 5 = 45% revenue) and raw material price volatility.',
  revenue: 125.0,
  ebitda: 27.5,
  irrProjected: 22.5,
  mom: 2.8,
  dealSize: 185.0,
  icon: 'factory',
  priority: 'HIGH',
  tags: ['sample'],
};

const LUKHTARA_FOLDERS = [
  { name: 'Financials', description: 'Financial statements and models' },
  { name: 'Legal', description: 'Legal documents and agreements' },
  { name: 'Company Overview', description: 'Company presentations and background' },
];

// Income Statement line items (in millions USD)
const INCOME_STATEMENT_ITEMS: Record<string, Record<string, number>> = {
  '2023': {
    revenue: 125.0, costOfGoodsSold: 78.5, grossProfit: 46.5,
    sellingGeneralAdmin: 12.8, researchDevelopment: 3.2, depreciation: 4.5,
    operatingIncome: 26.0, interestExpense: 2.8, otherIncome: 1.3,
    pretaxIncome: 24.5, incomeTax: 6.1, netIncome: 18.4,
  },
  '2022': {
    revenue: 108.0, costOfGoodsSold: 69.1, grossProfit: 38.9,
    sellingGeneralAdmin: 11.5, researchDevelopment: 2.9, depreciation: 4.0,
    operatingIncome: 20.5, interestExpense: 3.1, otherIncome: 0.8,
    pretaxIncome: 18.2, incomeTax: 4.6, netIncome: 13.6,
  },
  '2021': {
    revenue: 92.0, costOfGoodsSold: 60.7, grossProfit: 31.3,
    sellingGeneralAdmin: 10.2, researchDevelopment: 2.5, depreciation: 3.6,
    operatingIncome: 15.0, interestExpense: 3.4, otherIncome: 0.5,
    pretaxIncome: 12.1, incomeTax: 3.0, netIncome: 9.1,
  },
};

const BALANCE_SHEET_ITEMS: Record<string, Record<string, number>> = {
  '2023': {
    cash: 18.2, accountsReceivable: 22.5, inventory: 15.8, otherCurrentAssets: 3.5,
    totalCurrentAssets: 60.0, propertyPlantEquipment: 45.0, intangibleAssets: 8.5,
    goodwill: 12.0, otherNonCurrentAssets: 4.5, totalAssets: 130.0,
    accountsPayable: 14.2, shortTermDebt: 8.0, accruedLiabilities: 6.8,
    totalCurrentLiabilities: 29.0, longTermDebt: 32.0, otherLiabilities: 5.0,
    totalLiabilities: 66.0, totalEquity: 64.0, totalLiabilitiesAndEquity: 130.0,
  },
  '2022': {
    cash: 14.5, accountsReceivable: 19.8, inventory: 14.2, otherCurrentAssets: 3.0,
    totalCurrentAssets: 51.5, propertyPlantEquipment: 41.0, intangibleAssets: 9.0,
    goodwill: 12.0, otherNonCurrentAssets: 4.0, totalAssets: 117.5,
    accountsPayable: 12.5, shortTermDebt: 7.5, accruedLiabilities: 6.0,
    totalCurrentLiabilities: 26.0, longTermDebt: 35.0, otherLiabilities: 4.5,
    totalLiabilities: 65.5, totalEquity: 52.0, totalLiabilitiesAndEquity: 117.5,
  },
};

const CASH_FLOW_ITEMS: Record<string, Record<string, number>> = {
  '2023': {
    netIncome: 18.4, depreciation: 4.5, changesInWorkingCapital: -3.2,
    operatingCashFlow: 19.7, capitalExpenditures: -8.5, acquisitions: 0,
    investingCashFlow: -8.5, debtIssuance: -3.0, dividends: -4.5,
    financingCashFlow: -7.5, netChangeInCash: 3.7,
  },
  '2022': {
    netIncome: 13.6, depreciation: 4.0, changesInWorkingCapital: -2.1,
    operatingCashFlow: 15.5, capitalExpenditures: -7.0, acquisitions: 0,
    investingCashFlow: -7.0, debtIssuance: 2.0, dividends: -3.5,
    financingCashFlow: -1.5, netChangeInCash: 7.0,
  },
};

export async function createSampleDeal(orgId: string, userId: string): Promise<void> {
  try {
    // 1. Create Company
    const { data: company, error: companyErr } = await supabase
      .from('Company')
      .insert({ ...LUKHTARA_COMPANY, organizationId: orgId })
      .select('id')
      .single();

    if (companyErr) throw companyErr;

    // 2. Create Deal
    const { data: deal, error: dealErr } = await supabase
      .from('Deal')
      .insert({
        ...LUKHTARA_DEAL,
        companyId: company.id,
        organizationId: orgId,
        assignedTo: userId,
      })
      .select('id')
      .single();

    if (dealErr) throw dealErr;

    // 3. Create VDR Folders
    const folderInserts = LUKHTARA_FOLDERS.map(f => ({
      ...f,
      dealId: deal.id,
      createdBy: userId,
    }));

    await supabase.from('Folder').insert(folderInserts);

    // 4. Create Financial Statements
    const statements = [];

    for (const [period, lineItems] of Object.entries(INCOME_STATEMENT_ITEMS)) {
      statements.push({
        dealId: deal.id,
        statementType: 'INCOME_STATEMENT',
        period,
        periodType: 'HISTORICAL',
        lineItems,
        currency: 'USD',
        unitScale: 'MILLIONS',
        extractionConfidence: 95,
        extractionSource: 'manual' as const,
        extractedAt: new Date().toISOString(),
        isActive: true,
      });
    }

    for (const [period, lineItems] of Object.entries(BALANCE_SHEET_ITEMS)) {
      statements.push({
        dealId: deal.id,
        statementType: 'BALANCE_SHEET',
        period,
        periodType: 'HISTORICAL',
        lineItems,
        currency: 'USD',
        unitScale: 'MILLIONS',
        extractionConfidence: 95,
        extractionSource: 'manual' as const,
        extractedAt: new Date().toISOString(),
        isActive: true,
      });
    }

    for (const [period, lineItems] of Object.entries(CASH_FLOW_ITEMS)) {
      statements.push({
        dealId: deal.id,
        statementType: 'CASH_FLOW',
        period,
        periodType: 'HISTORICAL',
        lineItems,
        currency: 'USD',
        unitScale: 'MILLIONS',
        extractionConfidence: 95,
        extractionSource: 'manual' as const,
        extractedAt: new Date().toISOString(),
        isActive: true,
      });
    }

    await supabase.from('FinancialStatement').insert(statements);

    // 5. Create Activities
    const activities = [
      {
        dealId: deal.id,
        type: 'DEAL_CREATED',
        title: 'Sample deal created',
        description: 'Lukhtara Industries added as a sample deal to help you explore PE OS.',
        userId,
      },
      {
        dealId: deal.id,
        type: 'AI_EXTRACTION',
        title: 'Financial statements extracted',
        description: 'AI extracted 3 years of financials: Income Statement, Balance Sheet, and Cash Flow.',
        userId,
      },
    ];

    await supabase.from('Activity').insert(activities);

    log.info('Sample deal created for new org', { orgId, dealId: deal.id, company: 'Lukhtara Industries' });
  } catch (error) {
    // Sample deal creation should never block signup
    log.error('Failed to create sample deal', error, { orgId });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/sampleDealService.ts
git commit -m "feat(onboarding): add sampleDealService with Lukhtara Industries deal data"
```

---

### Task 7: Trigger Sample Deal on New Org Signup

**Files:**
- Modify: `apps/api/src/services/userService.ts:72-74`

- [ ] **Step 1: Import and call createSampleDeal**

At the top of `apps/api/src/services/userService.ts`, add:

```typescript
import { createSampleDeal } from './sampleDealService.js';
```

Then after line 74 (`log.info('Organization created on signup', ...)`), add:

```typescript
        // Create sample deal for new org (fire-and-forget — never blocks signup)
        createSampleDeal(newOrg.id, authUser.id).catch(err => {
          log.error('Sample deal creation failed', err, { orgId: newOrg.id });
        });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/userService.ts
git commit -m "feat(onboarding): trigger Lukhtara sample deal creation on new org signup"
```

---

### Task 8: Auto-Archive Sample Deal on Real Deal Creation

**Files:**
- Modify: `apps/api/src/routes/deals.ts:234`

- [ ] **Step 1: Add sample deal archival after real deal creation**

In `apps/api/src/routes/deals.ts`, find the POST handler (line 234). After the deal is successfully created and the DealTeamMember is inserted (around the success response), add this block before `res.status(201).json(...)`:

```typescript
    // Auto-archive sample deals when user creates their first real deal
    if (!data.tags?.includes('sample')) {
      supabase
        .from('Deal')
        .update({ status: 'ARCHIVED' })
        .eq('organizationId', orgId)
        .contains('tags', ['sample'])
        .then(({ error: archiveErr }) => {
          if (archiveErr) log.error('Failed to archive sample deal', archiveErr);
          else log.info('Sample deal archived after real deal creation', { orgId });
        })
        .catch(() => {}); // Fire-and-forget
    }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/deals.ts
git commit -m "feat(onboarding): auto-archive sample deal when first real deal is created"
```

---

### Task 9: Sample Deal Badge on CRM Cards

**Files:**
- Modify: `apps/web/js/crm-cards.js:68`

- [ ] **Step 1: Add "Sample" badge to deal cards**

In `apps/web/js/crm-cards.js`, find line 68 where the stage badge is rendered:

```javascript
<span class="px-2 py-1 rounded-md ${style.bg} border ${style.border} ${style.text} text-[10px] font-bold uppercase tracking-wider mr-8">${style.label}</span>
```

Replace that line with:

```javascript
<span class="px-2 py-1 rounded-md ${style.bg} border ${style.border} ${style.text} text-[10px] font-bold uppercase tracking-wider mr-8">${style.label}</span>
                        ${deal.tags && deal.tags.includes('sample') ? '<span class="ml-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wider">Sample</span>' : ''}
```

- [ ] **Step 2: Add "Remove Sample" action**

In the same file, find where the deal card actions or kebab menu are rendered. Add a conditional "Remove Sample" button for sample deals. Find the checkbox/select area (around line 27-55) and after the card's closing `</article>` tag, add:

```javascript
${deal.tags && deal.tags.includes('sample') ? `
    <button onclick="event.preventDefault(); event.stopPropagation(); removeSampleDeal('${deal.id}')"
            class="absolute top-2 right-2 z-10 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 text-[10px] font-medium transition-colors shadow-sm"
            title="Remove sample deal">
        <span class="material-symbols-outlined text-[14px] align-middle">close</span> Remove Sample
    </button>
` : ''}
```

- [ ] **Step 3: Add removeSampleDeal function**

At the bottom of `apps/web/js/crm-cards.js` (inside the IIFE), add:

```javascript
    // Remove sample deal
    window.removeSampleDeal = async function(dealId) {
        try {
            const response = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}`, {
                method: 'DELETE',
            });
            if (response.ok) {
                if (window.showNotification) showNotification('Removed', 'Sample deal removed from your pipeline.', 'success');
                if (window.loadDeals) loadDeals();
            }
        } catch (err) {
            console.error('Failed to remove sample deal', err);
        }
    };
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/js/crm-cards.js
git commit -m "feat(onboarding): add Sample badge and Remove button on sample deal cards"
```

---

### Task 10: Update Vite Config for Celebrate Script

**Files:**
- Modify: `apps/web/vite.config.ts` (if needed)

- [ ] **Step 1: Verify onboarding directory is already copied**

The `vite.config.ts` already dynamically copies `js/onboarding/` files to dist (fixed in Session 38). Verify the new `onboarding-celebrate.js` will be picked up.

Run: `cd apps/web && npx vite build 2>&1 | tail -5`
Expected: Build succeeds without errors

- [ ] **Step 2: Commit if any changes needed**

Only commit if vite.config.ts needed modification. Otherwise skip.

---

### Task 11: Final Verification

- [ ] **Step 1: TypeScript check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Vite build check**

Run: `cd apps/web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Verify all onboarding files exist**

Check that all 7 onboarding frontend files exist:
- `apps/web/js/onboarding/onboarding-config.js`
- `apps/web/js/onboarding/onboarding-api.js`
- `apps/web/js/onboarding/onboarding-welcome.js`
- `apps/web/js/onboarding/onboarding-checklist.js`
- `apps/web/js/onboarding/onboarding-empty.js`
- `apps/web/js/onboarding/onboarding-feedback.js`
- `apps/web/js/onboarding/onboarding-celebrate.js` (NEW)

- [ ] **Step 4: Final commit with progress update**

Update `progress.md` with Session 49 onboarding enhancement details, then:

```bash
git add -A
git commit -m "feat(onboarding): complete enhancement — sample deal, auto-detection, celebration, extended pages"
git push origin main
```
