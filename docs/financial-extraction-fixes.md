# Financial Extraction & Analysis — Fix Log

A running record of bug fixes and pipeline changes for the financial
extraction & analysis subsystem. Newest first. Each entry lists the
symptom, the root cause, the fix, and any caveats. Commit hashes are
intentionally omitted from the body — `git log -- docs/financial-extraction-fixes.md`
or `git log -- apps/api/src/services/agents/financialAgent/` will surface
them as the file moves.

The pipeline at a glance:

```
upload → text-extract → classify → extract → verify → crossVerify → store
   |          |             |          |         |          |          |
 multer   pdfExtractor   financial-  Claude   GPT-4.1-   Claude    Supabase
   /     excelTo-       Classifier  Sonnet   mini       Haiku    Financial-
multipart Markdown                  4.5      (corrects)  (cross-  Statement
                                                          checks) rows
```

Period-scope inference + dedup happen between `classify` and `store`
(server side, in `runDeepPass`). The frontend does its own scope-grouping
in the growth chart on top of whatever periods come back from the API.

---

## Just shipped (this commit)

Three independent fixes pushed together because they all chase the same
production symptom — the `Fight_AI_YTD_Financials_2026.xlsx` extraction
producing the chart spike of `+14079.1%` between `2026 YTD` and
`Apr-26 MTD`, plus 12 false `EBITDA margin > 95%` warnings.

### A. Growth chart filters by inferred period scope

**Symptom:** the Financial Analysis growth chart on `/deals/<id>` rendered
nonsense — a single time series mixing cumulative YTDs, single-month
MTDs, and full-year FY estimates on one X-axis, with growth deltas
computed pairwise across them. Real prod screenshot showed 10 X labels
including duplicates (`2026 YTD`, `YTD 2026`, `YTD Total`,
`YTD Total (Jan-Apr 20, 2026)`, `FY26 Est`, `FY26 Est.`).

**Root cause:** `GrowthChart` in `deal-financials-charts.tsx` computed
`(period[N] − period[N−1]) / period[N−1]` between adjacent points
without filtering by period scope. Comparing a YTD cumulative ($6.7M)
to a single MTD ($950K) yields a meaningless ratio.

**Fix:** parse the period *label string* (the DB `periodType` column
only carries `ACTUAL/PROJECTED` — actual scope lives in the label). A
new helper `inferPeriodScope` regex-classifies labels into one of:
`annual / quarterly / monthly / ytd / mtd / ltm / estimate / other`.
Periods are grouped by scope and growth is computed only inside each
group, never across. Each group renders as its own Chart.js dataset
sharing the X-axis, with a per-scope colour (Banker Blue for Annual,
green for Monthly, amber for YTD, etc.). Legend appears when more than
one scope is present. Tooltip header now reads e.g. `Apr-26 · Monthly`
so the user sees which scope the comparison belongs to.

**Files:**
- `apps/web-next/src/app/(app)/deals/[id]/deal-financials-charts.tsx` (rewrote `GrowthChart`)
- `apps/web-next/src/app/(app)/deals/[id]/deal-financials-period-scope.ts` (new, 101 lines)

**Guards:** single period in a group → group dropped. Missing/empty
period label → bucketed to `"other"` rather than corrupting another.
`prev === 0 || prev == null || curr == null` → pair skipped (existing
check preserved). No usable pairs → empty-state message.

### B. Server-side period dedup + label normalisation

**Symptom:** the same logical period appearing as multiple
`FinancialStatement.period` rows for one deal — e.g. `FY26 Est` plus
`FY26 Est.` (trailing punctuation), `YTD 2026` plus `2026 YTD` plus
`YTD Total` plus `YTD Total (Jan-Apr 20, 2026)` — all collapsing to two
real concepts.

**Root cause:** the LLM (Claude Sonnet in `financialClassifier`) reads
spreadsheet column headers verbatim. No normalisation step before the
upsert.

**Fix:** new helper `normalizePeriodLabel(label)` applies these rules
in order:

1. Trim whitespace.
2. Strip trailing punctuation (`.`, `,`, `:`, `;`).
3. Collapse internal whitespace runs to one space.
4. `"FY<NN> Estimated"` / `"FY<NN> Est."` / `"fy26 est"` → `"FY<NN> Est"`.
5. `"YTD Total (… <YEAR> …)"` → `"YTD <YEAR>"`.
6. `"<YEAR> YTD"` → `"YTD <YEAR>"`.

`dedupePeriods` then merges by lowercased normalised label, bucketed by
`(statementType, periodType)` so a `PROJECTED` "FY26 Est" never collides
with a hypothetical `HISTORICAL` "FY26". Merge winner = highest
`confidence`; tie → most non-null fields; tie → first occurrence. The
loser fills holes in the winner's `lineItems` so we don't lose
information from the loser-row's columns.

Wired into `runDeepPass` in `financialExtractionOrchestrator.ts`, so it
catches every caller — `storeNode`, the vision-extract path, the manual
re-extract endpoint.

**Files:**
- `apps/api/src/services/financialPeriodNormalizer.ts` (new, 282 lines)
- `apps/api/src/services/financialExtractionOrchestrator.ts` (import + dedup call before the upsert loop)

**Logged:** info-level lines `Period dedup: <N> input → <M> output (dropped <N-M> duplicates)` per statement, plus a deal-level summary.

**Deliberately not normalised** (to avoid false-positive merges across
docs spanning multiple years): `"Q1 2026"` vs `"Q1-2026"` vs `"Q1'26"`,
`"Jan-26"` vs `"January 2026"`, `"YTD Total"` (no year) vs `"YTD 2026"`.

### C. Verify-node corrections atomic per statement

**Symptom:** the verify node's `applyCorrections` block was leaving
statements at mixed unit scales — neighbouring periods off by 1000×
because the LLM's per-field corrections only covered a subset of fields.
Combined with #A, this is what drove the `+14079.1%` chart spike. The
prod log showed `25 corrections applied` with `unitScaleIssue: "Source
appears to be in THOUSANDS but extraction assumed MILLIONS"` followed
by 12 EBITDA-margin warnings (95–98%) from the validator catching the
verifier's mess.

**Root cause:** `verifyNode.applyCorrections` overwrote
`(statement, period, field)` cells one by one. When the LLM emitted
unit-scale corrections for revenue/EBITDA/gross-profit but didn't think
to also correct operating-cf/capex/etc, those uncorrected fields stayed
at the wrong scale.

**Fix:** new helper `inferUniformMultiplier(corrections, statementType)`:

1. Collects `correctValue / extractedValue` ratios from numeric corrections.
2. Skips sign-flip corrections (negative ratio) and corrections on
   non-scalable fields (margins, percentages, ratios, headcount, counts,
   `_source` strings).
3. Snaps each ratio onto a known scale set:
   `[0.001, 0.01, 0.1, 1, 10, 100, 1_000, 1_000_000]` with 5% relative tolerance.
4. Picks the *mode* (not mean) — outliers from sign-error corrections
   shouldn't sway the multiplier.
5. Returns the multiplier only when (a) it covers ≥50% of snappable
   corrections AND (b) `result.unitScaleIssue` from the verifier is
   non-null. Otherwise returns null and the loop falls back to per-cell.

When a uniform multiplier is in play, every numeric line-item field on
every period of the affected statement gets multiplied — except cells
already touched by an explicit correction (those are at the verifier's
intended value already). Non-numeric fields (currency, dates, period
labels) and ratio/margin/count fields are skipped via
`isScalableNumericField`.

**File:** `apps/api/src/services/agents/financialAgent/nodes/verifyNode.ts`

**Tradeoff:** the previous code logged every individual correction as
its own agent step. The new code still logs each *explicit* correction
but emits an aggregate `Verify: applied uniform ×N multiplier across <K>
fields` step rather than spamming K lines when a 4-statement × 8-period
sweep happens. Intentional — keeps the agent-step trail readable.

---

## Already shipped (reverse chronological)

### Cross-verify node strips markdown fences before JSON.parse

**Symptom:** every prod extraction logged
`crossVerifyNode: JSON parse failure raw: ` ` ``` ` json …` — Claude Haiku
wrapped the verification array in a markdown code fence despite the
system prompt explicitly asking for raw JSON. The whole cross-verify
pass was silently skipped, losing the multi-model agreement check used
by `storeNode` for the cross-model confidence score.

**Fix:** strip leading ` ```json ` / ` ``` ` and trailing ` ``` ` before
`JSON.parse`. Same defensive strip pattern used in `memos-suggest.ts`.

**File:** `apps/api/src/services/agents/financialAgent/nodes/crossVerifyNode.ts`

### .xlsx upload via data-room now runs full extraction

**Symptom:** uploading an .xlsx to an existing deal via the data-room
saved the bytes and the extracted text (markdown tables) but **never
ran any AI extraction**. Deal-level fields (company, industry, revenue,
EBITDA) didn't populate; the `FinancialStatement` table stayed empty;
the Financial Analysis tab showed nothing.

**Root cause:** `documents-upload.ts` had two extraction branches. The
PDF branch ran `extractDealDataFromText` after text extraction; the
Excel branch only called `excelToMarkdown` for RAG context and stopped
there.

**Fix:**

1. After `excelToMarkdown` succeeds, run `extractDealDataFromText` on
   the markdown — same pattern as the PDF branch. Sets
   `aiExtractedData`, which feeds `extractedDataToSave` /
   `Document.aiAnalysis` / the `autoUpdateDeal` merge path.
2. After the `Document` row is inserted, await
   `runDeepPass({text, dealId, documentId})` — populates the
   `FinancialStatement` table with per-period line items so the
   Financial Analysis tab shows real numbers.

Both calls awaited (Vercel can freeze the function once `res.json` is
sent — fire-and-forget would silently drop). Upload latency goes from
~1s to ~10–30s for a real financial model. Errors logged but never
fail the upload.

**File:** `apps/api/src/routes/documents-upload.ts`

---

## Open follow-ups (not in scope for this round)

- **Encryption utility is dead code.** `apps/api/src/services/encryption.ts`
  implements AES-256-GCM but is never imported. Either wire it up or
  delete.
- **`runFinancialAgent` concurrency throttle (`acquireExtractionSlot`)
  is per-org;** uploads-then-extract via `documents-upload.ts` skips
  it (we call `runDeepPass` directly). If multiple users in one org
  upload Excel at the same time, both run their deep pass in parallel
  and could blow the function memory.
- **`detectUnitScale` per-sheet hint is computed by the Excel parser
  but not threaded through to the verify node.** If it were, the
  verify node could anchor on the parser's hint and avoid even
  *attempting* a unit correction on actual-dollar files.
- **Period-scope inference duplicated client + server.** Frontend
  `inferPeriodScope` (regex on labels) and server normalisation rules
  drift independently. Long-term they should share a canonical
  `periodScope` field on the `FinancialStatement` row, computed once
  on the server and consumed verbatim by the chart.
- **Validator percentage thresholds.** The `EBITDA margin > 80% — verify`
  rule in `financialValidator` flags small SaaS / IP-license businesses
  that legitimately run >95% margin. Worth raising the threshold or
  pairing with an absolute-revenue gate so we don't false-flag small
  startups.
- **Quarter / month label canonicalisation** (`Q1 2026` ↔ `Q1-2026` ↔
  `Q1'26`, `Jan-26` ↔ `January 2026`) is intentionally NOT in the
  current dedup helper because cross-doc merging has higher false-merge
  risk. Could be added later when conflict-detection moves into the
  same path.
