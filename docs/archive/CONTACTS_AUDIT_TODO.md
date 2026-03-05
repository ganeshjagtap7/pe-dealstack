# Contacts CRM — Audit & Action Plan

> **Audit Date:** March 1, 2026
> **Current State:** Solid foundation with CRUD, search, filters, duplicate detection, relationship scoring (hidden), activity timeline, and deal/contact linking. Key gaps: scoring not visible, no sort/pagination UI, no CSV export, no AI features.

---

## Status Legend
- ✅ **Done** — Fully implemented and working
- ⚠️ **Partial** — Backend exists but frontend UI missing, or partially built
- ❌ **Not Started** — Needs to be built from scratch

---

## Tier 1 — Core CRM Enhancements (Foundation)

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1.1 | **Sort Options UI** | ⚠️ Partial | Backend supports sort by name/company/lastContactedAt/createdAt + asc/desc. **Need:** Add sort dropdown to contacts header (next to search bar) |
| 1.2 | **Grid/List View Toggle** | ❌ Not Started | Currently grid-only (3-col). **Need:** Add toggle button, build dense table/list view for power users |
| 1.3 | **Pagination UI** | ⚠️ Partial | Backend supports `limit` + `offset`. Frontend loads max 50, stops. **Need:** Add "Load More" button or page numbers, show "Showing X of Y" |
| 1.4 | **Bulk CSV Import UI** | ⚠️ Partial | `POST /api/contacts/import` exists (up to 500 contacts). **Need:** Upload button + CSV parser + preview table + field mapping UI |
| 1.5 | **Export to CSV** | ❌ Not Started | No backend endpoint, no UI. **Need:** Backend GET endpoint + download button |
| 1.6 | **Contact Stats Dashboard** | ⚠️ Partial | Type breakdown + most connected exists in Network Stats card. **Need:** Add chart visualization (pie/bar), interaction metrics, deals-by-type |
| 1.7 | **Duplicate Detection** | ✅ Done | Detects by email + full name. Shows "Possible Duplicates" card with reasons. Clickable. |
| 1.8 | **Company Grouping View** | ❌ Not Started | Backend supports `?company=X` filter. **Need:** "Group by Company" toggle showing contacts grouped under company headers |

**Tier 1 Completion: 3/8 done, 4/8 partial (backend-ready)**

---

## Tier 2 — Relationship Intelligence

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 2.1 | **Relationship Strength Score** | ⚠️ Partial | Score (0-100) calculated on backend (recency 0-40 + frequency 0-40 + deals 0-20). Cached in `contactScores`. **NOT displayed on cards** |
| 2.2 | **Health Indicators on Cards** | ❌ Not Started | Labels exist (Strong/Active/Warm/Cold) but **no visual badge on contact cards**. Need: colored dot/badge + score number on each card |
| 2.3 | **Relationship Decay Alerts** | ⚠️ Partial | "Needs Attention" card shows contacts >30 days stale. **Need:** Configurable per-type thresholds, push notifications |
| 2.4 | **Configurable Decay Thresholds** | ❌ Not Started | Currently hard-coded 30 days. Need: Settings UI for per-type thresholds (LP=monthly, Broker=quarterly) |
| 2.5 | **Interaction Quality Weighting** | ❌ Not Started | All interactions weighted equally. Need: meetings > calls > emails > notes |
| 2.6 | **Cross-Team Measurement** | ❌ Not Started | Only measures current user's interactions. Need: count team-wide interactions |
| 2.7 | **Smart Re-engagement Suggestions** | ❌ Not Started | Need: AI-generated suggestions ("Share latest portfolio update") |
| 2.8 | **Relationship Trend Chart** | ❌ Not Started | Need: sparkline or chart in contact detail showing score over time |

**Tier 2 Completion: 0/8 done, 2/8 partial**

---

## Tier 3 — AI Contact Enrichment

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 3.1 | **"Enrich" Button** | ❌ Not Started | One-click AI research (LinkedIn, company, news) |
| 3.2 | **Auto-Enrich on Create** | ❌ Not Started | Background agent populates fields on new contact |
| 3.3 | **Data Sources Integration** | ❌ Not Started | LinkedIn, Crunchbase, news APIs, SEC filings |
| 3.4 | **LLM Synthesis** | ❌ Not Started | AI resolves conflicting data, confidence scores |
| 3.5 | **Enriched Fields** | ❌ Not Started | Bio summary, career history, company size, funding stage |
| 3.6 | **Job Change Detection** | ❌ Not Started | Quarterly re-check for title/company changes |
| 3.7 | **News Monitoring** | ❌ Not Started | Surface recent news about contact/company |
| 3.8 | **Enrichment Log** | ❌ Not Started | When data was last refreshed, from what source |

**Tier 3 Completion: 0/8**

---

## Tier 4 — Activity Intelligence

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 4.1 | **Global Activity Feed** | ✅ Done | "Recent Activity" card shows last 20 interactions across all contacts |
| 4.2 | **Per-Contact Timeline** | ✅ Done | Contact detail panel shows chronological interactions with type icons |
| 4.3 | **Activity Heatmap** | ❌ Not Started | Visual calendar showing interaction density over time |
| 4.4 | **Team Activity View** | ❌ Not Started | See what the whole firm has been doing relationship-wise |
| 4.5 | **Email Sync** | ❌ Not Started | Gmail/Outlook auto-log (requires OAuth integration) |
| 4.6 | **Calendar Sync** | ❌ Not Started | Auto-log meetings with attendees (requires OAuth) |
| 4.7 | **Meeting Notes Extraction** | ❌ Not Started | AI extracts key facts from meeting notes |
| 4.8 | **Sentiment Analysis** | ❌ Not Started | Track communication sentiment over time |

**Tier 4 Completion: 2/8 done**

---

## Tier 5 — AI Meeting Preparation

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 5.1 | **Auto-Generated Meeting Brief** | ❌ Not Started | Compile dossier + history + deal context + news |
| 5.2 | **Suggested Talking Points** | ❌ Not Started | AI-generated based on deal context and relationship stage |
| 5.3 | **One-Click Brief Generation** | ❌ Not Started | "Prepare for Meeting" button |
| 5.4 | **IC Meeting Prep** | ❌ Not Started | Auto-compile deal memo from intelligence |
| 5.5 | **PDF Export** | ❌ Not Started | Download brief for offline use |

**Tier 5 Completion: 0/5**

---

## Tier 6-10 — Advanced Features (Future)

| Tier | Feature Area | Status |
|------|-------------|--------|
| 6 | Deal Signal Monitoring (news, M&A, hiring signals) | ❌ Not Started |
| 7 | Smart Communication (AI email drafting, templates, sequences) | ❌ Not Started |
| 8 | Network Mapping (visual relationship graph, warm intro paths) | ❌ Not Started |
| 9 | LP & Portfolio Intelligence (LP profiles, portfolio KPIs) | ❌ Not Started |
| 10 | Natural Language Intelligence (ask questions in plain English) | ❌ Not Started |

---

## Immediate Priority Actions (Quick Wins)

> These items have backend support already — just need frontend UI wiring.

### P0 — Show What We Already Have (1-2 hours each)

- [ ] **2.2 — Show health indicators on contact cards** — Display colored dot (green/yellow/orange/red) + score number on each card. Data already in `contactScores`.
- [ ] **1.1 — Add sort dropdown** — Simple dropdown next to search bar: "Sort by: Name / Company / Last Contacted / Date Added". Backend already supports it.
- [ ] **1.3 — Add pagination** — "Load More" button at bottom, or "Showing 50 of 142" with page buttons. Backend already supports `limit` + `offset`.

### P1 — Low-Effort High-Impact (2-4 hours each)

- [ ] **1.5 — Export to CSV** — Add backend GET endpoint + "Export" button in header. Simple CSV generation.
- [ ] **1.2 — Grid/List view toggle** — Add toggle button, build simple table view with columns: Name, Company, Type, Email, Last Contacted, Score.
- [ ] **1.8 — Company grouping** — "Group by Company" toggle that groups contacts under company headers with contact count.

### P2 — Medium Effort (4-8 hours each)

- [ ] **1.4 — CSV Import UI** — Upload button, file parser, preview table, field mapping, progress indicator.
- [ ] **1.6 — Enhanced stats with charts** — Add Chart.js pie chart for type distribution, bar chart for interactions over time.
- [ ] **2.8 — Relationship trend chart** — Store daily score snapshots, show sparkline in contact detail.

---

## Architecture Notes

**Contact API Routes:** `apps/api/src/routes/contacts.ts`
- Full CRUD + interactions + deals + connections
- Insights: `/insights/network`, `/insights/duplicates`, `/insights/stale`, `/insights/timeline`, `/insights/scores`

**Frontend:** `apps/web/contacts.html` (single-file with embedded JS)
- All-in-one HTML file with inline JavaScript
- Uses `contactScores` object for caching scores
- Grid layout with responsive columns
- Slide-over detail panel

**Database Tables:**
- `Contact` — Core contact data + `lastContactedAt`
- `ContactInteraction` — Activity log (NOTE, MEETING, CALL, EMAIL, OTHER)
- `ContactDeal` — Many-to-many with roles (UNIQUE on contactId+dealId)
- `ContactRelationship` — Contact-to-contact connections (migration may be missing)

---

*Last updated: March 1, 2026*
