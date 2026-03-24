# Org Isolation Test Checklist

**What is this?** PE OS supports multiple firms (organizations). Firm A's deals, contacts, documents, and chats must be completely invisible to Firm B. This checklist verifies that.

**Tester:** _______________
**Date:** _______________

---

## Setup (10 min)

You need 2 browser windows — one for each firm. Use incognito/private window for the second account so sessions don't clash.

### Step 1: Log in to both accounts

| | Browser Window 1 | Browser Window 2 |
|---|---|---|
| **Account** | Org A credentials | Org B credentials |
| **Email** | _______________ | _______________ |

### Step 2: Create test data in BOTH orgs

Do these in **both** windows:

1. **Create a deal** — name it `[OrgName] Test Deal` (e.g., "Alpha Test Deal", "Beta Test Deal")
2. **Add a contact** — name it `[OrgName] Test Contact`
3. **Upload a document** — any small PDF to the deal's Data Room
4. **Send a chat message** — open the deal, go to Chat tab, send "Hello"
5. **Add a team member** — if you have a second user in the org, add them to the deal

Note down how many deals/contacts each org has — you'll need this to verify counts later.

---

## Part 1: Deals Page

**Goal:** Each firm only sees their own deals.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 1 | Deal list is org-scoped | Open Deals page in both windows. Count the deals. | Org A sees only Org A deals. Org B sees only Org B deals. No overlap. |
| 2 | Deal detail is org-scoped | In Org A window, open "Alpha Test Deal" and copy the deal ID from the URL. In Org B window, paste that URL. | Org B should see "Deal not found" or get redirected — NOT see Alpha's deal. |

---

## Part 2: Data Room (VDR)

**Goal:** Documents and folders from one firm are invisible to the other.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 3 | Folder list is org-scoped | Open the Data Room on your test deal in both windows. | Each org sees only their own folders. |
| 4 | Document list is org-scoped | Click into a folder in both windows. | Each org sees only their own uploaded files. |
| 5 | Document download blocked cross-org | In Org A, right-click a document and copy the download link. Open that link in Org B's browser. | Should fail / show "Document not found". Not download Org A's file. |
| 6 | Folder insights blocked cross-org | In Org A, click "Generate Insights" on a folder (if available). Then try accessing that folder's URL from Org B's browser. | Org B gets "Folder not found". |

---

## Part 3: Deal Chat

**Goal:** Chat conversations and AI responses are deal-scoped, and deals are org-scoped.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 7 | Chat history is org-scoped | Open Deal Chat on your test deal in both windows. | Each org sees only their own chat messages. |
| 8 | AI chat blocked cross-org | Copy Org A's deal URL (with deal ID). Paste in Org B's browser window. Try sending a chat message. | Should fail — Org B cannot chat on Org A's deal. |
| 9 | Chat doesn't leak deal names | In Org A, ask the AI: "What deals do we have?" | Response should only mention Org A deals. No Org B deal names. |

---

## Part 4: Contacts

**Goal:** Each firm's contacts, interactions, and relationship data are isolated.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 10 | Contact list is org-scoped | Open Contacts page in both windows. | Each org sees only their own contacts. Counts match what you created. |
| 11 | Contact detail blocked cross-org | Copy Org A contact's URL. Open in Org B's browser. | "Contact not found" or empty page. NOT Org A's contact details. |
| 12 | Add interaction blocked cross-org | On Org A's contact page, note the contact ID. In Org B, try adding a Note/Call log via API (Postman) to that contact ID. | Should fail with 404. |
| 13 | Relationship scores are org-scoped | Open Contacts page, check the relationship strength badges (Cold/Warm/Active/Strong). | Scores are based only on your org's interactions — not inflated by other org's data. |

---

## Part 5: Deal Team

**Goal:** Team members on a deal are only visible/editable by that deal's org.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 14 | Team list blocked cross-org | Open Org A's deal, go to Team tab. Copy the deal URL. Open in Org B's browser. | Org B cannot see Org A's team members. |
| 15 | Add member blocked cross-org | (Postman) As Org B, try adding a user to Org A's deal via `POST /api/deals/{orgA-dealId}/team` | 404 response. |

---

## Part 6: Portfolio & AI Features

**Goal:** AI-powered features only use data from the requesting user's org.

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 16 | Portfolio chat is org-scoped | Open Portfolio/Dashboard. Ask AI: "Summarize all deals" or "Show pipeline". | Response only mentions your org's deals. Zero mention of the other org's deals. |
| 17 | Contact enrichment is org-scoped | Click "AI Enrich" on a contact. | Results are for your contact only. |
| 18 | Meeting prep is org-scoped | Open a deal > Menu > Meeting Prep. | Brief only references your deal's data. |

---

## Part 7: Same-Org Happy Path

**Goal:** Normal users within the SAME org can see all shared data (no data hidden within an org).

| # | Test | Steps | Pass? |
|---|------|-------|-------|
| 19 | Same-org user sees all deals | If Org A has 2 users, log in as both. | Both see the same deal list. |
| 20 | Same-org user sees all contacts | Both Org A users open Contacts page. | Same contact list for both. |
| 21 | Same-org user sees all documents | Both Org A users open Data Room on same deal. | Same files visible. |
| 22 | Same-org user sees chat history | Both Org A users open Chat on same deal. | Same chat messages visible. |

---

## Quick Smoke Test (5 min)

If short on time, just do these 5:

1. **Test #1** — Deals page shows only your org's deals
2. **Test #5** — Can't download another org's document
3. **Test #8** — Can't chat on another org's deal
4. **Test #10** — Contacts page shows only your org's contacts
5. **Test #19** — Same-org users see all shared data

---

## Results

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
| 19 | | |
| 20 | | |
| 21 | | |
| 22 | | |

**Overall Result:** PASS / FAIL
**Tested by:** _______________
**Date:** _______________
**Notes:** _______________
