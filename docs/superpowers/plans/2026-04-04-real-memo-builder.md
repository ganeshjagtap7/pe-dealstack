# Real Investment Memo Builder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing memo builder UI to real deal data, replacing the hardcoded "Project Apollo" demo with live deal financials, VDR documents, and proactive AI chat.

**Architecture:** The memo builder frontend (6 JS files) and backend (3 route files + LangGraph agent) are already 85% production-ready. The core fix is a URL parameter bug that causes demo fallback. We also remove all hardcoded demo data, add a memo picker for multi-memo deals, fix broken chart images, add a proactive AI welcome message, and run a DB migration for org-scoping.

**Tech Stack:** Vanilla JS frontend, Express API, Supabase PostgreSQL, LangGraph ReAct agent, GPT-4o, Chart.js

---

### Task 1: Fix URL Parameter in Deal Page

**Files:**
- Modify: `apps/web/js/analysis.js:404`

The deal page passes `?id=${dealId}` but memo-builder expects `?dealId=${dealId}`. This single-character fix is the root cause of the entire demo fallback.

- [ ] **Step 1: Fix the URL parameter**

In `apps/web/js/analysis.js`, find line ~404 and change:

```javascript
// BEFORE
<a href="/memo-builder.html?id=${dealId}"

// AFTER
<a href="/memo-builder.html?dealId=${dealId}"
```

- [ ] **Step 2: Verify the fix**

Open a deal page in the browser, inspect the "Open Memo Builder" link. Confirm the URL now reads `?dealId=<uuid>` instead of `?id=<uuid>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/js/analysis.js
git commit -m "fix(memo): pass dealId param instead of id to memo-builder URL"
```

---

### Task 2: Remove Demo Data Fallback

**Files:**
- Modify: `apps/web/memo-builder.js:18-143` (DEMO_MEMO + DEMO_MESSAGES)
- Modify: `apps/web/memo-builder.js:166-234` (initialization logic)
- Modify: `apps/web/memo-builder.js:280-291` (loadDemoData)

Replace all demo fallback paths with proper error states. Demo data should only load when `?demo=true` is explicitly in the URL.

- [ ] **Step 1: Guard DEMO_MEMO behind demo flag**

In `apps/web/memo-builder.js`, wrap the DEMO_MEMO and DEMO_MESSAGES constants so they remain available only for `?demo=true`. At the top of the file (line 18), replace:

```javascript
// ============================================================
// Demo Data (Project Apollo)
// ============================================================
const DEMO_MEMO = {
```

with:

```javascript
// ============================================================
// Demo Data (Project Apollo) — only used with ?demo=true
// ============================================================
const DEMO_MEMO = {
```

No structural change needed to the constant itself — we just need to stop calling `loadDemoData()` as a fallback.

- [ ] **Step 2: Add an error state function**

After `hideLoadingState()` (around line 275), add:

```javascript
function showErrorState(message = 'Failed to load memo') {
    const editor = document.getElementById('document-editor');
    if (editor) {
        editor.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-center">
                <div class="size-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-red-500 text-3xl">error</span>
                </div>
                <h3 class="text-lg font-bold text-slate-900 mb-2">${message}</h3>
                <p class="text-sm text-slate-500 mb-6 max-w-md">This could be because the memo tables haven't been set up yet, or the deal data is unavailable.</p>
                <div class="flex gap-3">
                    <button onclick="window.location.reload()" class="px-4 py-2 rounded-lg text-sm font-medium text-white" style="background:#003366">
                        <span class="material-symbols-outlined text-[16px] align-middle mr-1">refresh</span>Try Again
                    </button>
                    <button onclick="history.back()" class="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        Go Back
                    </button>
                </div>
            </div>
        `;
    }
}
```

- [ ] **Step 3: Replace demo fallbacks in initialization**

In the `DOMContentLoaded` handler (lines 166-234), replace every `loadDemoData()` call (except the `demoMode` branch) with `showErrorState()`:

```javascript
document.addEventListener('DOMContentLoaded', async function() {
    console.log('PE OS Memo Builder initialized');

    await PEAuth.initSupabase();
    const auth = await PEAuth.checkAuth();
    if (!auth) return;

    const urlParams = new URLSearchParams(window.location.search);
    const memoId = urlParams.get('id');
    const createNew = urlParams.get('new') === 'true';
    const dealId = urlParams.get('dealId');
    const projectName = urlParams.get('project');
    const templateId = urlParams.get('templateId');
    const demoMode = urlParams.get('demo') === 'true';

    if (demoMode) {
        // Explicitly requested demo mode
        loadDemoData();
    } else if (memoId) {
        // Load existing memo by ID
        showLoadingState('Loading memo...');
        const loaded = await loadMemoFromAPI(memoId);
        hideLoadingState();
        if (!loaded) {
            showErrorState('Memo not found');
            return;
        }
    } else if (dealId) {
        // Has dealId — find existing memos or create new
        showLoadingState('Loading memo...');
        const memos = await listMemosAPI({ dealId });
        hideLoadingState();

        if (memos.length > 1) {
            // Multiple memos — show picker (Task 3)
            showMemoPicker(memos, dealId);
            return;
        } else if (memos.length === 1) {
            // Single memo — load it directly
            showLoadingState('Loading memo...');
            const loaded = await loadMemoFromAPI(memos[0].id);
            hideLoadingState();
            if (!loaded) {
                showErrorState('Failed to load memo');
                return;
            }
            updateURLWithMemoId(memos[0].id);
        } else {
            // No memos — create new with auto-generation
            state.isGenerating = true;
            showGeneratingOverlay();
            const created = await createNewMemo({ dealId });
            state.isGenerating = false;
            hideGeneratingOverlay();
            if (!created) {
                showErrorState('Failed to create memo. Make sure the memo database tables are set up.');
                return;
            }
        }
    } else if (createNew) {
        // Create blank memo (no deal)
        showLoadingState('Creating memo...');
        const created = await createNewMemo({
            projectName: projectName || 'New Investment Memo',
            templateId: templateId || undefined,
        });
        hideLoadingState();
        if (!created) {
            showErrorState('Failed to create memo');
            return;
        }
    } else {
        // No params at all — show error
        showErrorState('No deal or memo specified. Open this page from a deal.');
        return;
    }

    // Auto-generate content if all sections are empty
    await autoGenerateIfEmpty();

    // Render UI
    renderSidebar();
    renderSections();
    renderMessages();
    renderPromptChips();

    // Setup event handlers
    setupEventHandlers();
    setupDragDrop();

    // Update AI status indicator
    updateModeIndicators();
});
```

- [ ] **Step 4: Verify no other files reference loadDemoData as fallback**

Search for `loadDemoData` across all memo files. It should only be called from the `demoMode` branch.

- [ ] **Step 5: Commit**

```bash
git add apps/web/memo-builder.js
git commit -m "fix(memo): remove demo data fallback, show proper error states"
```

---

### Task 3: Add Memo Picker for Multi-Memo Deals

**Files:**
- Modify: `apps/web/memo-builder.js` (add `showMemoPicker` function after `showErrorState`)

When a deal has multiple memos, show a selection modal instead of always loading the first one.

- [ ] **Step 1: Add the memo picker function**

Add after `showErrorState()` in `memo-builder.js`:

```javascript
function showMemoPicker(memos, dealId) {
    const overlay = document.createElement('div');
    overlay.id = 'memo-picker-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';

    const statusColors = {
        DRAFT: 'bg-amber-100 text-amber-700',
        REVIEW: 'bg-blue-100 text-blue-700',
        FINAL: 'bg-green-100 text-green-700',
        ARCHIVED: 'bg-gray-100 text-gray-500',
    };

    const memoCards = memos.map(m => {
        const sc = statusColors[m.status] || statusColors.DRAFT;
        const edited = m.updatedAt ? formatRelativeTime(new Date(m.updatedAt)) : 'Unknown';
        return `
            <button class="memo-pick-btn w-full text-left p-4 rounded-lg border border-slate-200 hover:border-primary/40 hover:shadow-sm transition-all group"
                    data-memo-id="${m.id}">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-slate-900 group-hover:text-primary transition-colors">${m.projectName || m.title || 'Untitled Memo'}</h4>
                    <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${sc}">${m.status}</span>
                </div>
                <p class="text-xs text-slate-500">${m.title || 'Investment Committee Memo'} &middot; Last edited ${edited}</p>
            </button>
        `;
    }).join('');

    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div class="px-6 py-5 border-b border-slate-100">
                <h3 class="text-lg font-bold text-slate-900">Select Memo</h3>
                <p class="text-sm text-slate-500 mt-1">This deal has ${memos.length} memos. Pick one to open or create a new one.</p>
            </div>
            <div class="p-6 flex flex-col gap-3 max-h-[50vh] overflow-y-auto">
                ${memoCards}
            </div>
            <div class="px-6 py-4 border-t border-slate-100 flex justify-between">
                <button onclick="history.back()" class="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                <button id="create-new-memo-btn" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style="background:#003366">
                    <span class="material-symbols-outlined text-[16px]">add</span>
                    New Memo
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Click handlers for memo selection
    overlay.querySelectorAll('.memo-pick-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            overlay.remove();
            showLoadingState('Loading memo...');
            const loaded = await loadMemoFromAPI(btn.dataset.memoId);
            hideLoadingState();
            if (loaded) {
                updateURLWithMemoId(btn.dataset.memoId);
                renderSidebar();
                renderSections();
                renderMessages();
                renderPromptChips();
                setupEventHandlers();
                setupDragDrop();
                updateModeIndicators();
            } else {
                showErrorState('Failed to load memo');
            }
        });
    });

    // Create new memo button
    document.getElementById('create-new-memo-btn').addEventListener('click', async () => {
        overlay.remove();
        state.isGenerating = true;
        showGeneratingOverlay();
        const created = await createNewMemo({ dealId });
        state.isGenerating = false;
        hideGeneratingOverlay();
        if (created) {
            renderSidebar();
            renderSections();
            renderMessages();
            renderPromptChips();
            setupEventHandlers();
            setupDragDrop();
            updateModeIndicators();
        } else {
            showErrorState('Failed to create memo');
        }
    });
}
```

- [ ] **Step 2: Verify the picker appears when deal has multiple memos**

Test by manually creating 2 memos for the same deal (via API or Supabase), then opening the memo builder with `?dealId=<dealId>`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/memo-builder.js
git commit -m "feat(memo): add memo picker modal for deals with multiple memos"
```

---

### Task 4: Fix Broken Chart Images in Sections

**Files:**
- Modify: `apps/web/memo-sections.js:167-183`

The demo data has `chartImage: null` which renders a broken `<img>` tag. Replace the static image approach with a Chart.js canvas fallback, and handle `null` gracefully.

- [ ] **Step 1: Fix the chart rendering logic**

In `apps/web/memo-sections.js`, replace the chart HTML block (lines ~167-183):

```javascript
    let chartHtml = '';
    if (section.hasChart) {
        if (section.chartImage) {
            // Real image URL provided
            chartHtml = `
                <div class="relative w-full h-64 rounded-lg bg-white border border-slate-200 overflow-hidden group/chart mb-2">
                    <img alt="${section.chartCaption || 'Chart'}" class="w-full h-full object-cover object-left-top opacity-90" src="${section.chartImage}"/>
                    <div class="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-4 py-2 border-t border-slate-100">
                        <p class="text-xs font-semibold text-slate-700">${section.chartCaption || ''}</p>
                    </div>
                </div>
                ${section.chartNote ? `<p class="text-xs text-slate-400 italic mb-2">${section.chartNote}</p>` : ''}
            `;
        } else {
            // No image — show placeholder that AI can fill with Chart.js
            chartHtml = `
                <div class="w-full h-48 rounded-lg bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center mb-2">
                    <span class="material-symbols-outlined text-slate-400 text-2xl mb-2">insert_chart</span>
                    <p class="text-xs text-slate-400">${section.chartCaption || 'Chart will be generated by AI'}</p>
                </div>
            `;
        }
    }
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/memo-sections.js
git commit -m "fix(memo): handle null chart images gracefully, show placeholder instead of broken img"
```

---

### Task 5: Remove Simulated AI Responses

**Files:**
- Modify: `apps/web/memo-chat.js:217-222` (fallback branch)
- Modify: `apps/web/memo-chat.js:260-340` (generateAIResponse function)

Replace simulated responses with an "AI Offline" message so users aren't misled.

- [ ] **Step 1: Replace the simulated fallback**

In `apps/web/memo-chat.js`, replace the fallback branch (lines ~217-222):

```javascript
    } else {
        // AI unavailable — show offline message instead of simulated response
        const offlineMsg = {
            id: `m${Date.now()}`,
            role: 'assistant',
            content: `<p class="text-amber-700"><span class="material-symbols-outlined text-[16px] align-middle mr-1">cloud_off</span> <strong>AI Analyst is offline.</strong></p>
            <p class="mt-1 text-sm text-amber-600">The AI service is currently unavailable. Check that your OpenAI API key is configured and try again.</p>`,
            timestamp: 'Just now'
        };
        state.messages.push(offlineMsg);
        renderMessages();
    }
```

- [ ] **Step 2: Remove the generateAIResponse function**

Delete the entire `generateAIResponse` function (lines ~260-340). It's the simulated fallback that returns fake responses.

- [ ] **Step 3: Commit**

```bash
git add apps/web/memo-chat.js
git commit -m "fix(memo): replace simulated AI responses with offline message"
```

---

### Task 6: Add Proactive AI Welcome Message

**Files:**
- Modify: `apps/web/memo-api.js` (add data completeness check after memo load)
- Modify: `apps/web/memo-builder.js` (post proactive message after generation)

After a memo is generated (or loaded), the AI should proactively assess what data is available and what's missing.

- [ ] **Step 1: Add a data completeness assessment function**

In `apps/web/memo-builder.js`, add after the `autoGenerateIfEmpty` function:

```javascript
// ============================================================
// Proactive AI — Assess data completeness after memo load
// ============================================================
async function postProactiveWelcome() {
    if (!state.memo?.dealId) return;

    // Fetch deal data to assess completeness
    let deal = null;
    try {
        const resp = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.memo.dealId}`);
        if (resp.ok) deal = await resp.json();
    } catch (e) { /* ignore */ }

    if (!deal) return;

    const dealName = deal.name || state.memo.projectName || 'this deal';
    const docs = deal.documents || [];
    const financials = deal.financialStatements || [];
    const docCount = docs.length;
    const periodCount = financials.length;

    // Assess missing data
    const missing = [];
    if (!deal.industry) missing.push('**Industry** — needed for market dynamics section');
    if (!deal.dealSize && !deal.revenue) missing.push('**Revenue / Deal Size** — needed for valuation analysis');
    if (!deal.ebitda) missing.push('**EBITDA** — needed for financial performance and deal structure');
    if (periodCount === 0) missing.push('**Financial statements** — upload a CIM or Excel model for detailed analysis');
    if (docCount === 0) missing.push('**Documents** — upload CIMs, teasers, or models to the Data Room for richer analysis');

    const sectionCount = state.sections.filter(s => s.content && s.content.trim()).length;

    let messageHtml = `<p class="font-medium text-primary">Memo generated for ${dealName}</p>`;
    messageHtml += `<p class="mt-2">I've created <strong>${sectionCount} sections</strong>`;
    if (periodCount > 0) messageHtml += ` using <strong>${periodCount} financial periods</strong>`;
    if (docCount > 0) messageHtml += ` and <strong>${docCount} documents</strong>`;
    messageHtml += ` from the deal data.</p>`;

    if (missing.length > 0) {
        messageHtml += `<p class="mt-3 font-medium text-amber-700">Missing data that would strengthen the memo:</p>`;
        messageHtml += `<ul class="mt-1 list-disc pl-5 text-sm text-slate-600">`;
        missing.forEach(m => { messageHtml += `<li>${m}</li>`; });
        messageHtml += `</ul>`;
        messageHtml += `<p class="mt-2 text-sm text-slate-500">You can add this data on the deal page or ask me to work with what we have.</p>`;
    } else {
        messageHtml += `<p class="mt-2 text-sm text-slate-500">All key data looks good. Ask me to refine sections, add charts, or rewrite for tone.</p>`;
    }

    // Only post if no existing conversation (fresh memo)
    if (state.messages.length <= 1) {
        state.messages = [{
            id: 'proactive-welcome',
            role: 'assistant',
            content: messageHtml,
            timestamp: formatTime(new Date()),
        }];
        renderMessages();
    }
}
```

- [ ] **Step 2: Call proactive welcome after generation completes**

In the `DOMContentLoaded` handler, right after `await autoGenerateIfEmpty();` and before `renderMessages();`, add:

```javascript
    // Post proactive welcome with data completeness assessment
    await postProactiveWelcome();
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/memo-builder.js
git commit -m "feat(memo): proactive AI welcome message with data completeness assessment"
```

---

### Task 7: Database Migration for Organization Scoping

**Files:**
- Create: `apps/api/memo-org-migration.sql`

The Memo table is missing `organizationId` which the API routes already expect.

- [ ] **Step 1: Create the migration file**

```sql
-- Memo Builder: Add organizationId for org-scoping
-- Run this in Supabase SQL Editor

-- Add organizationId column to Memo table
ALTER TABLE "Memo" ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES "Organization"(id);

-- Create index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_memo_org ON "Memo"("organizationId");

-- Backfill existing memos from their deal's organization
UPDATE "Memo" m
SET "organizationId" = d."organizationId"
FROM "Deal" d
WHERE m."dealId" = d.id
  AND m."organizationId" IS NULL;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/memo-org-migration.sql
git commit -m "feat(memo): add organizationId migration for org-scoping"
```

- [ ] **Step 3: Run the migration**

Execute `memo-org-migration.sql` in the Supabase SQL Editor. This is a manual step — the migration is non-destructive (uses `IF NOT EXISTS`).

---

### Task 8: Update Header with Real Deal Data

**Files:**
- Modify: `apps/web/memo-builder.js` (updateHeader function, line ~293)

The header already reads from `state.memo` fields. We just need to make sure `dealId` is preserved on the state so breadcrumbs link correctly.

- [ ] **Step 1: Ensure dealId is stored in state.memo**

In `apps/web/memo-api.js`, inside `loadMemoFromAPI` (around line 142), ensure the `dealId` is included:

```javascript
        state.memo = {
            id: memo.id,
            dealId: memo.dealId || null,
            title: memo.title,
            projectName: memo.projectName || memo.deal?.name || 'Untitled Project',
            type: memo.type,
            status: memo.status,
            lastEdited: formatRelativeTime(new Date(memo.updatedAt)),
            sponsor: memo.sponsor || '',
            date: memo.memoDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            collaborators: [],
        };
```

The key addition is `dealId: memo.dealId || null`. This ensures `updateHeader()` can build proper breadcrumbs with a link back to the deal page.

- [ ] **Step 2: Commit**

```bash
git add apps/web/memo-api.js
git commit -m "fix(memo): include dealId in state for breadcrumb navigation"
```

---

### Task 9: End-to-End Verification

No files modified — this is a manual verification task.

- [ ] **Step 1: Test the happy path**

1. Go to a deal page (e.g., Luktara Industries)
2. Scroll to AI Financial Analysis section
3. Click "Open Memo Builder"
4. Verify: URL shows `?dealId=<uuid>` (not `?id=`)
5. Verify: Loading state appears ("Generating Investment Memo" or "Loading memo...")
6. Verify: Memo loads with real deal name in header, not "Project Apollo"
7. Verify: Sections contain content based on actual deal data
8. Verify: Proactive welcome message shows data completeness
9. Verify: Breadcrumb links back to the deal page

- [ ] **Step 2: Test the chat**

1. Type a message in the chat input
2. Verify: Response comes from real AI (not simulated)
3. If AI is offline, verify: "AI Analyst is offline" message appears (no fake response)
4. Test a prompt chip (e.g., "Revenue Growth")

- [ ] **Step 3: Test multi-memo**

1. Open memo builder for the same deal again
2. Verify: It loads the existing memo (no duplicate created)
3. Create a second memo via the memo picker's "New Memo" button
4. Verify: Picker shows both memos next time

- [ ] **Step 4: Test error states**

1. Open `/memo-builder.html` with no params
2. Verify: Error state with "No deal or memo specified" message
3. Open `/memo-builder.html?id=invalid-uuid`
4. Verify: Error state with "Memo not found" message
5. Open `/memo-builder.html?demo=true`
6. Verify: Demo data still works for demo mode

- [ ] **Step 5: Test broken images**

1. Verify no broken image icons in any section
2. If a section has `hasChart: true` but no chartImage, verify placeholder shows instead of broken `<img>`
