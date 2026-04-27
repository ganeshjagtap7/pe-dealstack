# Financial Extraction — Manual QA Testing Guide

**Date:** 2026-04-27
**What changed:** 5-phase accuracy overhaul for the financial extraction pipeline
**Where to test:** Deployed version at production URL
**Who:** Manual QA tester with browser access

---

## Setup Before Testing

1. Log in to PE OS with a valid account
2. Have these test files ready on your computer:
   - A **short PDF** with financial statements (1-5 pages, P&L or Balance Sheet)
   - A **long CIM** PDF (30+ pages, financials buried in appendices)
   - An **Excel file** (.xlsx) with financial data across multiple sheets
   - A **non-USD document** (EUR, INR, or GBP financials) — if available
   - A **scanned/image PDF** — if available
3. Know the correct numbers in at least one of these documents so you can verify accuracy
4. Keep this guide open while testing — check off each item as you go

---

## Test 1: Basic Extraction Works

**Goal:** Extraction completes without errors and shows the result modal.

**Steps:**
1. Go to **CRM** page
2. Click **+ Add Deal** and create a new test deal (name it "QA Test - Extraction")
3. Open the deal page
4. Scroll down to **Financial Statements** section (blue bordered box)
5. Click **Extract Financials** button
6. Wait 30-90 seconds for extraction to complete

**Expected:**
- [ ] Button shows spinning progress ("Extracting... reading file", "analyzing data", "almost done")
- [ ] After completion, a **modal popup** appears with title "Extraction Results"
- [ ] Modal shows a green **"Extraction Complete"** badge (or amber "Conflicts Found")
- [ ] Modal shows **Overall Confidence** percentage with a progress bar
- [ ] Modal shows extracted metrics (Revenue, EBITDA, Gross Margin, EBITDA Margin)
- [ ] Modal shows statement count badges (e.g., "Income: 3 periods", "Balance: 2 periods")
- [ ] Modal shows **Currency** at the bottom (e.g., "$ (USD)")
- [ ] "View Financials" button is visible

**If it fails:**
- Note the exact error message
- Check browser console (F12 > Console tab) for red errors
- Screenshot the error and the console

---

## Test 2: Financial Table Renders After Extraction

**Goal:** After closing the extraction modal, the financial data table actually shows up.

**Steps:**
1. After Test 1's modal appears, click **"View Financials"**
2. The modal should close

**Expected:**
- [ ] Financial Statements section now shows **tabs** (Income Statement, Balance Sheet, Cash Flow)
- [ ] At least one tab has a **data table** with rows (Revenue, EBITDA, Net Income, etc.)
- [ ] Each column header shows a **period** (e.g., "2022", "2023")
- [ ] Each column has a **confidence badge** (green/amber/red percentage)
- [ ] Numbers are formatted with currency symbol (e.g., "$125.3M")
- [ ] A **"Re-extract"** button appears in the top-right of the section
- [ ] The table is NOT empty — if it says "No Financial Data Yet" after extraction succeeded, that's a bug

**If table is empty after successful extraction:**
- Refresh the page (Ctrl+R / Cmd+R) and check if data appears
- If still empty, check browser console for errors
- Screenshot and report

---

## Test 3: Accuracy Check — Compare Numbers

**Goal:** Extracted numbers match the source document.

**Steps:**
1. Open the source document you uploaded (the PDF/Excel)
2. Find the key financial numbers: Revenue, EBITDA, Net Income, Total Assets
3. Compare them against the extracted values in the financial table

**Expected:**
- [ ] Revenue matches the source document (within 1-2%)
- [ ] EBITDA matches the source document (within 1-2%)
- [ ] Currency is correct (if document is in EUR, table should show EUR, not USD)
- [ ] Unit scale is correct (if document says "in thousands", values should be converted to millions)
- [ ] Period labels are correct (2022, 2023, etc. — not garbled)
- [ ] Period types are correct (HISTORICAL for past years, PROJECTED for future estimates)

**If numbers are way off:**
- Note which specific values are wrong and what the correct values should be
- Check if it's a unit scale issue (e.g., showing 125,000 instead of 125)
- Check if it's a currency issue (e.g., INR values displayed as USD)

---

## Test 4: Long Document Chunking

**Goal:** Large CIMs (30+ pages) extract financial data from ALL sections, including appendices.

**Steps:**
1. Create another test deal
2. Upload a **long CIM** (30+ pages) as a document
3. Click **Extract Financials**
4. Wait for completion (may take 60-90 seconds for large documents)

**Expected:**
- [ ] Extraction completes without timeout error
- [ ] Financial data from **later sections/appendices** is captured (not just first few pages)
- [ ] Multiple periods are extracted (if the CIM has 3-5 years of data, all should appear)
- [ ] Confidence is reasonable (70%+ for most values)

**If it times out (>2 min):**
- You'll see: "Extraction timed out (>2 min). The file may be too large"
- Note the file size and page count
- Try again — it may work on retry

---

## Test 5: Excel File Extraction

**Goal:** Excel financial models extract correctly.

**Steps:**
1. Create a test deal
2. Upload an **Excel file** (.xlsx) with financial data
3. Click **Extract Financials**

**Expected:**
- [ ] Extraction completes successfully
- [ ] Data is pulled from the correct sheets (Income Statement, Balance Sheet, not cover pages)
- [ ] Values match the Excel file
- [ ] Unit scale is correct (if Excel header says "in thousands", values are converted)

---

## Test 6: Non-USD Currency

**Goal:** Documents in EUR, GBP, INR, etc. preserve original currency.

**Steps:**
1. Upload a document with non-USD financials (EUR, INR, GBP, etc.)
2. Extract financials

**Expected:**
- [ ] Currency shown in the extraction modal matches the document (e.g., "EUR", "INR")
- [ ] Currency shown in the financial table matches
- [ ] Values are in the document's original currency (NOT converted to USD)
- [ ] Unit conversion is correct within the currency (e.g., "50 Cr" INR = 500M INR)

**Known bug if this fails:**
- If currency shows "USD" when document is clearly in EUR/INR, that's the bug we fixed
- Note the document currency and what PE OS shows

---

## Test 7: Re-extraction

**Goal:** Re-extracting financials works and updates the data.

**Steps:**
1. On a deal with existing financial data, click **"Re-extract"** button
2. Wait for extraction to complete

**Expected:**
- [ ] Re-extraction modal appears with updated results
- [ ] Financial table updates with new data after closing modal
- [ ] No duplicate periods appear (old data replaced, not duplicated)
- [ ] If conflicts exist (same period from different documents), an amber **"Overlapping Periods Found"** banner appears

---

## Test 8: Human Review Section (If Claude is Enabled)

**Goal:** When cross-verification finds disagreements, the review section appears.

> **Note:** This feature requires `ANTHROPIC_API_KEY` to be configured on the server. If it's not set, this test can be skipped — the extraction will work without it.

**Steps:**
1. Extract financials from any document
2. Look at the extraction result modal

**Expected (if Claude is enabled):**
- [ ] If models disagree on any value, an amber **"Review Required"** section appears in the modal
- [ ] Each flagged value shows: field name, "Primary" value, "Verified" value
- [ ] The issue description explains why values differ (if available)

**Expected (if Claude is NOT enabled):**
- [ ] No "Review Required" section appears — this is normal
- [ ] Extraction works as usual with GPT-4o only

---

## Test 9: Confidence Badges

**Goal:** Confidence scoring reflects extraction quality.

**Steps:**
1. Look at the financial data table after extraction
2. Check confidence badges on each period column

**Expected:**
- [ ] Each period has a confidence badge (percentage)
- [ ] **Green** badge for 80%+ confidence
- [ ] **Amber** badge for 50-79% confidence
- [ ] **Red** badge for below 50% confidence
- [ ] Overall confidence in the extraction modal matches what you'd expect for the document quality

---

## Test 10: Validation Flags

**Goal:** Math validation catches inconsistencies.

**Steps:**
1. After extraction, look for an amber **"Validation Flags"** banner above the table
2. Click to expand it

**Expected:**
- [ ] If any math relationships are wrong (Revenue - COGS != Gross Profit), a flag appears
- [ ] Each flag has a clear message explaining the issue
- [ ] Flags are collapsible (click to show/hide)
- [ ] If all math checks pass, no validation banner appears (this is correct)

---

## Test 11: Notification System (Not Related to Extraction, but Check Anyway)

**Goal:** The notification bell doesn't spam errors in the console.

**Steps:**
1. On any page, open browser console (F12 > Console)
2. Wait 60 seconds

**Expected:**
- [ ] No repeated red "Error loading notifications" messages flooding the console
- [ ] At most ONE warning about notifications (if there's an issue)
- [ ] The notification bell icon in the header works when clicked

---

## Test 12: Financial Charts

**Goal:** Charts render correctly after extraction.

**Steps:**
1. On the financial table, click **"Revenue"** chart button (bar chart icon)
2. Click **"Growth"** chart button

**Expected:**
- [ ] Revenue bar chart renders with data for each period
- [ ] Growth trend chart renders
- [ ] Switching between chart and table works without errors
- [ ] Balance Sheet tab has a "Composition" chart option that works

---

## Bug Report Template

If you find any issue, report it with this format:

```
## Bug: [Short description]

**Page:** [Which page — e.g., Deal page]
**Steps to reproduce:**
1. ...
2. ...
3. ...

**Expected:** [What should happen]
**Actual:** [What actually happened]

**Screenshot:** [Attach screenshot]
**Console errors:** [Paste any red errors from browser console (F12)]
**Document used:** [File name and type — e.g., "Luktara CIM.pdf", 45 pages]
**Browser:** [Chrome/Safari/Firefox + version]
```

---

## Priority Levels

When reporting bugs, use these priority levels:

| Priority | Meaning | Examples |
|----------|---------|---------|
| **P0 - Critical** | Feature completely broken | Extraction button crashes, table never shows data, page won't load |
| **P1 - High** | Feature works but produces wrong results | Numbers are 10x off, wrong currency, missing periods |
| **P2 - Medium** | Minor issues or cosmetic | Confidence badge wrong color, chart label cut off, slow loading |
| **P3 - Low** | Nice to have | Tooltip missing, alignment slightly off |

---

## Summary Checklist

After completing all tests, fill in this summary:

| Test | Status | Notes |
|------|--------|-------|
| 1. Basic extraction | Pass / Fail | |
| 2. Table renders | Pass / Fail | |
| 3. Accuracy check | Pass / Fail | |
| 4. Long document | Pass / Fail | |
| 5. Excel extraction | Pass / Fail | |
| 6. Non-USD currency | Pass / Fail | |
| 7. Re-extraction | Pass / Fail | |
| 8. Human review UI | Pass / Fail / Skipped | |
| 9. Confidence badges | Pass / Fail | |
| 10. Validation flags | Pass / Fail | |
| 11. Notifications | Pass / Fail | |
| 12. Financial charts | Pass / Fail | |

**Overall result:** _____ / 12 passed
**Tester name:** ________________
**Date tested:** ________________
**Browser used:** ________________
