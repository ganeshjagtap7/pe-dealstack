# Org Isolation Test Checklist

**What is this?** PE OS supports multiple firms (organizations). Firm A's deals, contacts, documents, and chats must be completely invisible to Firm B. This checklist verifies that — both via automated API tests and manual UI testing.

**Tester:** _______________
**Date:** _______________

---

## Part A: Automated API Tests (5 min)

We have 34 automated tests that verify org isolation at the API level. Run these first — if they pass, the backend is solid and you only need to verify the UI behavior manually.

### Prerequisites

1. **API server must be running:** `cd apps/api && npm run dev`
2. **Two Supabase accounts in different orgs.** Both must have at least 1 deal and 1 contact.
3. **Update credentials** in `apps/api/.env.test`:

```
TEST_ORG_A_EMAIL="your-org-a@email.com"
TEST_ORG_A_PASSWORD="password"
TEST_ORG_B_EMAIL="your-org-b@email.com"
TEST_ORG_B_PASSWORD="password"
```

> If Org B account doesn't exist yet, sign up at the app login page first (use a different firm name). Then create at least 1 deal and 1 contact in that org.

### Run

```bash
cd apps/api
npm run test:org-isolation
```

### What it tests (34 tests)

| Category | Tests | What it checks |
|---|---|---|
| Deals | 3 | Org B can't see/access Org A deals |
| Documents | 5 | Can't view/download/edit/delete cross-org docs |
| Folders | 5 | Can't view/edit/list cross-org folders + insights |
| Deal Chat | 3 | Can't read/send/delete cross-org chat |
| Deal Team | 2 | Can't view/add cross-org team members |
| Contacts | 5 | Can't see/interact with cross-org contacts |
| Contact Insights | 2 | Scores and network stats only count own org |
| Portfolio | 1 | Deal lists have zero overlap between orgs |
| Same-Org Access | 8 | Own org data still accessible (no regressions) |

### Expected output

```
✓ Org Isolation — Cross-Org Access Blocked (26 tests)
✓ Org Isolation — Same-Org Access Works (8 tests)

Test Files  1 passed (1)
Tests       34 passed (34)
```

If all 34 pass, mark Part A as PASS and move to Part B.

| Part A Result | Status | Notes |
|---|---|---|
| Automated API Tests (34) | PASS / FAIL | |

---

## Part B: Manual UI Testing (20 min)

These tests verify the UI behaves correctly when a user tries to access another org's data. You need 2 browser windows side by side.

### Setup

1. Open **Browser Window 1** — log in as Org A
2. Open **Browser Window 2** (incognito) — log in as Org B
3. In **both** windows, make sure you have:
   - At least 1 deal (name it `[OrgName] Test Deal` so you can tell them apart)
   - At least 1 contact
   - At least 1 document uploaded to a deal's Data Room
   - At least 1 chat message sent on a deal

### Tests

#### Deals Page

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 1 | Deal list isolation | Open Deals page in both windows. Count deals. | Each org sees ONLY their own deals. No overlap. | |
| 2 | Deal URL blocked | In Org A, copy a deal's URL. Paste in Org B's browser. | Org B sees "Deal not found" or gets redirected. NOT Org A's deal. | |

#### Data Room (VDR)

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 3 | Folder list isolation | Open Data Room on your test deal in both windows. | Each org sees only their own folders. | |
| 4 | Document list isolation | Click into a folder in both windows. | Each org sees only their own uploaded files. | |
| 5 | Document download blocked | In Org A, right-click a doc and copy download link. Open in Org B's browser. | Fails or "Document not found". NOT Org A's file. | |
| 6 | Folder insights blocked | In Org A, generate insights on a folder. Copy that folder's URL. Open in Org B. | Org B sees "Folder not found". | |

#### Deal Chat

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 7 | Chat history isolation | Open Deal Chat on your test deal in both windows. | Each org sees only their own messages. | |
| 8 | AI chat blocked | Copy Org A's deal URL. Paste in Org B. Try sending a message. | Fails — Org B cannot chat on Org A's deal. | |
| 9 | AI doesn't leak deals | In Org A, ask AI: "What deals do we have?" | Only Org A deal names in the response. Zero Org B names. | |

#### Contacts

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 10 | Contact list isolation | Open Contacts page in both windows. | Each org sees only their own contacts. | |
| 11 | Contact URL blocked | Copy Org A contact URL. Open in Org B. | "Contact not found" or empty. NOT Org A's data. | |
| 12 | Scores are org-scoped | Check relationship badges (Cold/Warm/Active/Strong) on contacts page. | Scores based only on your org's data — not inflated. | |

#### Deal Team

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 13 | Team list blocked | Open Org A's deal Team tab. Copy URL. Open in Org B. | Org B cannot see Org A's team. | |

#### AI Features

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 14 | Portfolio chat isolation | Ask AI: "Summarize all deals" or "Show pipeline". | Only YOUR org's deals in the response. | |
| 15 | Meeting prep isolation | Open a deal > Menu > Meeting Prep. | Brief only uses your deal's data. | |

#### Same-Org Happy Path

**Goal:** Users within the SAME org should see ALL shared data. Nothing hidden.

| # | Test | Steps | Expected | Pass? |
|---|------|-------|----------|-------|
| 16 | Same-org sees all deals | If Org A has 2 users, log in as both. | Both see the exact same deal list. | |
| 17 | Same-org sees all docs | Both users open Data Room on same deal. | Same files visible to both. | |
| 18 | Same-org sees chat | Both users open Chat on same deal. | Same messages visible to both. | |

---

## Quick Smoke Test (5 min)

If short on time:

1. Run `npm run test:org-isolation` — all 34 API tests pass
2. **Test #1** — Deals page shows only your org's deals
3. **Test #5** — Can't download another org's document
4. **Test #8** — Can't chat on another org's deal
5. **Test #10** — Contacts page shows only your org's contacts

---

## Results Summary

| Section | Status | Notes |
|---------|--------|-------|
| **Part A: Automated (34 tests)** | PASS / FAIL | |
| **Part B: Manual (#1-18)** | PASS / FAIL | |

**Individual Results:**

| Test # | Status | Notes |
|--------|--------|-------|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |
| 6 | | |
| 7 | | |
| 8 | | |
| 9 | | |
| 10 | | |
| 11 | | |
| 12 | | |
| 13 | | |
| 14 | | |
| 15 | | |
| 16 | | |
| 17 | | |
| 18 | | |

**Overall:** PASS / FAIL
**Tested by:** _______________
**Date:** _______________
