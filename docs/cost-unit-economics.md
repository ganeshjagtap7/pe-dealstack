# PE OS — Cost & Unit Economics (Monthly Snapshot)

**Purpose:** cost-per-deal unit economics → sanity-check pricing & margin.
**Scope:** AI/LLM · document parsing · data acquisition · fixed infra. **Team excluded.**
**Unit:** one **deal** (upload CIM → extract 3-statement model → analyze → memo → ongoing chat).
**Scale modeled:** Beta (~10–15 users / 5–15 firms) and Target (~50 firms / ~150 users).
**Currency:** ₹ INR at **$1 = ₹86** (mid-2026; adjust if needed).
**Status:** grounded in the codebase, priced at PE OS's **own** `ModelPrice` seeds
(`apps/api/usage-tracking-migration.sql`, `model-prices-anthropic-direct-seed.sql`).
Two numbers are estimates you can tighten: **Claude "thinking" tokens** on the cross-verify
extractor, and **deal-chat messages/user/month** (both noted inline).

> **Headline:** unlike a scraping-heavy product, PE OS is a **high-margin SaaS** — fully-loaded
> cost is **~$2–3/deal** and **~$13/user/month**, against $199–479/user pricing (**93–97% gross
> margin**). Cost is dominated by **LLM tokens**, not external data — so the levers are AI
> routing (cross-verify + deal chat), not infra.

---

## 1. What each deal costs

PE OS meters every call through `recordUsageEvent` (`services/usage/trackedLLM.ts`) and prices it
from the `ModelPrice` table. Current routing (`utils/aiModels.ts`, prod env has both
`ANTHROPIC_API_KEY` + `OPENAI_API_KEY`):

| Tier | Model (default) | $/MTok in · out | Used for |
|---|---|---|---|
| TIER1 | **claude-sonnet-4-6** | $3 · $15 | memos, deal chat, extraction reasoning, analysis, meeting prep |
| TIER2 | **gpt-4.1** | $2 · $8 | classifier, vision, narrative insights, signals, enrichment |
| TIER3 | **gpt-4.1-mini** | $0.40 · $1.60 | verify node, emails, fast tasks |
| TIER4 | gpt-4.1-nano | **unpriced → logs $0** ⚠️ | sentiment, routing |
| xverify | **claude-haiku-4-5** | $1 · $5 | financial-agent cross-verify node |
| embed | gemini-embedding-001 | $0.025 / 1M chars | RAG ingest + query |

### A. The cost center — ingesting + extracting one CIM

The 3-statement model comes from `runFinancialAgent`, which runs a **dual-model ensemble**
(`financialCrossVerify.ts`): GPT **and** Claude Sonnet extract the same doc in parallel, a Sonnet
reconciler arbitrates *only if they disagree*, then a gpt-4.1-mini verify + Haiku cross-verify
pass. Typical text path, single chunk, models agree, no self-correct:

| Call (file) | Model | in tok | out tok | Cost |
|---|---|---:|---:|---:|
| Fast pass (`aiExtractor.ts`) | Sonnet 4.6 | ~7.4k | ~1k | $0.037 |
| Classify — GPT (`financialClassifier.ts`) | gpt-4.1 | ~27k | ~6k | $0.102 |
| **Classify — Claude + thinking** (`claudeFinancialClassifier.ts`) | Sonnet 4.6 | ~27k | ~18k* | **$0.351** |
| Verify node (`verifyNode.ts`) | gpt-4.1-mini | ~7k | ~1.5k | $0.005 |
| Cross-verify node (`crossVerifyNode.ts`) | Haiku 4.5 | ~4.2k | ~1k | $0.009 |
| RAG embeddings (`rag.ts`) | gemini | — | — | $0.003 |
| **Total — typical CIM** | | | | **≈ $0.51 (₹44)** |

\* Sonnet runs `thinking: adaptive` + `effort: high` → ~6k visible JSON + **~12k thinking tokens
billed as output**. This call is the single most expensive line in the whole product.

- **+ Reconciler fires** (extractions disagree): **+~$0.40** (another Sonnet thinking call, ~40k in).
- **Worst case** (50-page CIM chunks ×2–4 + 3 self-corrects + reconciler): **~$2.5–3.5**.
- **GPT-only path** (no `ANTHROPIC_API_KEY`): **~$0.14** — the cross-verify ensemble is a **~3.6×**
  multiplier. *This is why the product docs' "$0.05–0.15/extraction" is stale — it predates the
  May cross-verify rebuild; the live default is ~$0.51.*

Guards that cap the blast radius: `DEFAULT_MAX_RETRIES = 3`, `MAX_CONCURRENT_PER_ORG = 2`,
240s/doc wall-clock (`agents/financialAgent/config.ts`, `routes/financials-extraction.ts`).

### B. Everything else per deal

| Item | Model | Calls | Cost | Cached? |
|---|---|---|---:|---|
| Memo (COMPREHENSIVE, 12 sections) | Sonnet 4.6 | up to 12 | ~$0.40 (₹34) | No |
| Deal chat, **per message** (ReAct + tools) | Sonnet 4.6 | 1 + 2–4 tools | ~$0.10 (₹8.6) | system prefix prompt-cached |
| Narrative insights | gpt-4.1 | 1 | ~$0.03 (₹2.6) | **Yes — L1/L2/L3, once/month** |
| Reconcile (on demand) | gpt-4.1 | 4 | ~$0.12 | No |
| Follow-up Qs / multi-doc / enrichment | TIER2/3 | 1–2 | ~$0.05 | No |

### C. Variable cost summary

| Per deal | USD | INR |
|---|---:|---:|
| Ingest + extract one CIM (cross-verify ON) | $0.51 | ₹44 |
| + comprehensive memo | $0.40 | ₹34 |
| + narrative insights (cached, once) | $0.03 | ₹2.6 |
| + deal chat (10 msgs/mo) | $1.00 | ₹86 |
| **≈ per active deal / month** | **≈ $1.9** | **≈ ₹165** |
| External per deal today (embeddings + Tavily) | ~$0.02 | ~₹1.7 |

**Per-firm one-time (onboarding firm research, `firmResearchAgent`):** ~6 Sonnet calls ≈ **$0.25
(₹21)**. Apify scraping is **dormant** (no key → free DuckDuckGo fallback), so $0 today.

---

## 2. Monthly snapshot — two scenarios

### A. Now — beta (10 users / ~12 firms, ~40 CIMs/mo)

| Item | USD | INR |
|---|---:|---:|
| Extraction (40 × $0.51) | $20 | ₹1,720 |
| Memos (~30 × $0.40) | $12 | ₹1,030 |
| Deal chat (10 users × 40 msgs × $0.10) | $40 | ₹3,440 |
| Insights + onboarding + misc | $9 | ₹770 |
| External (embeddings/Tavily; LlamaParse/Apify/Dropbox **off**) | ~$2 | ₹170 |
| Fixed infra (Vercel $20 · Supabase $25 · Sentry $26 · Resend $0) | ~$85 | ₹7,300 |
| **TOTAL** | **≈ $168** | **≈ ₹14,400 / mo** |

Almost half is **fixed infra**; the rest is mostly **deal chat**. Marginal cost/deal is tiny — beta runs on pocket change.

### B. Target — ~50 firms / 150 users (~750 CIMs/mo)

| Item | Driver | USD | INR |
|---|---|---:|---:|
| **Deal chat** | 150 × 50 msgs × $0.10 | **$750** | ₹64,500 |
| **Extraction** | 750 × $0.51 | **$383** | ₹32,900 |
| Memos | ~450 × $0.40 | $180 | ₹15,480 |
| Enrichment / reconcile / multi-doc | mixed | $130 | ₹11,180 |
| Insights (cached) | 750 × $0.03 | $23 | ₹2,000 |
| External (LlamaParse on + Tavily + some NDAs) | variable | ~$150 | ₹12,900 |
| Fixed infra (Vercel · Supabase Pro · Sentry · Resend · LangSmith) | flat+usage | ~$320 | ₹27,500 |
| **TOTAL** | | **≈ $1,940** | **≈ ₹167,000 / mo** |

**Split at scale:** AI **~76%** · external **~8%** · fixed infra **~16%**. The single biggest line
is **deal chat (~39%)**, then **extraction (~20%)** — *both AI, both controllable by routing.*

---

## 3. Unit economics (at target, 750 deals/mo, 150 users)

| Metric | USD | INR |
|---|---:|---:|
| Fully-loaded cost / deal | **$2.59** | **₹223** |
| Marginal cost / deal (ingest + extract + memo + insights, no chat/infra) | **~$0.95** | ₹82 |
| Cost / user / month | **~$13** | ₹1,113 |

---

## 4. Pricing — cost reality vs. the live page

Current pricing (`PE-OS-PRODUCT-SUMMARY.md`): **Boutique $199/user/mo** (5 deal rooms),
**Mid-Market $479/user/mo** (25 rooms), **Enterprise** custom. Against ~$13/user/mo cost:

| Plan | Price/user/mo | Cost/user/mo | Gross margin |
|---|---:|---:|---:|
| Boutique | $199 | ~$13 | **~93%** |
| Mid-Market | $479 | ~$13 | **~97%** |
| Competitor floor (Affinity) | ~$170–225 | — | — |
| DealCloud | ~$200 (+$85K–1.4M/yr total) | — | — |

**Per-seat pricing is wildly profitable — stay there.** The trap is **usage/per-deal pricing**:
Pascal's parked idea ("$10/mo for 10 deals" = **$1/deal**; "$150 for 500" = **$0.30/deal**) is
**below the ~$2.6 fully-loaded and even the ~$0.95 marginal cost/deal** — it loses money on every
deal. If you ever offer per-deal/credits, the floor is **~$1/deal marginal** (price ≥ ₹250/deal for
a healthy margin). The infra already supports it — `OperationCredits` weights encode relative cost
(`firm_research`=40, `financial_extraction`=20, `memo_generation`=15, `deal_chat`=1;
`usage-tracking-migration.sql`).

**Guardrail gap:** there is **no spend/quota cap** today (`AI-USAGE-TRACKING.md`: "Beta is free").
Only soft levers exist — `aiLimiter` 10 req/min, a 1-req/2s throttle, and manual block flags. A
single power user running re-extractions + long chats can spend 10× the average uncapped. Add a
per-org monthly token/$ ceiling before GA.

---

## 5. Sensitivity — it rides on AI routing, not scraping

| Scenario | Extraction | Chat msgs/user/mo | Cost/user/mo | Monthly (150u) |
|---|---|---:|---:|---:|
| Lean | GPT-only ($0.14) | 20 | ~$6 | ~$900 |
| **Central** | **Cross-verify ON ($0.51)** | **50** | **~$13** | **~$1,940** |
| Heavy | + reconciler + vision | 100 | ~$28 | ~$4,200 |

Two variables move the P&L: **(1) cross-verify on/off** (extraction $0.14 ↔ $0.51, a ~$280/mo swing
at 750 deals) and **(2) chat intensity** (20 ↔ 100 msgs/user = $300 ↔ $1,500/mo). The Claude
**thinking-token** estimate (±$0.15/CIM) is the largest single unknown — measure it before locking
margins.

---

## 6. Cost levers (highest impact first)

1. **Deal chat (~39% at scale):** route simple Q&A to gpt-4.1-mini (TIER3) instead of Sonnet
   (~5× cheaper); cap the ReAct tool-loop depth; extend the Anthropic prompt cache to the *deal
   context* block, not just the system prefix (`dealChatAgent/index.ts`).
2. **Cross-verify extraction (~20%):** make it **confidence-gated** — only fan out to the Claude
   extractor when GPT confidence < threshold, instead of always-on. Drops extraction ~3.6×. Or set
   Claude `effort: low` to shrink thinking tokens.
3. **Memo:** each of 12 sections re-sends full deal context — batch/share context across sections.
4. **Prompt caching:** today only system prompts carry `cache_control: ephemeral`; the bulk source
   text (≤30k tok) is un-cached. Cache it on re-extractions.
5. **Fix the metering so you can see all the above:** seed a `gpt-4.1-nano` price (TIER4 logs $0
   today), add LlamaParse to the `UsageEvent` ledger (currently invisible), and track Claude
   thinking tokens separately.

---

## Assumptions & caveats

- **~4 chars/token.** Token counts derive from prompt sizes + code constants (`MAX_TEXT_LENGTH=120k`,
  `VERIFY_SAMPLE_SIZE=15k`, `RECONCILE_MAX_OUTPUT=32k`), ±20–30%.
- **Claude thinking tokens** (`effort: high`) estimated at +6–15k/call — **unobservable from code**;
  the biggest single cost uncertainty. Pull a week of real Sonnet output tokens to lock it.
- Prices are PE OS's **own** `ModelPrice` seeds ($3/$15 Sonnet, $2/$8 gpt-4.1, $1/$5 Haiku…), list
  rate, **no volume discount**; partial prompt-cache savings not fully modeled.
- "Cost to ingest a CIM" assumes **cross-verify ON** (`ANTHROPIC_API_KEY` set — the prod default).
- **Dormant today** (keys absent in dev): LlamaParse, Azure DocIntel, Apify, Dropbox Sign → modeled
  as $0 now, "if-enabled" at target scale. Dropbox Sign carries a **$100/mo floor** if NDAs go live.
- **Metering undercounts true cost:** `gpt-4.1-nano` unpriced ($0 logged), LlamaParse not in the
  ledger, embeddings/Apify/Azure use unverified default prices (code comments say "VERIFY before
  billing").
- Scenarios assume firm/user/deal counts from `BETA-LAUNCH-KIT.md` (beta 10–15 users / 5–15 firms);
  swap in your real funnel and re-run.
- **Chat msgs/user/month (50)** and **memos/deal (≈0.6)** are activity assumptions — tighten from
  the `UsageEvent` table (`SELECT operation, count(*) … GROUP BY operation`).
- $1 = ₹86; set the live rate for exact INR.
