# Perceived Speed Optimization — Design Spec

**Date:** 2026-04-26
**Goal:** Make the existing product feel 2-3x faster without adding new features. Focus on perceived speed — what users see and feel.

---

## 1. Defer Scripts + Response Compression

### Scripts
Add `defer` to all `<script>` tags across every HTML page (deal, crm, dashboard, contacts, settings, admin, memo-builder, onboarding, accept-invite, templates).

**Exceptions (stay synchronous):**
- `auth.js` — `PEAuth` singleton must be available before any other script
- `config.js` — `API_BASE_URL` and `PE_CONFIG` must be available before API calls

**Pages to update:** deal.html, crm.html, crm-dynamic.html, dashboard.html, contacts.html, settings.html, admin-dashboard.html, memo-builder.html, deal-intake.html, onboarding.html, templates.html, accept-invite.html

### Compression
- Install `compression` npm package in `apps/api/`
- Add `app.use(compression())` in `apps/api/src/app.ts` before all route middleware
- Default gzip for all JSON responses

**Expected impact:** First paint 30-50% faster. API responses 5-10x smaller.

---

## 2. Parallel API Calls on Deal Page

### Current (sequential)
```
1. GET /deals/{id}          → wait
2. GET /financials           → wait (depends on step 1 completing)
   GET /financials/validation
   GET /financials/conflicts
3. GET /chat/history         → wait
```

### Target (parallel)
```
Promise.all([
  GET /deals/{id},
  GET /deals/{id}/financials,
  GET /deals/{id}/financials/validation,
  GET /deals/{id}/financials/conflicts,
  GET /deals/{id}/chat/history
])
```

Each section populates independently as its data arrives. Deal header fills first (smallest payload), financials next, chat last.

**Analysis calls** (`/financials/analysis`, `/cross-doc`, `/benchmark`, `/memo`, `/insights`) remain sequential after financials — they need financial data to exist. They already parallelize among themselves.

**Files changed:** `apps/web/deal.js` (loadDealData function), `apps/web/deal-chat.js` (loadChatHistory timing)

**Expected impact:** Deal page fully loaded 40-60% faster (3 round trips → 1).

---

## 3. localStorage Caching (Stale-While-Revalidate)

### New shared module: `apps/web/js/cache.js`
```javascript
window.PECache = {
  get(key)              // returns { data, timestamp } or null if expired
  set(key, data, ttlMs) // stores with timestamp
  clear(key)            // remove specific key
  clearAll()            // remove all pe-cache-* keys
}
```

### What gets cached

| Key pattern | TTL | Where used |
|-------------|-----|------------|
| `pe-deals-list` | 5 min | CRM page — deal list |
| `pe-deal-{id}` | 2 min | Deal page — deal data |
| `pe-chat-{dealId}` | 5 min | Deal page — chat history |

### Stale-while-revalidate pattern
1. On page load: check cache → if fresh, render immediately
2. Fire API call in background
3. If API returns different data, update UI + cache
4. If cache miss, show skeleton → wait for API → render + cache

### What is NOT cached
- Financial statements (change during extraction)
- Analysis results (computed from financials)
- Notifications (real-time)

### Storage limits
- Auto-evict oldest entries if localStorage usage exceeds 4MB
- Each cache entry stores: `{ data, timestamp, key }`

**Expected impact:** Navigating between deals/CRM feels instant on second visit.

---

## 4. Better Loading Skeletons

### Sections needing skeletons in deal.html

| Section | Current state | Skeleton design |
|---------|--------------|-----------------|
| Key Risks | Empty div | 3 skeleton rows with left border accent |
| Documents list | Empty horizontal scroll | 3 skeleton card chips |
| Activity feed | "Loading activities..." text | 4 rows: circle + two text lines |
| Metadata grid | Dashes (—) | Skeleton text blocks in each cell |

### Implementation
- All skeletons use existing `skeleton` + `skeleton-text-sm`/`skeleton-text-lg` CSS classes from `skeleton.css`
- Skeletons are static HTML in `deal.html` — replaced by JS via `innerHTML` when data arrives
- No new JS logic needed, just HTML placeholders

**Expected impact:** Zero layout shift. Every section has visual structure from first paint.

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `apps/api/package.json` | Add `compression` dependency |
| `apps/api/src/app.ts` | Add `compression()` middleware |
| `apps/web/deal.html` | defer scripts, skeleton HTML |
| `apps/web/crm.html` | defer scripts |
| `apps/web/dashboard.html` | defer scripts |
| `apps/web/contacts.html` | defer scripts |
| `apps/web/settings.html` | defer scripts |
| `apps/web/admin-dashboard.html` | defer scripts |
| `apps/web/memo-builder.html` | defer scripts |
| `apps/web/deal-intake.html` | defer scripts |
| `apps/web/onboarding.html` | defer scripts |
| `apps/web/templates.html` | defer scripts |
| `apps/web/accept-invite.html` | defer scripts |
| `apps/web/crm-dynamic.html` | defer scripts |
| `apps/web/js/cache.js` | **New** — PECache utility |
| `apps/web/deal.js` | Parallel API calls, cache integration |
| `apps/web/deal-chat.js` | Cache chat history |
| `apps/web/crm.js` or equivalent | Cache deal list |

---

## Out of Scope
- Backend N+1 query fixes (deferred to scale phase)
- Database index additions
- Payload trimming (extractedText exclusion)
- Service worker / offline support
- List virtualization for 1000+ deals
