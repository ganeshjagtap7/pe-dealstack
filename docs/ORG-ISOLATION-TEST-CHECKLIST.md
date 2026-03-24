# Org Isolation & Multi-Tenancy — Test Checklist

**Date:** 2026-03-24
**Commits:** `164fac3`, `f07243a`, `fef3302`
**Tester:** _______________

---

## What Changed

We added organization-level data isolation across 11 API route files (33 endpoints). Every API endpoint now verifies that the requesting user's organization owns the resource before returning data. Wrong-org requests get `404 Not Found` (not 403 — to prevent attackers from knowing the resource exists).

## What You Need

- **2 test accounts in DIFFERENT organizations** (Org A and Org B)
- **1 deal, 1 contact, 1 document, 1 folder in each org** (minimum)
- Browser DevTools open (Network tab) to inspect API responses
- Postman or curl (optional, for direct API testing)

---

## How to Test

For each test below:
1. Log in as **Org A** user
2. Copy the UUID of the resource from the URL bar or Network tab
3. Log in as **Org B** user
4. Try to access that UUID via the UI or direct API call
5. **Expected:** 404 Not Found (never see Org A's data)

---

## Test Cases

### P0 — Documents (5 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 1 | View document | As Org B, call `GET /api/documents/{orgA-docId}` | 404 |
| 2 | Download document | As Org B, call `GET /api/documents/{orgA-docId}/download` | 404 |
| 3 | Edit document | As Org B, call `PATCH /api/documents/{orgA-docId}` with `{"name":"hacked"}` | 404 |
| 4 | Delete document | As Org B, call `DELETE /api/documents/{orgA-docId}` | 404 |
| 5 | List folder docs | As Org B, call `GET /api/folders/{orgA-folderId}/documents` | 404 |

**Same-org check:** As Org A user, verify all 5 actions work normally on Org A's documents.

---

### P0 — Deal Chat (3 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 6 | Read chat history | As Org B, call `GET /api/deals/{orgA-dealId}/chat/history` | 404 |
| 7 | Delete chat history | As Org B, call `DELETE /api/deals/{orgA-dealId}/chat/history` | 404 |
| 8 | Send AI chat | As Org B, call `POST /api/deals/{orgA-dealId}/chat` with `{"message":"test"}` | 404 |

**Same-org check:** Open Deal Chat on your own deal — chat history loads, AI responds.

---

### P1 — Deal Team (4 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 9 | View team | As Org B, call `GET /api/deals/{orgA-dealId}/team` | 404 |
| 10 | Add member | As Org B, call `POST /api/deals/{orgA-dealId}/team` with `{"userId":"..."}` | 404 |
| 11 | Update member role | As Org B, call `PATCH /api/deals/{orgA-dealId}/team/{memberId}` | 404 |
| 12 | Remove member | As Org B, call `DELETE /api/deals/{orgA-dealId}/team/{memberId}` | 404 |

**Same-org check:** Add/remove a team member on your own deal — works normally.

---

### P1 — Contact Connections (6 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 13 | Add interaction | As Org B, `POST /api/contacts/{orgA-contactId}/interactions` | 404 |
| 14 | Link to deal | As Org B, `POST /api/contacts/{orgA-contactId}/deals` with `{"dealId":"..."}` | 404 |
| 15 | Unlink from deal | As Org B, `DELETE /api/contacts/{orgA-contactId}/deals/{dealId}` | 404 |
| 16 | List connections | As Org B, `GET /api/contacts/{orgA-contactId}/connections` | 404 |
| 17 | Create connection | As Org B, `POST /api/contacts/{orgA-contactId}/connections` | 404 |
| 18 | Delete connection | As Org B, `DELETE /api/contacts/{orgA-contactId}/connections/{connId}` | 404 |

**Same-org check:** Add an interaction and link a contact to a deal in your own org — works.

---

### P2 — Conversations (2 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 19 | List conversations | As Org B, `GET /api/conversations` | Only sees Org B conversations |
| 20 | Read messages | As Org B, `GET /api/conversations/{orgA-convId}/messages` | 404 |

---

### P2 — Folders (3 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 21 | View folder | As Org B, `GET /api/folders/{orgA-folderId}` | 404 |
| 22 | Rename folder | As Org B, `PATCH /api/folders/{orgA-folderId}` with `{"name":"hacked"}` | 404 |
| 23 | Delete folder | As Org B, `DELETE /api/folders/{orgA-folderId}` | 404 |

---

### P2 — Contact Insights (2 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 24 | Relationship scores | As Org A, `GET /api/contacts/insights/scores` | Only Org A contact scores (no Org B data in counts) |
| 25 | Network stats | As Org A, `GET /api/contacts/insights/network` | Only Org A contacts in `mostConnected` list |

**How to verify:** Check that `totalContacts` matches Org A's contact count, not the total DB count.

---

### P2 — Folder Insights (3 endpoints)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 26 | Get insights | As Org B, `GET /api/folders/{orgA-folderId}/insights` | 404 |
| 27 | Write insights | As Org B, `POST /api/folders/{orgA-folderId}/insights` | 404 |
| 28 | Generate AI insights | As Org B, `POST /api/folders/{orgA-folderId}/generate-insights` | 404 |

---

### Portfolio Chat (1 endpoint)

| # | Action | How to Test | Expected |
|---|--------|-------------|----------|
| 29 | Portfolio chat | As Org A, `POST /api/portfolio/chat` with `{"message":"show all deals"}` | Only Org A deals in response |

**How to verify:** Response should not mention any Org B deal names.

---

## Quick Smoke Test (5 min version)

If short on time, test these 5 critical scenarios:

1. **Document download cross-org** (test #2) — most dangerous if broken
2. **Deal chat cross-org** (test #8) — AI could leak deal data
3. **Contact interaction cross-org** (test #13) — writes data to wrong org
4. **Folder delete cross-org** (test #23) — destructive operation
5. **Same-org happy path** — log in as Org A, do normal work, nothing broken

---

## Result Template

| Test # | Status | Notes |
|--------|--------|-------|
| 1 | PASS / FAIL | |
| 2 | PASS / FAIL | |
| 3 | PASS / FAIL | |
| ... | ... | |
| 29 | PASS / FAIL | |

**Overall:** PASS / FAIL
**Tested by:** _______________
**Date:** _______________
