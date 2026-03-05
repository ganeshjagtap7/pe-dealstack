# PE OS — Remaining TODO Items
*Extracted from compact.md session summaries — Feb 24, 2026*

---

## Immediate / Blocking

| # | Task | Status |
|---|------|--------|
| 1 | Commit and push all uncommitted changes (~12 files from last 2 sessions) | Pending |
| 2 | Add `RESEND_API_KEY` to Render production env vars | Pending |
| 3 | Regenerate Supabase anon key (old key in git history) | Pending |
| 4 | Remove debug endpoints from `index.ts` (`/api/debug/test-memo-insert`, `/api/debug/memo-table`) | Pending |
| 5 | Complete UI verification for #7 Templates, #4 Ingest, #5 AI Extraction | Pending |

---

## P3 Backlog (from TODO-CALL-FEB19.md)

| # | Feature | Notes |
|---|---------|-------|
| 16 | Google Drive / Google Workspace Integration | Requires OAuth + API credentials, separate sprint |
| 17 | Security / Audit Logs — Frontend Viewer | Backend `GET /api/audit` exists, no admin UI page |
| 18 | UI Customization / Theming | User said "don't want dark mode, keep current theme" |
| 19 | Trello-Like Task Board | Tasks CRUD backend exists, no Kanban UI |

---

## Backend Features Missing Frontend UI

| Feature | Backend Endpoint | What's Missing |
|---------|-----------------|----------------|
| Deal Export CSV | `GET /api/export/deals?format=csv\|json` | No button in CRM page |
| URL Research Preview | `POST /api/ingest/url` with `autoCreateDeal: false` | No preview UI |
| Multi-Doc Analysis | `POST /api/deals/:id/analyze` | No manual trigger button on deal page |
| Email Ingest (.eml) | `POST /api/ingest/email` | No .eml upload option in Deal Intake modal |

---

## Infrastructure / DevOps

- [ ] Add `DATA_ENCRYPTION_KEY` to Render env vars (optional, graceful degradation)
- [ ] Enable PgBouncer in Supabase (Settings > Database > Connection Pooling)
- [ ] Optionally enable `pg_trgm` extension for fuzzy search
- [ ] Verify Render deployment succeeds after push
- [ ] Fix 40+ remaining `any` type usages in TypeScript

---

## Quick Wins / Polish

- [ ] Fix broken `href="#"` placeholder links (15+ in index.html, resources.html, signup.html)
- [ ] Remove `console.log` from frontend JS files (20+ in auth.js, deal.js, dashboard.js, etc.)
- [ ] Fix non-functional CTA buttons ("View Documentation", "Talk to Sales" in index.html)
- [ ] Remove duplicate Material Symbols font import in index.html
- [ ] Add mobile menu toggle JS handler
- [ ] Fix USD-to-INR/Pounds conversion in AI chatbot (needs external forex API)

---

## Personal Notes (from "to do ganesh")

| # | Item | Status |
|---|------|--------|
| 1 | Regenerate Supabase anon key | NOT DONE |
| 2 | CSV/Excel parsing extraction logic | DONE (B3) |
| 3 | USD to INR/Pounds — chatbox AI uses old rates | NOT DONE |
| 4 | Key risks section in deal page | DONE |

---

## Contacts CRM Roadmap (Future — from contacts_crm_todo.md)

*User said "we can move into this when I say." Only 3 features built so far.*

### Tier 1 — Core CRM Enhancements (Table stakes)
- Sort options, Grid/List toggle, Pagination, Bulk CSV import UI, Export CSV, Stats dashboard, Company grouping

### Tier 2 — Relationship Intelligence (Partially done)
- Decay alerts, Configurable thresholds, Quality weighting, Smart re-engagement, Trend charts

### Tier 3 — AI Contact Enrichment (Clay competitor)
- One-click AI research, Auto-enrich, LinkedIn/Crunchbase/SEC data, Job change detection

### Tier 4 — Activity Intelligence (Zero-touch data entry)
- Global activity feed, Email sync, Calendar sync, Meeting notes extraction, Sentiment analysis

### Tier 5 — AI Meeting Preparation
- Auto-generated briefs, Talking points, IC meeting prep, PDF export

### Tier 6 — Deal Signal Monitoring
- Signal agent (leadership changes, M&A, funding), Daily digest, Custom rules

### Tier 7 — Smart Communication (AI email agent)
- AI email drafting, Tone awareness, Templates, Sequence builder

### Tier 8 — Network Mapping
- Visual relationship graph, Warm intro paths, Network gap analysis, Influence mapping

### Tier 9 — LP & Portfolio Intelligence
- LP profiles, Auto-drafted updates, Portfolio KPI dashboard

### Tier 10 — Natural Language Intelligence
- NL querying ("show me SaaS deals over $50M"), Voice interface, Proactive insights
