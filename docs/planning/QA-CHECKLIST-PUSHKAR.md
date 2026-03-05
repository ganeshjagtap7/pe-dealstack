# PE OS — Multi-Tenancy QA Checklist

**For:** Pushkar
**App URL:** https://pe-dealstack.vercel.app
**Date:** March 1, 2026
**What changed:** We added Organization-level isolation so each firm's data (deals, contacts, documents, etc.) is completely separated. No firm can see another firm's data.

---

## How to Test

Go through each section below. For each item, mark Pass / Fail / Notes. If something looks wrong, screenshot it and share with Ganesh.

---

## 1. New Signup (Create a Fresh Organization)

Open an **incognito/private browser window** so you're logged out.

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1.1 | Go to https://pe-dealstack.vercel.app/signup.html | Signup page loads with fields: Full Name, Work Email, Password, Confirm Password, Firm Name, Your Title | |
| 1.2 | Fill in with a **new test account**: Name: `Pushkar Test`, Email: use a new email (e.g. your personal email or a +alias like `pushkar+test1@yourmail.com`), Password: `Test1234`, Firm Name: `Pushkar Test Firm`, Title: pick any | All fields accept input, password strength indicator shows | |
| 1.3 | Click "Create Account" | Should redirect to the deals page (`crm.html`). No errors. | |
| 1.4 | Check top-left sidebar or header | Should show your name and/or firm name somewhere | |
| 1.5 | Check the Deals page | Should be **empty** — no deals visible (this is a brand new firm) | |
| 1.6 | Go to Contacts page | Should be **empty** — no contacts | |
| 1.7 | Go to Dashboard | Should show zero/empty stats (no deals in pipeline) | |

**Why this matters:** A new signup should create a new Organization. That org starts with zero data — they should NOT see any existing deals from Pocket Fund or other firms.

---

## 2. Existing User Login (Waleed's Account)

Open a **different browser** or another incognito window.

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 2.1 | Go to https://pe-dealstack.vercel.app/login.html | Login page loads | |
| 2.2 | Login with Waleed's account (email: `waleed@pocketfund.org`, password: ask Ganesh if needed) | Should redirect to deals page | |
| 2.3 | Check Deals page | Should see Waleed's existing deals (Luktara, Mile1, Buffer, RB2B, etc.) — around 16 deals | |
| 2.4 | Check Contacts page | Should see existing contacts (11 contacts) | |
| 2.5 | Check Dashboard | Should show stats with real data (pipeline counts, etc.) | |

**Why this matters:** Existing users should see their data exactly as before — nothing should be missing.

---

## 3. Cross-Organization Isolation (THE CRITICAL TEST)

With both accounts logged in (Pushkar Test in one browser, Waleed in another):

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 3.1 | In Pushkar's browser — check Deals page | Should see **0 deals** (empty) | |
| 3.2 | In Waleed's browser — check Deals page | Should see **16 deals** (Luktara, etc.) | |
| 3.3 | In Pushkar's browser — create a new test deal (click "+ New Deal" or "Add Deal") | Deal should be created successfully | |
| 3.4 | In Waleed's browser — refresh the Deals page | Waleed should **NOT see** Pushkar's new deal | |
| 3.5 | In Pushkar's browser — add a test contact | Contact should be created | |
| 3.6 | In Waleed's browser — check Contacts page | Waleed should **NOT see** Pushkar's contact | |

**Why this matters:** This is the main security test. Firm A should never see Firm B's data.

---

## 4. Team Invitation Flow

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 4.1 | Login as Waleed → Go to Settings page | Settings page loads | |
| 4.2 | Look for "Team" or "Invite" section | Should see option to invite team members | |
| 4.3 | Send an invitation to a test email | Invitation should be created (check if you get an email) | |
| 4.4 | Open the invitation link from the email | Should go to `accept-invite.html` page | |
| 4.5 | Check the invite page | Should show: "You're Invited!", the inviter's name, the firm name, and your role. If the firm has a logo, it should display. | |
| 4.6 | Accept the invitation (fill name + password) | Should create account and redirect to CRM | |
| 4.7 | Check Deals page as the new invited user | Should see the **same deals as Waleed** (same organization) | |

**Why this matters:** Invited users should join the same organization and see the same data as the person who invited them.

---

## 5. Deal Features (Quick Sanity Check)

Login as Waleed and do these quick checks to make sure nothing broke:

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 5.1 | Click on any deal (e.g. Luktara) | Deal detail page loads with all info | |
| 5.2 | Check the Documents/VDR tab | Documents load, folders visible | |
| 5.3 | Upload a test document | Upload succeeds, appears in the file list | |
| 5.4 | Check Financial Statements tab | Financial data loads (if any was extracted) | |
| 5.5 | Check Activities tab | Activity timeline shows | |
| 5.6 | Try the AI Chat (if available) | Chat responds without errors | |

---

## 6. Contacts Features (Quick Sanity Check)

| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 6.1 | Go to Contacts page | Contact list loads | |
| 6.2 | Try search | Filters contacts correctly | |
| 6.3 | Try switching Grid/List view | Layout toggles between card grid and list | |
| 6.4 | Try sorting (dropdown) | Contacts reorder correctly | |
| 6.5 | Click "More" → "Export to CSV" | Downloads a CSV file | |

---

## What to Report

For each section, tell us:
1. **Pass/Fail** for each item
2. **Screenshots** of any failures or unexpected behavior
3. **Any data that looks wrong** — e.g., seeing another firm's deals, missing data, errors on screen
4. **Browser + device** you tested on (e.g., Chrome on Mac, Safari on iPhone)

Priority bugs (report immediately):
- Seeing another firm's data (deals/contacts/documents)
- Signup fails or shows error
- Login fails for existing accounts
- Empty data where you expected to see existing deals

---

## After Testing — Cleanup

If you created a test account (`Pushkar Test Firm`), let Ganesh know so we can clean it up from the database if needed.

---

*Generated by Ganesh — March 1, 2026*
