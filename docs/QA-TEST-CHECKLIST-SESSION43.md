# PE OS — QA Test Checklist (Session 43 Release)

**For:** Tester / QA team
**Date:** March 22, 2026
**What changed:** AI agent bug fixes + enhancements (6 features affected)

---

## Before You Start

- Log in to PE OS
- Have at least **1 deal** with uploaded documents (PDF/Excel with financials)
- Have at least **1 contact** in the system
- Have at least **2 deals** (needed for comparison test)

---

## Test 1: Contact Enrichment — Honest Confidence Scores

**Where:** Contacts page → click any contact → "AI Enrich" button

**What changed:** Confidence scores are now capped based on how much info the contact has. Less info = lower max confidence. AI can't claim 95% confidence from just a name.

| Input Available | Max Confidence Allowed |
|----------------|----------------------|
| Name only | 30% |
| Name + email | 50% |
| Name + email + company | 70% |
| Name + email + company + title | 85% |

**Steps:**
1. Create or find a contact with **only a name** (no email, no company)
2. Click "AI Enrich"
3. Check the confidence score

**Pass criteria:**
- [ ] Confidence score is **30% or below** for name-only contacts
- [ ] Confidence badge shows appropriate color (red/amber for low, green for high)
- [ ] Results still appear (job title, company, etc.) even at low confidence
- [ ] Low-confidence results are flagged for review, NOT auto-saved

**Bonus:** Try enriching a contact that has name + email + company. Confidence should be noticeably higher (up to 70%).

---

## Test 2: Deal Chat — Financial Data Visible

**Where:** Deal page → Chat tab (bottom right)

**What changed:** Chat can now see ALL financial statements, including ones in "needs review" status. Previously it missed statements that weren't marked active.

**Steps:**
1. Open a deal that has extracted financial statements
2. Open the chat panel
3. Ask: **"What are the financials for this deal?"**

**Pass criteria:**
- [ ] Chat returns actual financial data (revenue, EBITDA, margins, etc.)
- [ ] Response includes specific numbers from the extracted statements
- [ ] No error messages
- [ ] If the deal has statements in "needs review" status, those are included too

---

## Test 3: Deal Chat — Compare Deals

**Where:** Deal page → Chat tab

**What changed:** The comparison tool now works correctly. It uses the current deal's context properly instead of losing track of which deal you're on.

**Steps:**
1. Open Deal A's page
2. Open the chat panel
3. Ask: **"Compare this deal with [Deal B name]"**
   (use the actual name of another deal in your system)

**Pass criteria:**
- [ ] Chat returns a side-by-side comparison
- [ ] Both deals' data is shown (revenue, EBITDA, stage, size, etc.)
- [ ] No error like "deal not found" or empty comparison
- [ ] The current deal is correctly identified (not confused with the other one)

---

## Test 4: Chat File Attachments

**Where:** Deal page → Chat tab → paperclip (📎) button

**What changed:** New feature — you can now attach files in chat. The file uploads to the VDR (Data Room), then the AI agent can search and reference it.

**Steps:**
1. Open any deal's chat
2. Look for the **📎 (paperclip) button** next to the message input
3. Click it and select a file (PDF or Excel)
4. You should see an **attachment chip** appear below the input showing the file name
5. Type a message like **"Summarize the attached file"** and send

**Pass criteria:**
- [ ] 📎 button is visible next to chat input
- [ ] File picker opens on click
- [ ] Attachment chip appears with filename after selecting
- [ ] Message sends successfully with the attachment
- [ ] File appears in the deal's Data Room (VDR) after upload
- [ ] AI references the uploaded file in its response
- [ ] Can remove the attachment chip before sending (click X on chip)

---

## Test 5: Meeting Prep — Financial Data + Export

**Where:** Deal page → three-dot menu (⋮) → "Meeting Prep"

**What changed:** Meeting prep now includes financial data from the deal's extracted statements. Also added an "Export to Doc" button to download the brief.

**Steps:**
1. Open a deal that has extracted financial statements
2. Click the ⋮ menu → "Meeting Prep"
3. (Optional) Enter a meeting topic and date
4. Click Generate
5. Review the brief
6. Click **"Export to Doc"**

**Pass criteria:**
- [ ] Brief generates successfully (5-15 seconds)
- [ ] Brief includes **financial data** (revenue, EBITDA, growth rates, etc.)
- [ ] Talking points reference actual numbers from the deal
- [ ] "Export to Doc" button is visible
- [ ] Clicking export downloads a `.txt` file
- [ ] Downloaded file contains the full brief content

---

## Test 6: Portfolio Chat — Consistent Responses

**Where:** Portfolio page (or via navigation)

**What changed:** Portfolio chat now uses lower temperature (0.3) for more consistent answers, and includes financial data from deals in its tools.

**Steps:**
1. Navigate to the Portfolio chat
2. Ask: **"Give me a summary of my portfolio"**
3. Ask the **same question again**

**Pass criteria:**
- [ ] Response includes deal names, stages, and key metrics
- [ ] Response includes financial data if deals have extracted statements
- [ ] Two identical questions give **similar** answers (not wildly different)
- [ ] No errors or empty responses

---

## Quick Reference — What Goes Where

| Feature | Page | How to Access |
|---------|------|---------------|
| Contact Enrichment | Contacts | Click contact → "AI Enrich" button |
| Deal Chat | Deal page | Chat panel (bottom right) |
| Chat File Attach | Deal page | 📎 button in chat input |
| Meeting Prep | Deal page | ⋮ menu → "Meeting Prep" |
| Portfolio Chat | Portfolio | Chat panel |

---

## Bug Report Template

If something fails, please note:

```
Feature: [which test #]
Steps to reproduce: [what you did]
Expected: [what should happen]
Actual: [what happened instead]
Screenshot: [attach if possible]
Deal/Contact used: [name or ID]
```

---

**Total checks: 28**
**Estimated testing time: 20-30 minutes**
