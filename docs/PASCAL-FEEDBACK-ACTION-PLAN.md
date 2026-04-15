# Pascal Feedback — Filtered Action Plan

> Source: Beta User Discovery Call with Pascal Samsoon (April 7, 2026)
> Filter: What matters to PE OS right now — not everything he said.

Pascal is a solo search fund buyer ($200K-$3M deals, 300+ reviewed). His feedback is valuable but colored by his micro-acquirer lens. Below is what we take, what we adapt, and what we park.

---

## Summary Matrix

| Feedback Item | Verdict | Why |
|---|---|---|
| Deal-level external sharing | **BUILD** | Viral loop + real pain point |
| Document request from sellers/brokers | **BUILD (lite)** | Solves data gap without overbuilding |
| Improve deal import UX | **POLISH** | Already built, needs smoother flow |
| Memo template library | **POLISH** | Exists but needs selectable templates |
| Usage-based pricing | **PARK** | Business decision, not engineering |
| Solo Searcher tier | **PARK** | Pricing strategy — post-beta |
| Notion import | **PARK** | Low ROI, CSV import covers 80% |
| Seller Readiness Package | **PARK** | Big vision, not beta scope |

---

## TIER 1 — Build Now (High Impact, Directly Actionable)

### 1. Deal-Level External Sharing ("Multiplayer Mode")
**What Pascal said:** "I need to add my healthcare partner for healthcare deals, my marketing agency partner for agency deals. Just the ones where we collaborate."

**What we already have:** `DealTeamMember` table + `deals-team.ts` route. Team invitations exist for org-level users.

**What's missing:** Ability to invite an external person (by email) to view a specific deal without joining the full org. They get read-only (or scoped) access to that one deal's data room, financials, and memos.

**Why it matters beyond Pascal:**
- Built-in referral mechanism (invited collaborators see the product)
- Every deal platform (Notion, Dealogic) has this — table stakes
- Low complexity — extends existing DealTeamMember infrastructure

**Action items:**
- [ ] Design external collaborator role (e.g., `EXTERNAL_VIEWER` on DealTeamMember)
- [ ] Build invite-by-email flow for a specific deal (reuse invitation system patterns)
- [ ] Scoped access: external user sees only the deal they were invited to (VDR, financials, memos)
- [ ] Landing experience: invited user gets a magic link, creates account (or logs in), lands on that deal
- [ ] Dashboard for deal owner: see who has access to each deal, revoke access

---

### 2. Document Request System (Lite)
**What Pascal said:** "The bottleneck is the quality of information the seller can provide me. Brokers didn't even ask for the balance sheet."

**What we already have:** Nothing — no document request flow exists.

**What to build (lite version, NOT the full "Seller Readiness Package"):**
A simple way for a PE OS user to send a structured document request to a broker/seller via email, with a checklist of what's needed.

**Action items:**
- [ ] Pre-built document checklist templates (e.g., "Standard DD Package": P&L 3yr, Balance Sheet, Cash Flow, Tax Returns, Customer Concentration)
- [ ] "Request Documents" button on deal page — opens modal with checklist
- [ ] Sends email (via Resend) to broker/seller with: deal name, list of requested docs, optional message
- [ ] Track request status per deal (Requested / Partially Received / Complete)
- [ ] Optional: public upload link where seller/broker can drag-and-drop files directly into the deal's VDR

---

## TIER 2 — Polish Existing (Already Built, Needs Refinement)

### 3. Deal Import Flow
**What Pascal said:** "Google Sheet CSV upload makes it easier, but Notion is more painstaking."

**What we have:** Full 4-step import modal (Upload > Map Columns > Preview > Result) with GPT-4o column mapping.

**What to polish:**
- [ ] Test import with real Acquire.com export data (Pascal will provide)
- [ ] Add "paste from clipboard" as a more prominent option (Pascal copies from browser)
- [ ] Better error messaging when columns don't map cleanly
- [ ] Post-import: show summary of what was created, with links to each deal

### 4. Memo Template Library
**What Pascal said:** Confirmed template upload was useful. He uses custom AI prompts for memo generation today.

**What we have:** Memo builder exists (`memo-builder.js`, `memo-editor.js`) with `templateId` support.

**What to polish:**
- [ ] Add 3-5 pre-built memo templates (Investment Memo, Deal Screening, LOI Summary, QoE Summary)
- [ ] Template picker UI when starting a new memo
- [ ] Allow users to save their own memo as a template for reuse

---

## TIER 3 — Park (Valid But Not Now)

### 5. Usage-Based Pricing
**Pascal's point:** "$10/month for 10 deals, $150 for 500 deals. Think about API costs."

**Why we park it:** Pricing is a business/strategy decision. We don't have enough usage data from beta to model costs yet. Revisit after 30 days of beta usage data.

**When to revisit:** After beta, when we have real API cost data per user.

### 6. Solo Searcher Tier
**Pascal's point:** Product feels overbuilt for sub-$1M deals.

**Why we park it:** This is positioning and packaging, not engineering. The product works for solo users — they just don't need every feature. A "Solo" plan with feature gating is a post-beta conversation.

### 7. Notion Import
**Pascal's point:** "Notion migration is more painstaking."

**Why we park it:** Notion's export format is JSON/Markdown, highly variable per workspace. CSV import already covers the Google Sheets/Excel crowd. Notion integration is high effort, low user count. If multiple beta users request it, reconsider.

### 8. Seller Readiness Package
**Pascal's point:** "A tool to help sellers get financials ready is a gold mine."

**Why we park it:** This is a new product line, not a feature. It requires seller-facing UI, onboarding, and a completely different GTM. It's a valid post-beta expansion opportunity — not beta scope. Capture it in the product roadmap for Q3/Q4 evaluation.

---

## Quick Wins (From Pascal's Call, No Design Needed)

- [ ] **Broker document checklist:** Static PDF/page that lists "what buyers need" — can be shared with brokers immediately. Zero engineering, high goodwill.
- [ ] **Onboarding hint for deal import:** If user has 0 deals, show "Import your existing deals" CTA pointing to the import modal.
- [ ] **Deal count on dashboard:** Pascal has 300+ deals — make sure the CRM page handles large deal lists performantly (pagination, search).

---

## What We Explicitly Do NOT Do

| Suggestion | Why Not |
|---|---|
| Build for Acquire.com integration | One platform, one user. Not generalizable yet. |
| Redesign for micro-acquirers specifically | Our ICP is PE teams. Solo users benefit but don't drive design. |
| Add AI query limits / metering now | Premature optimization — wait for real usage data. |
| Build seller-facing portal | New product, not a feature. Post-beta. |

---

## Owner Assignments

| Item | Owner | Timeline |
|---|---|---|
| Deal-level external sharing | Ganesh | Next sprint |
| Document request (lite) | Ganesh | Next sprint |
| Deal import polish | Ganesh | This week (when Pascal sends data) |
| Memo template library | Ganesh | Next sprint |
| Broker document checklist (static) | Ritish | This week |
| Pricing model research | Dev + Ritish | Post-beta (30 days) |
| Solo Searcher persona doc | Dev + Ritish | Before beta pricing finalized |
| Pascal weekly feedback form | Ritish | This week |
| WhatsApp group setup | Dev | This week |
