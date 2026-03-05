# Contacts CRM — Feature To-Do List

> **Goal:** Transform PE OS CRM from a simple contact database into an AI-powered relationship intelligence engine that replaces a junior analyst for small PE funds (5-15 people).
>
> **Target Pricing:** $20-40/user/month (vs Affinity $50K+/yr, DealCloud $100K+/yr)
>
> **Competitive Edge:** LangExtract (CIM parsing), AI deal scoring, self-serve setup in minutes

---

## Tier 1 — Core CRM Enhancements (Foundation)

> *Get the basics right. These are table-stakes features that every CRM needs.*

- [ ] **Sort Options** — Sort contacts by name, company, last contacted, date added
- [ ] **Grid/List View Toggle** — List view for denser info display, grid for visual cards
- [ ] **Pagination / Infinite Scroll** — Currently loads max 100; add proper pagination
- [ ] **Bulk Import from CSV** — Backend endpoint already exists; build the UI
- [ ] **Export to CSV** — Download contacts for offline use / sharing
- [ ] **Contact Stats Dashboard** — Total contacts by type, recent interactions, most active contacts
- [ ] **Duplicate Detection** — Flag contacts with same email or matching first+last name
- [ ] **Company Grouping View** — Group contacts by company to see coverage at a glance

---

## Tier 2 — Relationship Intelligence (The Killer Feature)

> *This is what Affinity charges $50K/yr for. Auto-track relationship health without manual data entry.*

### Relationship Scoring & Health

- [ ] **Relationship Strength Score** — Calculate 0-100 score based on interaction recency, frequency, direction
- [ ] **Contact Card Health Indicators** — Green (on track) / Yellow (cooling) / Red (at risk) visual badges on cards
- [ ] **Relationship Decay Alerts** — "You haven't contacted [LP Name] in 60 days — relationship declining"
- [ ] **Configurable Decay Thresholds** — Per contact type (Key LP = monthly, Broker = quarterly)
- [ ] **Interaction Quality Weighting** — A 30-min meeting counts more than a forwarded article
- [ ] **Cross-Team Measurement** — If a colleague spoke with them, relationship still counts as active

### Suggested Actions

- [ ] **Smart Re-engagement Suggestions** — "Share the latest portfolio update" / "Congratulate on [recent event]"
- [ ] **Optimal Contact Frequency** — AI-recommended cadence per relationship tier
- [ ] **Relationship Trend Chart** — Show strength over time in contact detail panel

---

## Tier 3 — AI Contact Enrichment (Auto-Research Agent)

> *When a contact is added, AI auto-fills their profile. What Clay charges credits for.*

### Auto-Enrichment on Create

- [ ] **"Enrich" Button** — One-click AI research on any contact (LinkedIn, company, news)
- [ ] **Auto-Enrich on Create** — When a new contact is added, background agent researches and populates fields
- [ ] **Data Sources** — LinkedIn profile, company website, Crunchbase, news articles, SEC filings
- [ ] **LLM Synthesis** — AI resolves conflicting data, picks best answer, attaches confidence scores
- [ ] **Enriched Fields** — Bio summary, career history, company size, funding stage, industry, tech stack

### Periodic Re-Research

- [ ] **Job Change Detection** — Quarterly check for title/company changes
- [ ] **News Monitoring** — Surface recent news about a contact or their company
- [ ] **Relevance Scoring** — "This contact is relevant to 3 of your active deals"
- [ ] **Enrichment Log** — Show when data was last refreshed and from what source

---

## Tier 4 — Activity Intelligence (Zero-Touch Data Entry)

> *PE professionals hate CRM because it means data entry. Eliminate it entirely.*

### Contact Timeline Feed

- [ ] **Global Activity Feed** — "You met John 2d ago, emailed Sarah 5d ago..." across all contacts
- [ ] **Per-Contact Timeline** — Chronological view of every interaction (already partially built)
- [ ] **Activity Heatmap** — Visual calendar showing interaction density over time
- [ ] **Team Activity View** — See what the whole firm has been doing relationship-wise

### Auto-Logging (Future — requires email/calendar integration)

- [ ] **Email Sync** — Connect Gmail/Outlook, auto-log emails to contact records
- [ ] **Calendar Sync** — Auto-log meetings with attendees linked to contacts
- [ ] **Meeting Notes Extraction** — AI extracts key facts: "Jane mentioned targeting $50M EBITDA healthcare"
- [ ] **Action Item Detection** — AI pulls out follow-ups from meeting notes and creates tasks
- [ ] **Sentiment Analysis** — Track communication sentiment over time

---

## Tier 5 — AI Meeting Preparation (The "Wow" Feature)

> *The feature that drives adoption. PE professionals walk into meetings fully briefed.*

- [ ] **Auto-Generated Meeting Brief** — Before any meeting, compile:
  - Contact dossier (bio, role history, recent career moves)
  - Full interaction history (every email, call, meeting with anyone at the firm)
  - Deal context (current stage, outstanding items, risks)
  - Recent news about their company/industry
  - "Since last meeting" summary — what's changed
- [ ] **Suggested Talking Points** — AI-generated based on deal context and relationship stage
- [ ] **One-Click Brief Generation** — "Prepare me for my meeting with [Contact]" button
- [ ] **IC Meeting Prep** — Auto-compile deal memo from all collected intelligence
- [ ] **PDF Export** — Download brief for offline/print use

---

## Tier 6 — Deal Signal Monitoring (Competitive Intelligence)

> *Small funds can't afford Bloomberg terminals. AI-powered signal monitoring democratizes intelligence.*

- [ ] **Signal Monitoring Agent** — Continuously scan for:
  - Companies matching investment criteria (sector, size, geography)
  - Leadership changes at target companies
  - M&A activity in relevant sectors
  - Funding events (Series rounds, debt raises)
  - Hiring signals (rapid headcount growth = opportunity)
  - Regulatory changes affecting target sectors
- [ ] **Daily Signal Digest** — Prioritized email/dashboard summary of relevant signals
- [ ] **Signal → Deal Pipeline** — One-click to create a deal from a signal
- [ ] **Signal → Contact Link** — "This company's CEO is 2 degrees away via [Contact]"
- [ ] **Custom Signal Rules** — Define your investment thesis, AI monitors for matches

---

## Tier 7 — Smart Communication (AI Email Agent)

> *Context-aware email drafting that references previous conversations.*

- [ ] **AI Email Drafting** — Draft follow-ups with full relationship context
- [ ] **Tone Awareness** — Formal for LPs, casual for close contacts, professional for bankers
- [ ] **Template Library** — CIM transmittal, NDA follow-up, LP update, reference request, meeting request
- [ ] **Previous Conversation References** — "Following up on our discussion about healthcare roll-ups..."
- [ ] **Send-Time Optimization** — Suggest best time based on recipient's response patterns
- [ ] **Sequence Builder** — Multi-touch outreach campaigns for deal sourcing

---

## Tier 8 — Network Mapping (Relationship Graph)

> *"Who knows who" — the most valuable asset in PE. Make it institutional, not personal.*

- [ ] **Visual Relationship Graph** — Interactive network visualization showing connections
- [ ] **Warm Introduction Paths** — "Partner A → Board Member X → Target CEO" path discovery
- [ ] **Network Gap Analysis** — "No one at the firm knows anyone at this company — cold outreach needed"
- [ ] **Contact-to-Contact Relationships** — "John introduced you to Sarah" linking
- [ ] **Firm-Wide Network View** — See the collective network across all team members
- [ ] **Influence Mapping** — Who are the most connected people in your network?

---

## Tier 9 — LP & Portfolio Intelligence (Fund Operations)

> *Beyond deal sourcing — manage the full PE lifecycle.*

### LP Relationship Management

- [ ] **LP Profiles** — Track commitments, co-investment appetite, communication preferences
- [ ] **LP Update Auto-Drafts** — Generate quarterly updates from portfolio performance data
- [ ] **LP Meeting Prep** — Auto-compile materials before annual meetings
- [ ] **LP News Monitoring** — Personnel changes, allocation shifts, new fund commitments
- [ ] **Fundraising Pipeline** — Track LP outreach for new fund raises

### Portfolio Company Intelligence

- [ ] **Living Intelligence Files** — Auto-updating dossier on each portfolio company
- [ ] **KPI Dashboard** — Track revenue, EBITDA, customer count vs. plan
- [ ] **Competitive Intelligence** — Monitor competitor moves, market shifts
- [ ] **Management Team Monitoring** — Key hire/departure alerts
- [ ] **Customer Sentiment Tracking** — Review trends, NPS, social media sentiment
- [ ] **Monthly Portfolio Briefing** — AI-generated summary across all portfolio companies

---

## Tier 10 — Natural Language Intelligence (AI Analyst)

> *Ask questions in plain English. The CRM becomes your AI analyst.*

- [ ] **Natural Language Querying** — "Show me all healthcare deals over $50M EBITDA we passed on"
- [ ] **Relationship Queries** — "Who has the strongest relationship with Goldman's healthcare team?"
- [ ] **Historical Analysis** — "What was our deal conversion rate last year by sector?"
- [ ] **Proactive Insights** — AI surfaces patterns: "You close 3x more deals sourced through bankers vs. direct"
- [ ] **Voice Interface** — Ask questions via voice on mobile

---

## Architecture Reference

```
+------------------------------------------------------------------+
|                        USER INTERFACE                              |
|   Dashboard  |  Contacts  |  Deals  |  Portfolio  |  Intelligence |
+------------------------------------------------------------------+
|                      AGENT ORCHESTRATOR                           |
|   Schedules agents, manages priorities, handles conflicts         |
+------------------------------------------------------------------+
|  Research   | Enrichment | Signal    | Relationship | Email       |
|  Agent      | Agent      | Monitor   | Health Agent | Draft Agent |
+------------------------------------------------------------------+
|                      TOOL LAYER                                   |
|  Web Search | LinkedIn | News APIs | SEC/Edgar | Calendar | Email |
+------------------------------------------------------------------+
|                      DATA LAYER                                   |
|  Contact DB | Deal Pipeline | Activity Log | Document Store      |
+------------------------------------------------------------------+
|                      LLM LAYER                                    |
|  Claude/GPT for reasoning | Embedding models for search          |
+------------------------------------------------------------------+
```

---

## Trust Gradient (Design Principle)

| Trust Level | AI Autonomy | Example | Human Role |
|---|---|---|---|
| **Full autonomy** | AI acts silently | Update contact data from enrichment | None (log only) |
| **Notify after** | AI acts, then tells you | "Detected job change, updated record" | Review if desired |
| **Ask before** | AI proposes, you approve | "Draft follow-up to LP — shall I send?" | Approve/edit |
| **Assist only** | AI helps when asked | "Summarize this deal" | Initiate and review |

---

## Priority Recommendation

| Phase | Features | Impact | Effort |
|---|---|---|---|
| **Phase 1** | Tier 1 (sort, pagination, CSV) + Tier 2 (relationship scoring) | High | Low-Medium |
| **Phase 2** | Tier 3 (AI enrichment) + Tier 4 (activity feed) | Very High | Medium |
| **Phase 3** | Tier 5 (meeting prep) + Tier 7 (email drafting) | Very High | Medium-High |
| **Phase 4** | Tier 6 (deal signals) + Tier 8 (network mapping) | High | High |
| **Phase 5** | Tier 9 (LP/portfolio) + Tier 10 (NL queries) | High | High |

---

*Last updated: February 17, 2026*
