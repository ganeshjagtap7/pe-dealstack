# Gmail → Auto Deal Creation & Update — Design + TODO

**Status:** Proposed, not started
**Date:** 2026-05-13
**Depends on:** Integrations Platform V1 (PR #8, deployed). Gmail OAuth connection must already work end-to-end before any of this is useful.

---

## 1. Goal in one sentence

When a user connects Gmail, Pocket Fund should **identify which email threads are deal-related**, **auto-create a Deal + Company + Contacts** from each one with AI-extracted data, and **keep that Deal updated** as the thread grows — all with user-configurable thresholds and review gates so the AI never silently makes up deals.

## 2. What V1 already does vs. what's missing

| Capability | V1 (shipped) | This feature (new) |
|---|---|---|
| Pull emails from Gmail | ✅ every 6h | unchanged |
| Match email to **existing** deal contact | ✅ via `matcher.ts` | unchanged |
| Surface email on deal Activities tab | ✅ via `IntegrationActivityFeed` | unchanged |
| Classify email as deal-relevant | ❌ | **new — AI classifier** |
| Create new Deal from email | ❌ skip if no contact match | **new — AI extraction + write** |
| Update Deal fields as thread evolves | ❌ | **new — incremental extraction** |
| Auto-create Contacts (with title/company from signature) | ❌ | **new — signature parser + AI fallback** |
| User-controlled config (on/off, thresholds, allowlists) | ❌ | **new — settings UI + DB** |
| Review queue for borderline cases | ❌ | **new — UI surface** |
| Audit trail of AI-created records | partial (AI inference log exists) | reuse existing trail |

## 3. Phasing

Each phase is independently shippable and demoable. Don't conflate them.

### Phase A — Classifier + Suggestion Queue (no auto-write)
The safest start: AI labels emails, surfaces "potential deals" in a review queue. Nothing auto-created.

- Build `dealEmailClassifier` agent (GPT-4.1-mini, structured output)
- Add `dealRelevance` JSONB column to `IntegrationActivity` (score 0-1, reasoning, extractedHints)
- Run classifier inline during Gmail sync mapper
- New table `DealSuggestion` (status: `pending | accepted | dismissed`, source email ids, extracted fields)
- UI: `/internal/deal-suggestions` or top-of-CRM banner: "3 new deal opportunities from email"
- User clicks → modal shows extracted data → Accept (creates Deal) / Edit / Dismiss

### Phase B — Auto-create with confidence threshold
Once Phase A has run for 2 weeks and we trust the classifier, flip a setting to auto-create above a confidence threshold.

- `OrgSetting.autoCreateDealsThreshold` (default `null` = off; suggested value `0.85`)
- If classifier confidence ≥ threshold AND extracted company doesn't match existing deal → create Deal + Company
- All auto-created deals tagged `source: 'ai_email'` + flagged for review
- "Recently auto-created deals" widget on dashboard for first 7 days

### Phase C — Thread continuity & field updates
Once a Deal is linked to a Gmail threadId, every new email on that thread becomes an incremental update.

- `Deal.sourceThreadIds` (text[]) — track which Gmail threads feed this deal
- On new email: if threadId already linked, run `incrementalUpdate` agent that ONLY proposes deltas (e.g., revenue mentioned, new contact, follow-up date)
- Proposed updates go through `DealUpdateProposal` queue — user approves or it auto-applies if confidence high
- Activity log records every AI-driven field change with the source email snippet

### Phase D — Contact auto-extraction
The contact side. When a deal is created, every From/To/CC participant becomes a Contact, with metadata extracted from email signatures.

- New `emailSignatureParser` — regex/heuristic pass extracting name, title, company, phone
- AI fallback for messy signatures (multi-line, no obvious title)
- Deduplication: match by email first, then `(name, company)` fuzzy
- New contacts tagged `source: 'ai_email_signature'`
- Bulk merge UI for duplicates: "We found a likely duplicate, merge?"

### Phase E — Configuration surface
The "proper configuration" the user asked for. Lives in Settings → Integrations → Gmail → "Auto-deal detection."

- Toggle: Enable auto-deal detection (off by default)
- Confidence threshold slider (0.6 = aggressive, 0.95 = conservative)
- Sender allowlist (domains/emails that auto-bypass classifier — always treat as deal source)
- Sender blocklist (LinkedIn notifications, calendar invites, internal team, newsletters)
- Sector allowlist (only create deals in sectors X, Y, Z)
- Min deal size hint (skip threads where extracted value < $X)
- Per-user vs per-org config (decision needed; see §6)

### Phase F — Backfill
When a user first enables auto-deal-detection, scan their last 90 days of Gmail for past deals.

- Background job, bounded concurrency, progress bar in settings
- Same classifier + extraction pipeline as live sync
- Single review queue summarising "We found 12 likely past deals — review all"
- Hard cap: 5000 emails scanned per backfill

### Phase G — Push instead of poll (cost optimization, later)
- Gmail Pub/Sub push → instant deal creation on email arrival
- Calendar `channels.watch` for meeting-driven flows
- Only worth doing once user count justifies the infra; 6h polling is fine for now

---

## 4. Architecture sketch

```
Gmail sync (existing 6h cron)
        │
        ▼
IntegrationActivity row created (existing)
        │
        ▼
NEW: dealEmailClassifier (GPT-4.1-mini, ~$0.001/email)
        │
   ┌────┴─────────────────────────┐
   ▼ confidence ≥ threshold       ▼ confidence < threshold
   ┌─────────────────┐             ┌──────────────────────┐
   │ threadId known? │             │  drop (or queue for  │
   └────┬────────────┘             │  Phase A suggestions)│
        │                          └──────────────────────┘
   ┌────┴─────────────────┐
   ▼ yes: known deal      ▼ no: new deal
   ┌──────────────────┐   ┌──────────────────────┐
   │ incrementalUpdate│   │ dealExtractor (full) │
   │ agent (delta)    │   │ + Company + Contacts │
   └────────┬─────────┘   └──────────┬───────────┘
            │                        │
            ▼                        ▼
   DealUpdateProposal           DealSuggestion (Phase A)
   (or auto-apply if            or Deal+Company+Contacts
    Phase C high-conf)          (Phase B, if auto enabled)
```

## 5. TODO checklist (end-to-end)

**Phase A — Classifier + Suggestion Queue**
- [ ] Spec dealEmailClassifier output schema (Zod): `{ isRelevant: bool, confidence: 0-1, reasoning: string, hints: { companyName?, sector?, dealType?, askPrice?, contactRoles[] } }`
- [ ] Build `apps/api/src/services/agents/dealEmailClassifier/` (prompt + schema + index)
- [ ] DB migration: `dealRelevance` JSONB on `IntegrationActivity`, `DealSuggestion` table
- [ ] Wire classifier into Gmail mapper (run before upsert)
- [ ] REST: `GET /api/deal-suggestions` (org-scoped, paginated), `POST /:id/accept`, `POST /:id/dismiss`
- [ ] Frontend: `/internal/deal-suggestions` page + dashboard banner
- [ ] Accept flow: modal pre-filled with extracted data, user edits + confirms → Deal created
- [ ] Unit tests on classifier with golden-set emails (cold outreach, banker intro, LP intro, noise)
- [ ] Cost guardrail: max N classifications per integration per cron run

**Phase B — Auto-create above threshold**
- [ ] `Organization.settings.autoCreateDealsThreshold` (null/number)
- [ ] Deal write path: company match-or-create, deal create, contacts create, ContactDeal links
- [ ] Mark auto-created records with `source` field for audit
- [ ] Dashboard widget: "AI-created in last 7 days" with quick edit/delete
- [ ] Slack/email digest (optional): "AI created 4 deals overnight"
- [ ] Rollback: bulk-delete UI for "delete all AI-created deals from last X hours" in case classifier misfires

**Phase C — Thread continuity**
- [ ] `Deal.sourceThreadIds` text[] + index
- [ ] Track threadId → dealId mapping when Deal first created from email
- [ ] Build `dealIncrementalUpdate` agent (delta-only output schema)
- [ ] `DealUpdateProposal` table + queue UI
- [ ] Field-level audit: every AI update records `{field, oldValue, newValue, sourceEmailId, confidence}`
- [ ] Auto-apply rule: high confidence + non-sensitive field (e.g., notes, contact list) → write; sensitive fields (deal size, stage) → always queue

**Phase D — Contact auto-extraction**
- [ ] `emailSignatureParser` (heuristic regex pass)
- [ ] AI fallback for unparsed signatures
- [ ] Contact dedupe: email primary key, fuzzy `(name, companyDomain)` secondary
- [ ] Merge UI for proposed duplicates
- [ ] `Contact.source = 'ai_email_signature'` tag

**Phase E — Configuration UI**
- [ ] Settings → Integrations → Gmail → "Auto-deal detection" panel
- [ ] Toggle, threshold slider, allowlist/blocklist multi-input chips
- [ ] Sector dropdown, min deal size input
- [ ] Save → updates `Organization.settings.autoDealConfig`
- [ ] Surface current config on the suggestion review page so user sees why this email was queued

**Phase F — Backfill**
- [ ] Background job: chunked Gmail history fetch, bounded concurrency
- [ ] Progress bar (Settings → Integrations → Gmail → "Scanning 12,432 emails… 38%")
- [ ] Single review queue at end with bulk-accept option
- [ ] Idempotency: re-running backfill should not produce duplicates

**Phase G — Push notifications**
- [ ] Gmail Pub/Sub topic + watch registration
- [ ] Webhook receiver (already have raw-body capture in `webhookRouter.ts`)
- [ ] Drop the 6h poll once push is verified

## 6. Open questions (need user decisions before building)

1. **Per-user or per-org config?** Each user has their own Gmail, but deals belong to the org. If user A enables auto-create at 0.85, does that apply only to their Gmail or all users in the firm? *Default proposal: per-user-Gmail, all deals created in org scope.*
2. **Privacy default — opt-in or opt-out?** Auto-deal detection scans personal email content with AI. Should be **opt-in** for legal/trust reasons. Phase A (suggestions only) could be opt-out since nothing is written.
3. **What counts as "deal-related"?** PE firm: inbound deal flow (yes), LP fundraise (yes?), portfolio company ops (no), vendor invoices (no), recruiter emails (no). Needs a 30-example golden set the classifier is tested against before Phase A ships.
4. **Cost ceiling?** GPT-4.1-mini at $0.001-0.005 per email × 200 emails/day × 50 users = $300-1500/month at scale. Need a per-org budget and a cheaper pre-filter (regex/keyword classifier as Stage 1 before LLM).
5. **Conflict resolution on incremental updates.** If the human edited revenue to $5M and the AI sees an email saying $5.5M, do we overwrite? *Proposal: never overwrite human edits without explicit user approval.*
6. **Banker/broker noise.** A single banker may pitch 30 deals/month. We need company-name extraction reliable enough not to merge them all into one deal.

## 7. Estimated effort

Rough sizes assuming one focused dev:

| Phase | Estimate |
|---|---|
| A — Classifier + Suggestion Queue | 1 week |
| B — Auto-create with threshold | 3 days |
| C — Thread continuity + updates | 1 week |
| D — Contact extraction | 4 days |
| E — Configuration UI | 3 days |
| F — Backfill | 4 days |
| G — Push notifications | 3 days |
| **Total** | **~4-5 weeks** |

## 8. What this is NOT

- Not Phase 4 Outbound (sending mail from CRM) — that's a separate spec
- Not document financial extraction (the existing financial agent already does that on PDFs)
- Not memo generation (separate feature)
- Not LinkedIn scraping (firm research agent does that)
