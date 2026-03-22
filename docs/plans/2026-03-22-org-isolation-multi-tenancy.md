# Org Isolation & Multi-Tenancy Hardening Plan

**Date:** 2026-03-22
**Branch:** feature/financial-extraction
**OWASP Classification:** A01:2021 — Broken Access Control
**Status:** PLANNED

---

## Current State

### What Works (Compliant — 17 route files)
All these routes properly use `getOrgId()` + `.eq('organizationId', orgId)` or `verifyDealAccess()`:

| Route File | Scoping Method |
|---|---|
| deals.ts | `getOrgId` + direct filter |
| contacts.ts | `getOrgId` + direct filter |
| companies.ts | `getOrgId` + direct filter |
| users.ts | `getOrgId` + direct filter + RBAC |
| tasks.ts | `getOrgId` + direct filter + RBAC |
| memos.ts | `getOrgId` + direct filter + RBAC |
| templates.ts | `getOrgId` + direct filter + RBAC |
| invitations.ts | `getOrgId` + direct filter |
| notifications.ts | `getOrgId` + direct filter |
| audit.ts | `getOrgId` + direct filter |
| activities.ts | `verifyDealAccess` |
| financials.ts | `verifyDealAccess` |
| financials-extraction.ts | `verifyDealAccess` |
| financials-merge.ts | `verifyDealAccess` |
| financials-memo.ts | `verifyDealAccess` |
| documents-upload.ts | `verifyDealAccess` |
| documents-sharing.ts | `verifyDealAccess` |
| ingest.ts / ingest-upload.ts / ingest-text.ts | `getOrgId` / `verifyDealAccess` |

### Middleware Available (already built)
- `orgScope.ts` — `orgMiddleware`, `requireOrg`, `getOrgId()`, `verifyDealAccess()`
- `rbac.ts` — 9 roles, 24 permissions, `requirePermission()`, `requireMinimumRole()`, `requireAllPermissions()`

### Tools Installed
- Trail of Bits security skills (`~/.claude/skills/trailofbits/`) — audit-context-building, entry-point-analyzer, insecure-defaults, spec-to-code-compliance
- Existing skills: `architecture-patterns`, `api-design-principles`, `error-handling-patterns`, `systematic-debugging`

---

## Vulnerabilities Found (7 route files, 19 endpoints)

### P0 — CRITICAL: Cross-Org Data Leakage

#### 1. `documents.ts` — 5 unscoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 109 | `GET /folders/:folderId/documents` | Read any folder's docs by UUID |
| 144 | `GET /documents/:id` | Read any document metadata |
| 173 | `PATCH /documents/:id` | Modify any document |
| 219 | `DELETE /documents/:id` | Delete any document |
| 272 | `GET /documents/:id/download` | Download any document (signed URL) |

**Fix:** For each endpoint, resolve the document's `dealId` → call `verifyDealAccess(dealId, getOrgId(req))`. For folder-scoped endpoint, resolve folder's `dealId` first.

#### 2. `deals-chat.ts` — 2 unscoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 23 | `GET /:dealId/chat/history` | Read chat history for any deal |
| 56 | `DELETE /:dealId/chat/history` | Wipe chat history for any deal |

**Fix:** Add `verifyDealAccess(dealId, getOrgId(req))` at top of each handler.

#### 3. `deals-chat-ai.ts` — 1 unscoped endpoint
| Line | Endpoint | Risk |
|---|---|---|
| 16 | `POST /:dealId/chat` | Send AI chat messages on any deal |

**Fix:** Add `verifyDealAccess(dealId, getOrgId(req))` before deal lookup.

### P1 — HIGH: Missing Ownership Verification

#### 4. `deals-team.ts` — 4 unscoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 16 | `GET /:id/team` | View team for any deal |
| 41 | `POST /:id/team` | Add members to any deal |
| 104 | `PATCH /:dealId/team/:memberId` | Update member role on any deal |
| 141 | `DELETE /:dealId/team/:memberId` | Remove member from any deal |

**Fix:** Add `verifyDealAccess(dealId, getOrgId(req))` at top of each handler.

#### 5. `contacts-connections.ts` — 6 unscoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 34 | `POST /:id/interactions` | Create interaction on any contact |
| 76 | `POST /:id/deals` | Link any contact to any deal |
| 114 | `DELETE /:contactId/deals/:dealId` | Unlink contact from deal |
| 137 | `GET /:id/connections` | View connections for any contact |
| 173 | `POST /:id/connections` | Create connection on any contact |
| 223 | `DELETE /:id/connections/:connectionId` | Delete any connection |

**Fix:** Verify contact ownership: fetch contact → check `contact.organizationId === getOrgId(req)`. For deal-linked ops, also `verifyDealAccess`.

### P2 — MEDIUM: Partial Scoping Gaps

#### 6. `chat.ts` — 4 partially scoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 77 | `GET /conversations/:id` | Fetch any conversation by UUID |
| 168 | `DELETE /conversations/:id` | Delete any conversation |
| 206 | `POST /conversations/:id/messages` | Post message to any conversation |
| 372 | `GET /conversations/:id/messages` | Read messages from any conversation |

**Fix:** Fetch conversation → get its `dealId` → `verifyDealAccess(dealId, getOrgId(req))`.

#### 7. `folders.ts` — 3 partially scoped endpoints
| Line | Endpoint | Risk |
|---|---|---|
| 100 | `GET /folders/:id` | Read any folder by UUID |
| 190 | `PATCH /folders/:id` | Rename any folder |
| 226 | `DELETE /folders/:id` | Delete any folder |

**Fix:** Fetch folder → get its `dealId` → `verifyDealAccess(dealId, getOrgId(req))`.

---

## Implementation Plan

### Phase 1: Fix All 7 Route Files (P0 → P2)
**Pattern:** For every unscoped endpoint, add org verification as the FIRST operation in the handler, before any data query/mutation.

**Helper pattern for deal-child resources:**
```typescript
// At top of handler:
const orgId = getOrgId(req);
const deal = await verifyDealAccess(dealId, orgId);
if (!deal) {
  return res.status(404).json({ error: 'Deal not found' });
}
```

**Helper pattern for contact-owned resources:**
```typescript
// At top of handler:
const orgId = getOrgId(req);
const { data: contact } = await supabase
  .from('Contact')
  .select('id, organizationId')
  .eq('id', contactId)
  .eq('organizationId', orgId)
  .single();
if (!contact) {
  return res.status(404).json({ error: 'Contact not found' });
}
```

**Execution order:**
1. `documents.ts` — 5 endpoints (CRITICAL, highest blast radius)
2. `deals-chat.ts` + `deals-chat-ai.ts` — 3 endpoints (CRITICAL)
3. `deals-team.ts` — 4 endpoints (HIGH)
4. `contacts-connections.ts` — 6 endpoints (HIGH)
5. `chat.ts` — 4 endpoints (MEDIUM)
6. `folders.ts` — 3 endpoints (MEDIUM)

### Phase 2: Add Helper — `verifyContactAccess()`
Create a reusable helper in `orgScope.ts` (like `verifyDealAccess` but for contacts):
```typescript
export async function verifyContactAccess(contactId: string, orgId: string) {
  const { data } = await supabase
    .from('Contact')
    .select('id, organizationId')
    .eq('id', contactId)
    .eq('organizationId', orgId)
    .single();
  return data;
}
```

### Phase 3: Add Helper — `verifyResourceViaJoin()`
For resources that don't have direct `organizationId` (documents, folders, conversations), create a helper that resolves ownership through the deal:
```typescript
export async function verifyDocumentAccess(documentId: string, orgId: string) {
  const { data: doc } = await supabase
    .from('Document')
    .select('id, dealId')
    .eq('id', documentId)
    .single();
  if (!doc) return null;
  return verifyDealAccess(doc.dealId, orgId);
}
```

### Phase 4: TypeScript Build Verification
- Run `cd apps/api && npx tsc --noEmit` after all changes
- Ensure zero new errors

### Phase 5: Smoke Test
- Verify all scoped routes return 404 (not 403) for wrong-org resources — prevents enumeration attacks
- Test that same-org users still see all shared data

---

## Design Decisions

### Why 404 instead of 403?
Returning `403 Forbidden` confirms the resource EXISTS but the user lacks access — this leaks information. Returning `404 Not Found` reveals nothing about other orgs' data. This is OWASP best practice for multi-tenant apps.

### Why no RBAC expansion in this sprint?
RBAC (role-based restrictions within an org) is a separate concern. Current design = "everyone in the org sees everything." This is correct for PE firms where deal teams are small (3-10 people) and transparency within the firm is expected. RBAC enforcement can be a follow-up if needed.

### Within-org visibility model
- All users in the same org see ALL deals, contacts, documents, memos
- No per-deal access restrictions (no "deal team only" visibility)
- This matches PE industry norms — firms are small, trust is high internally

---

## Files To Modify

| File | Changes |
|---|---|
| `apps/api/src/middleware/orgScope.ts` | Add `verifyContactAccess()`, `verifyDocumentAccess()`, `verifyFolderAccess()`, `verifyConversationAccess()` helpers |
| `apps/api/src/routes/documents.ts` | Scope 5 endpoints via `verifyDocumentAccess` or deal-based check |
| `apps/api/src/routes/deals-chat.ts` | Scope 2 endpoints via `verifyDealAccess` |
| `apps/api/src/routes/deals-chat-ai.ts` | Scope 1 endpoint via `verifyDealAccess` |
| `apps/api/src/routes/deals-team.ts` | Scope 4 endpoints via `verifyDealAccess` |
| `apps/api/src/routes/contacts-connections.ts` | Scope 6 endpoints via `verifyContactAccess` |
| `apps/api/src/routes/chat.ts` | Scope 4 endpoints via `verifyConversationAccess` |
| `apps/api/src/routes/folders.ts` | Scope 3 endpoints via `verifyFolderAccess` |

**Total: 8 files modified, 25 endpoints secured, 0 new files**

---

## Success Criteria
- [ ] All 25 endpoints return 404 when accessed with wrong-org credentials
- [ ] Same-org users can access all data normally (no regressions)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No new dependencies added
- [ ] Commit follows conventional format: `fix(security): add org isolation to 7 unscoped route files`
