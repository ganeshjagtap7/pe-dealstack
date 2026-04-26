# PE OS — QA Test Checklist (Session 47 Release)

**For:** Pushkar
**Date:** March 28, 2026
**What changed:** Fixed ALL previously reported failures + major AI upgrades

---

## What Was Fixed (Your Previous Issues)

| Your Report | What Went Wrong | What We Fixed |
|-------------|-----------------|---------------|
| Contact Enrichment showed 0% confidence with all fields filled | The AI was crashing silently and defaulting to 0% | Rebuilt the entire enrichment — now searches your CRM documents, scrapes the company website, and gives honest scores |
| Contact Enrichment showed 95% with no data | AI was hallucinating fake data with inflated confidence | Confidence is now based on REAL data found (documents, deals, website), not AI guessing |
| Deal Chat said "no financial statements" even though they were visible | Chat was using old code that didn't have access to financial data tools | Chat now uses a smart AI agent with 6 tools including a financial data tool |
| Deal Chat "Compare this deal" didn't work | Same old code — no comparison tool available | Agent now has a deal comparison tool that searches by name |
| Deal Chat "error processing request" on everything | The AI agent existed but was never connected to the chat route | Fixed the wiring — agent is now properly connected |
| Meeting Prep "Failed to generate brief" | A database query was crashing the whole feature | Removed the crashing query, made everything fault-tolerant |
| Portfolio Chat "Failed to get AI response" | Same underlying AI connection issue | Fixed alongside the deal chat fixes |
| Chat file attachment — AI didn't reference the file | AI couldn't search for recently uploaded docs | Agent now searches documents by name when you attach files |

---

## Before You Start

1. Log in to PE OS
2. Have at least **2 deals** with uploaded documents (PDF/Excel with financials extracted)
3. Have at least **2 contacts** — one with full info (name + email + company + title), one with just a name
4. Make sure at least one deal has **extracted financial statements** visible on the deal page

---

## Test 1: Contact Enrichment (COMPLETELY REBUILT)

**Where:** Contacts page > Click any contact > "AI Enrich" button

**What's new:** The enrichment now searches YOUR actual CRM data — documents, deals, company website. It classifies contacts by type (banker, founder, advisor, etc.) and suggests next actions.

### Steps:

**Test 1A — Contact with full info (name + email + company + title)**

1. Open a contact that has name, email, company, and title filled in
2. Click "AI Enrich"
3. Wait 5-10 seconds

**Pass criteria:**
- [ ] Loading spinner shows while enriching
- [ ] Results card appears with confidence score
- [ ] Confidence should be **30-85%** (NOT 0%, NOT 95%)
- [ ] Shows **Contact Type** badge (e.g., "Founder / Owner", "Investment Banker", "Advisor")
- [ ] Shows **Key Insight** (blue box) — one sentence about why this person matters
- [ ] Shows **Suggested Action** (green box) — e.g., "Schedule meeting", "Add to outreach pipeline"
- [ ] Shows **Sources** at bottom — should list real sources like "company_website", "email_domain", "crm_docs(3)"
- [ ] If contact's company matches a deal name, shows **Linked Deals** section
- [ ] If other contacts exist at same company, shows those connections
- [ ] If contact has a corporate email, shows "Find on LinkedIn" link
- [ ] If contact hasn't been contacted in 90+ days, shows orange **stale warning**

**Test 1B — Contact with only a name**

1. Create a new contact with ONLY a first name and last name (no email, no company)
2. Click "AI Enrich"

**Pass criteria:**
- [ ] Confidence should be **10-30%** (low, because we have no data to work with)
- [ ] Status shows "Needs Review" (amber) — NOT "Auto-saved"
- [ ] Results are minimal but honest (not fabricated)
- [ ] Sources show limited data available

**Test 1C — Auto-enrichment on new contact**

1. Click "+ Add Contact"
2. Fill in: First name, last name, email (use a corporate email like name@somecompany.com), company name
3. Save the contact
4. Wait 10-15 seconds, then click on the contact to open details

**Pass criteria:**
- [ ] Contact saves successfully (as before)
- [ ] After ~10 seconds, if you re-open the contact details, enrichment data may already be populated (auto-enriched in background)
- [ ] The enrichment tag (e.g., "enriched:medium") may appear in tags

---

## Test 2: Deal Chat — Financial Data

**Where:** Deal page > Chat panel (right side)

**What's new:** Chat now has access to 6 AI tools — it can search documents, fetch financials, compare deals, update fields, and more. Previously it was a basic chatbot with no tools.

### Steps:

1. Open a deal that has **extracted financial statements** visible on the page
2. Open the chat panel
3. Ask: **"What are the financials for this deal?"**

**Pass criteria:**
- [ ] Chat returns actual financial data (revenue, EBITDA, margins, etc.)
- [ ] Response includes **specific numbers** from the extracted statements
- [ ] Response mentions how many periods/statements are available
- [ ] NO "error processing request" message
- [ ] NO "no financial statements available" when statements ARE visible on the page

4. Ask: **"What is the revenue trend?"**

**Pass criteria:**
- [ ] Chat references specific revenue numbers across different periods
- [ ] Mentions growth or decline with actual figures

---

## Test 3: Deal Chat — Compare Deals

**Where:** Deal page > Chat panel

### Steps:

1. Open Deal A's page
2. Ask: **"Compare this deal with [Deal B name]"** (use the actual name of another deal in your system)

**Pass criteria:**
- [ ] Chat returns a side-by-side comparison
- [ ] Shows both deals' data (revenue, EBITDA, stage, deal size, etc.)
- [ ] Shows portfolio averages
- [ ] NO "error processing request"
- [ ] NO "deal not found" (if the deal exists)
- [ ] The current deal is correctly identified

---

## Test 4: Chat File Attachments

**Where:** Deal page > Chat > paperclip button

### Steps:

1. Open any deal's chat
2. Click the paperclip (clip) button
3. Select a file (PDF or Excel)
4. See attachment chip appear below the input
5. Type: **"What is this document about?"** and send

**Pass criteria:**
- [ ] Paperclip button visible
- [ ] File picker opens on click
- [ ] Attachment chip shows filename
- [ ] Can remove chip by clicking X
- [ ] Message sends successfully
- [ ] File appears in the deal's Data Room after upload
- [ ] AI response references the uploaded file or its content
- [ ] NO "error processing request"

---

## Test 5: Meeting Prep — Financial Data + Export

**Where:** Deal page > three-dot menu > "Meeting Prep"

### Steps:

1. Open a deal that has extracted financial statements
2. Click the three-dot menu > "Meeting Prep"
3. (Optional) Enter a meeting topic
4. Click Generate
5. Review the brief
6. Click "Export to Doc"

**Pass criteria:**
- [ ] Brief generates successfully (5-15 seconds) — NO "Failed to generate brief"
- [ ] Brief includes **financial data** (revenue, EBITDA, growth rates if available)
- [ ] Talking points reference actual numbers from the deal
- [ ] Questions to ask are **specific** (not generic like "What are your revenue trends?")
- [ ] "Export to Doc" button is visible
- [ ] Clicking export downloads a .txt file
- [ ] Downloaded file contains the full brief

---

## Test 6: Portfolio Chat

**Where:** Dashboard > AI search/chat bar at the top

### Steps:

1. Click the AI search bar on the Dashboard
2. Ask: **"Give me a summary of my portfolio"**
3. Ask the **same question again**

**Pass criteria:**
- [ ] Response includes deal names, stages, and key metrics
- [ ] Two identical questions give **similar** answers (not wildly different)
- [ ] NO "Failed to get AI response"
- [ ] If deals have extracted financial statements, those numbers appear

---

## Quick Reference

| Feature | Page | How to Access |
|---------|------|---------------|
| Contact Enrichment | Contacts | Click contact > "AI Enrich" button |
| Auto-Enrich | Contacts | Happens automatically when you create a new contact |
| Deal Chat | Deal page | Chat panel (right side) |
| Chat File Attach | Deal page | Paperclip button in chat input |
| Meeting Prep | Deal page | Three-dot menu > "Meeting Prep" |
| Portfolio Chat | Dashboard | AI search bar at top |

---

## New Features to Explore

These are brand new — not fixing old bugs, but new capabilities:

| Feature | What It Does | Where to See It |
|---------|-------------|-----------------|
| **Contact Type** | Classifies contacts as Founder, Banker, Advisor, Board Member, LP, etc. | AI Enrich results card |
| **Key Insight** | One actionable sentence about why this person matters to your deals | Blue box in enrichment results |
| **Suggested Action** | Concrete next step: "Schedule meeting", "Request warm intro", etc. | Green box in enrichment results |
| **Company Website Data** | Scrapes the contact's company website for real info | Shows in Sources as "company_website" |
| **Stale Contact Warning** | Orange alert if you haven't contacted someone in 90+ days | Orange box in enrichment results |
| **LinkedIn Search** | Direct link to find this person on LinkedIn | "Find on LinkedIn" link in results |
| **Same-Company Contacts** | Shows other people in your CRM at the same company | "Other Contacts" section in results |
| **Auto-Enrichment** | Enrichment runs automatically when you create a new contact | Background — check contact after 10 seconds |

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
Error message: [exact text of any error]
```

---

**Total checks: 42** | **Estimated testing time: 25-35 minutes**
