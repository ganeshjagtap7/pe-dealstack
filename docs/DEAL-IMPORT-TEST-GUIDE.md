# Deal Import — QA Testing Guide

**Feature:** AI-Powered Deal Import (CSV / Excel / Paste)  
**Where:** CRM page → "Import Deals" button (top-right area)  
**Goal:** Import deals from our Notion database and verify everything works end-to-end

---

## Getting Your Data from Notion

1. Open your Deals database in Notion
2. **Option A — CSV export:** Click `...` (top-right of the database) → **Export** → choose **CSV**
3. **Option B — Copy-paste:** Select all rows in Notion table → **Cmd+C** → use the **Paste Data** tab in the import modal

Notion CSV export works great. Copy-paste comes as tab-separated — the importer auto-detects it.

---

## Step-by-Step Walkthrough

### Step 1: Open the Import Modal
- Go to the **CRM** page
- Click the **"Import Deals"** button
- Modal opens with 4 steps: `1. Upload → 2. Map Columns → 3. Preview → 4. Result`
- Default tab is "Upload File", second tab is "Paste Data"

### Step 2: Upload or Paste Your Data

**Upload path:**
- Drag & drop your Notion CSV into the drop zone, OR click to browse
- File name + size should appear below the drop zone
- Click **"Analyze with AI"**

**Paste path:**
- Click **"Paste Data"** tab
- Paste your copied Notion table data into the text area
- Click **"Analyze with AI"**

The button shows a spinner with "AI is analyzing..." — takes a few seconds while GPT-4o reads your columns.

### Step 3: Review AI Column Mapping

This is the core AI feature. GPT-4o reads your column headers + sample data and maps them to our deal fields.

You'll see each of your Notion columns listed with:
- An arrow pointing to the mapped deal field
- A confidence % (green = high 80%+, amber = lower)
- A sample value from your data

**You can:**
- Change any mapping using the dropdown
- Set a column to **"Skip"** to ignore it
- Set a column to **"Custom Field"** — stored as extra metadata on the deal

Click **"Apply & Preview"** when you're happy with the mappings.

### Step 4: Preview Before Importing

- Summary shows: `X deals found · Y valid · Z have issues`
- Table displays your deals with mapped columns
- Financial values should be formatted: `$1,000,000`, `25.0%`, `2.5x`
- Red-highlighted rows = missing both company name AND deal name (will be skipped)
- Button says **"Import X Deals"** (only valid deal count)

### Step 5: Import & Verify

- Click **"Import X Deals"**
- Green checkmark + "X deals imported successfully!"
- Shows how many new companies were created
- Any failed rows listed with reasons
- Click "Done" → refresh CRM page → **deals should be in the pipeline**

---

## What to Check After Import

Open the CRM pipeline and spot-check your imported deals:

| Check | What to look for |
|---|---|
| **Deal names** | Match what was in Notion? |
| **Company names** | Correct? New companies auto-created for ones that didn't exist? |
| **Stage** | Mapped correctly? (e.g., "DD" → Due Diligence, "IOI" → IOI Submitted) |
| **Deal size / EBITDA / Revenue** | Numbers correct and properly scaled? If Notion had "50" meaning $50M, should be $50,000,000 |
| **Priority** | Correct? Defaults to MEDIUM if not in your data |
| **Deal detail page** | Click into a deal — all imported data shows up? |
| **Custom fields** | Columns that didn't match standard fields — stored as custom data? |

---

## Edge Cases to Try

| Test | What to Do | Expected Result |
|---|---|---|
| **Empty file** | Upload an empty CSV | Error: "No data rows found" |
| **Wrong file type** | Try uploading a .pdf or .docx | Error: "Please select a CSV or Excel (.xlsx) file" |
| **Large file** | File over 5MB | Error: "File too large. Maximum 5MB" |
| **500+ rows** | CSV with 501+ rows | Error: "Too many rows (X). Maximum 500 deals per import" |
| **Missing names** | Row with no company or deal name | Row marked invalid, skipped during import |
| **Duplicate deal** | Import a deal that already exists in CRM | Fails: "Duplicate deal name: X already exists" |
| **Re-import same file** | Import the same Notion export twice | All rows should fail as duplicates |
| **Excel (.xlsx)** | Upload a .xlsx file | Parses first sheet, warns if multiple sheets exist |
| **Special characters** | Deal names with &, <, >, quotes, accents | Should display correctly |
| **Empty cells** | Some rows have blank columns | Blanks become null — deal still imports if it has a name |
| **Currency symbols** | Values like "$50M" or "€2.5B" | AI detects and applies correct multiplier |
| **Percentage values** | IRR like "25%" | Converts to 0.25 internally, displays as 25.0% |
| **Change mapping manually** | In Step 2, swap two columns using dropdowns | Preview in Step 3 should reflect the manual change |
| **Skip a column** | Set a column to "Skip" in Step 2 | That data should NOT appear on imported deals |

---

## Column Mapping Reference

Common Notion column names and what they should map to:

| Your Notion Column | Should Map To |
|---|---|
| Company / Company Name / Target | Company Name |
| Deal / Deal Name / Project | Deal Name |
| Stage / Pipeline Stage | Stage |
| Size / Deal Size / EV / Enterprise Value | Deal Size ($) |
| EBITDA | EBITDA ($) |
| Revenue / Sales / ARR | Revenue ($) |
| IRR / Projected IRR / Return | IRR (%) |
| Multiple / MoM / MOIC | MoM Multiple |
| Sector / Industry / Vertical | Industry |
| Priority / Urgency | Priority |
| Notes / Description / Thesis | Description |
| Source / Deal Source / Origin | Source |
| Tags / Labels | Tags |
| Close Date / Target Close | Target Close Date |

---

## Valid Pipeline Stages

If your Notion has a "Stage" column, the AI maps these automatically:

| What You Might Have | Maps To |
|---|---|
| Initial Review, New, Screening | INITIAL_REVIEW |
| DD, Due Diligence | DUE_DILIGENCE |
| IOI, IOI Submitted | IOI_SUBMITTED |
| LOI, LOI Submitted | LOI_SUBMITTED |
| Negotiation, Negotiating | NEGOTIATION |
| Closing | CLOSING |
| Passed, Pass, Declined | PASSED |
| Won, Closed Won, Completed | CLOSED_WON |
| Lost, Closed Lost | CLOSED_LOST |

Anything unrecognized defaults to **INITIAL_REVIEW**.

---

## Supported Input Formats

| Format | How |
|---|---|
| CSV | Upload `.csv` file |
| Excel | Upload `.xlsx` file (first sheet only) |
| Paste from Notion | Copy table rows → Paste Data tab (auto-detects tabs) |
| Paste from Excel/Sheets | Copy cells → Paste Data tab |
| Raw CSV text | Paste comma-separated text |

**Limits:** Max 500 deals per import, 5MB file size.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| "AI is analyzing..." hangs >30 seconds | Close modal, retry. OpenAI API might be slow. |
| Mapping looks wrong | Change it manually in Step 2 — every column has a dropdown |
| Numbers are way off | AI may have applied wrong multiplier. Check if your Notion values are in millions vs raw numbers. Re-export and retry. |
| Deals don't show on CRM after import | Hard refresh the page (Cmd+Shift+R). Check if you're looking at the right pipeline stage. |
| "Import failed" with no details | Check browser console (F12 → Console) for errors. Screenshot and share. |

---

## Testing Checklist

Run through each item and mark pass/fail:

- [ ] Modal opens from "Import Deals" button
- [ ] Upload File tab — CSV file accepted
- [ ] Upload File tab — Excel .xlsx file accepted
- [ ] Paste Data tab — Notion paste works
- [ ] AI correctly maps common columns (company, stage, deal size)
- [ ] Confidence scores shown (green/amber)
- [ ] Can manually change column mappings via dropdown
- [ ] Can set column to "Skip"
- [ ] Can set column to "Custom Field"
- [ ] "Apply & Preview" shows correct data table
- [ ] Financial values formatted ($, %, x)
- [ ] Invalid rows highlighted in red
- [ ] Import completes with success message
- [ ] Correct count of imported deals + companies created
- [ ] Deals appear on CRM pipeline after refresh
- [ ] Deal detail page shows all imported data
- [ ] Companies auto-created for new company names
- [ ] Duplicate deal names rejected with clear error
- [ ] Wrong file type rejected (.pdf, .docx)
- [ ] Empty file shows error
- [ ] File over 5MB rejected
- [ ] 500+ rows rejected with clear error
- [ ] Error messages are clear and actionable
