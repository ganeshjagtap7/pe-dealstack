# Financial Extraction QA Guide — For Manual Testing

**Date:** 2026-04-27
**For:** Non-technical reviewer
**Time needed:** 30-45 minutes
**What this covers:** New financial extraction features shipped today

---

## Quick Setup (5 min)

### What you'll need
1. A login to PE OS
2. A few test files on your computer:
   - **A Stripe CSV** (or download `unified_payments.csv` from any Stripe account → Reports → Payments)
   - **A bank statement CSV** (export from any bank account)
   - **A QuickBooks or Xero P&L CSV** (Reports → Profit & Loss → Export)
   - **A CIM PDF** (any company pitch deck or financial PDF)

If you don't have all four, that's fine — test what you can.

### Open the app
1. Go to your PE OS production URL
2. Log in
3. Click on any deal (or create a test deal called "QA Test - April 27")
4. Open the deal page

---

## Test 1: Document Type Picker (NEW)

**What we changed:** When you click "Extract Financials", you now see a popup asking what type of document you uploaded.

**Steps:**
1. Scroll down to the **Financial Statements** section (blue bordered box)
2. Click **"Extract Financials"** button

**What you should see:**
- A modal popup appears with the title "What type of document is this?"
- 5 clickable cards:
  - 📊 Financial Statements (CIM, P&L, Balance Sheet, Cash Flow)
  - 💳 Payment Data (Stripe, PayPal, Square CSV export)
  - 🏦 Bank Statement (Bank PDF or CSV statement)
  - 📒 Accounting Export (QuickBooks, Xero export)
  - ✨ Auto-detect (Let AI figure it out)
- A "Cancel" button at the bottom

**Pass:** Modal appears with 5 options
**Fail:** Modal doesn't appear, only some options shown, or layout is broken

> 📸 **If broken:** Screenshot the modal and the browser console (press F12, go to Console tab)

---

## Test 2: Stripe CSV Extraction (NEW — should be FAST)

**What we changed:** Stripe CSVs now use a dedicated parser. No AI. Should take 2-3 seconds instead of 30-60 seconds.

**Steps:**
1. Upload a Stripe CSV to the deal as a document (use the document upload area)
2. Click **"Extract Financials"**
3. In the type picker modal, click **"Payment Data"**
4. Wait — should be very fast (under 5 seconds)

**What you should see:**
- The "Extracting..." button shows briefly, then disappears
- A modal pops up with extraction results
- The financial table populates with monthly revenue
- **Numbers should match the actual CSV file**

**How to verify accuracy:**
1. Open the Stripe CSV in Excel
2. Filter `Status = Paid`
3. Group by month, sum the `Amount` column
4. Compare to what's shown in PE OS — should match within $1

**Pass:** Numbers match the CSV, extraction took under 10 seconds
**Fail:** Numbers are way off (like 1000x bigger), or extraction took as long as before

---

## Test 3: Bank Statement Extraction (NEW)

**Steps:**
1. Upload a bank statement CSV to a deal
2. Click "Extract Financials" → "Bank Statement"
3. Wait for extraction (should be fast, no AI)

**What you should see:**
- Monthly summary showing inflows (deposits) and outflows (debits)
- Net cash flow per month
- Expense categories detected (Payroll, Rent, Utilities, etc.) when bank descriptions match patterns

**Pass:** Inflows roughly match deposits in the CSV, outflows match debits
**Fail:** Numbers are wrong, all transactions categorized as "other"

---

## Test 4: Accounting Export (NEW)

**Steps:**
1. Export a P&L from QuickBooks or Xero (Reports → P&L → Export to CSV)
2. Upload to a deal
3. Click "Extract Financials" → "Accounting Export"

**What you should see:**
- Revenue, COGS, Gross Profit, Operating Expenses, Net Income — all populated
- Per-month columns matching the QuickBooks/Xero report

**Pass:** Numbers match QuickBooks/Xero exactly
**Fail:** Categories not mapped correctly, missing line items

---

## Test 5: Financial Statements PDF (LlamaParse — UPDATED)

**What we changed:** PDFs now go through LlamaParse first for better table extraction.

**Steps:**
1. Upload a CIM PDF or financial PDF to a deal
2. Click "Extract Financials" → "Financial Statements"
3. Wait 30-60 seconds (this still uses AI)

**What you should see:**
- Multiple periods extracted (e.g., 3 years of data)
- Revenue, EBITDA, Net Income populated
- Confidence badges per period (green/amber/red)

**Pass:** Numbers match the PDF source document, multiple periods captured
**Fail:** Numbers wildly off, only one period extracted, or extraction times out

---

## Test 6: Cell-Level Trust Signals (NEW)

**What we changed:** Every cell in the financial table now shows how confident the system is.

**After any successful extraction, look at the table:**

**What you should see:**
- A legend above the table: `● Verified (80%+) ● Review suggested ● Unverified`
- Cell backgrounds colored differently based on confidence:
  - **White** — high confidence (verified with source)
  - **Amber/yellow** — medium confidence (review suggested)
  - **Light red** — low confidence (unverified)
- Small ⚠ warning icons on amber/red cells

**Test the hover tooltip:**
1. Hover your mouse over any cell with a number
2. A tooltip should appear

**What the tooltip should show:**
- For verified cells: Source quote (the exact text from the document), confidence %, extraction method, document name
- For unverified cells: "No source citation — This value was inferred by AI but could not be traced to a specific location in the document. Verify manually."

**Pass:** Colored backgrounds appear, tooltips show on hover, source quotes are visible
**Fail:** All cells look the same, no tooltips appear, or tooltips show garbled text

---

## Test 7: Re-extraction (existing)

**Steps:**
1. On a deal that already has extracted financials, click **"Re-extract"** button (top-right of financial section)
2. Pick a document type
3. Wait for completion

**What you should see:**
- Extraction modal shows updated results
- Financial table refreshes with new data
- No duplicate periods

**Pass:** Re-extraction overwrites old data cleanly
**Fail:** Duplicates appear, old data persists, or table breaks

---

## Test 8: No Console Errors (technical sanity check)

**Steps:**
1. Press **F12** (or right-click → Inspect → Console tab)
2. Refresh the deal page
3. Wait 60 seconds

**What you should see:**
- Mostly white/black messages (info logs)
- Maybe ONE warning about notifications (this is OK)

**What you should NOT see:**
- Red error messages flooding the console (especially "Failed to load notifications" repeating every 30s)
- "404" errors on the financials endpoint
- "Promise rejection" errors

**Pass:** Console is mostly quiet, at most 1-2 warnings
**Fail:** Red errors keep appearing every few seconds

---

## Test 9: Type Picker Cancel Button

**Steps:**
1. Click "Extract Financials"
2. In the popup, click "Cancel" at the bottom

**What you should see:**
- Modal closes
- No extraction starts
- Page stays as-is

**Pass:** Cancel works
**Fail:** Cancel button doesn't close the modal, or extraction starts anyway

---

## Test 10: Auto-detect Option

**Steps:**
1. Upload any document (PDF or Excel)
2. Click "Extract Financials" → "Auto-detect"
3. Wait for extraction

**What you should see:**
- The system uses AI (LangGraph agent) to figure out what's in the document
- Same result as picking "Financial Statements" for most cases
- Takes 30-60 seconds (AI is slow)

**Pass:** Extraction completes with reasonable results
**Fail:** Errors out, returns empty, or runs forever

---

## Bug Report Template

If you find an issue, report it in this format:

```
## Bug: [One-line description]

**Test number:** Test #X (from this guide)
**Browser:** Chrome/Safari/Firefox + version
**What I did:**
1. ...
2. ...

**What I expected:**
...

**What actually happened:**
...

**Document used:**
- File name: ...
- File type: ...
- File size: ...

**Screenshot:** [attach screenshot of the page]
**Console errors:** [press F12, copy any RED text from Console tab]
```

---

## Priority Levels (for triage)

| Priority | Meaning | Examples |
|----------|---------|---------|
| **P0 - Critical** | Feature completely broken | "Extract Financials" button does nothing, page crashes |
| **P1 - High** | Wrong results | Numbers are 1000x too big, wrong currency shown |
| **P2 - Medium** | Cosmetic/UX issues | Modal layout broken on mobile, tooltip cut off, slow loading |
| **P3 - Low** | Nice to have | Confidence badge color is slightly off, minor text issues |

---

## Final Summary Checklist

After all tests, fill this in:

| Test # | Feature | Pass / Fail | Notes |
|--------|---------|------------|-------|
| 1 | Document type picker | ⬜ Pass / ⬜ Fail | |
| 2 | Stripe CSV (Payment Data) | ⬜ Pass / ⬜ Fail | |
| 3 | Bank statement CSV | ⬜ Pass / ⬜ Fail | |
| 4 | Accounting export (QB/Xero) | ⬜ Pass / ⬜ Fail | |
| 5 | Financial Statements PDF | ⬜ Pass / ⬜ Fail | |
| 6 | Cell trust signals + tooltips | ⬜ Pass / ⬜ Fail | |
| 7 | Re-extraction | ⬜ Pass / ⬜ Fail | |
| 8 | Console errors | ⬜ Pass / ⬜ Fail | |
| 9 | Cancel button | ⬜ Pass / ⬜ Fail | |
| 10 | Auto-detect option | ⬜ Pass / ⬜ Fail | |

**Overall:** _____ / 10 tests passed

**Tester name:** ________________
**Date tested:** ________________
**Browser:** ________________
**Time spent testing:** _____ minutes

---

## What to Do With Results

- **All 10 pass:** Send a quick "All tests passed" message — we're good to ship
- **8-9 pass:** Send the failed test numbers + screenshots — most likely minor issues
- **Less than 8 pass:** Schedule a quick call to walk through what broke

For any P0 (critical) bugs, send immediately — don't wait to finish all tests.
