# PE OS — To-Do List from Feb 19 Call

> **Source:** Call transcript — Ganesh, Aum Thakarkar, Dev Shah, hello admin (tester)
> **Date of call:** Feb 19, 2026
> **Created:** Feb 21, 2026

---

## 🔴 P0 — Critical Bugs (Blocking / Breaking)

These are broken features that currently affect credibility with testers/clients.

### 1. Invite Team — Email Not Sending
- **Issue:** "Invite Team" creates the user record but the invitation email never arrives.
- **Impact:** Team onboarding is completely broken — no one can join the workspace.
- **Action:** Debug the email sending pipeline (Supabase invite / SMTP config). Verify on Render env vars.
- **Ref:** (00:14:10)

### 2. Deal Values — Wrong Units ($38.2M vs $38.2K)
- **Issue:** All financial values are displayed with a hardcoded "M" (millions) unit. A $38.2K deal shows as $0.0382M, which is confusing and looks broken.
- **Impact:** Core product credibility — financial data accuracy is the #1 requirement.
- **Action:**
  - [ ] Add a `unit` field to deal financials (K / M / B / actual number)
  - [ ] Display values in the most natural unit (auto-detect or user-selectable)
  - [ ] During AI extraction, preserve the original unit from the source document
  - [ ] Handle currency conversion properly (AI's training data has outdated exchange rates — use a live API or let user specify currency)
- **Ref:** (00:15:44), (00:16:25), (00:17:17)

### 3. Cannot Delete Files or Deals from Data Room
- **Issue:** Once a file or deal is added to the data room, there's no way to remove it.
- **Impact:** Users get stuck with test data and clutter. Basic CRUD is incomplete.
- **Action:**
  - [ ] Add delete button to data room files (with confirmation dialog)
  - [ ] Add delete/archive option for deals
  - [ ] Ensure proper cascade (deleting a deal cleans up related data room files)
- **Ref:** (00:17:17)

---

## 🟠 P1 — High Priority (Core Product Quality)

Per Aum's guidance: *"Priority should be making the core product outputs accurate and reliable before investing in AI-native input features."*

### 4. Ingest Deal Data — Should Update Existing Deals (Not Just Create New Ones)
- **Issue:** "Ingest Deal Data" always creates a new deal. Users want to select an existing deal and ingest additional data into it (e.g., add new financials, updated CIM).
- **Impact:** Major UX gap — users can't iteratively build up a deal's data.
- **Action:**
  - [ ] Add a toggle/option in the Ingest modal: "Create New Deal" vs "Update Existing Deal"
  - [ ] When "Update Existing" is selected, show a deal picker/search
  - [ ] Ingest the file/text/URL data into the selected deal's data room
  - [ ] Merge extracted financials with existing deal data (with conflict resolution UI)
- **Ref:** (00:23:23), (00:25:43)

### 5. AI Extraction — Reduce Hallucination in Financial Data
- **Issue:** AI approximates values like IRR, EBITDA margins, and sometimes fabricates numbers that aren't in the source document.
- **Impact:** Destroys user trust — financial data must be exact or explicitly marked as estimated.
- **Action:**
  - [ ] Add confidence indicators to each extracted field (already partially built — verify accuracy)
  - [ ] If a value isn't found in the document, show "Not Found" instead of guessing
  - [ ] Add a "Source Quote" for each extracted value showing the exact text it came from
  - [ ] Consider: let users annotate/highlight sections of uploaded docs before AI processes them (hello admin's suggestion)
- **Ref:** (00:20:27), (00:21:27), (00:48:08), (00:51:03)

### 6. Custom Filters — Not Working
- **Issue:** The custom filter feature on the deals dashboard is non-functional. Users can't create filters manually or through AI.
- **Impact:** With 15+ deals, finding specific deals becomes painful without filtering.
- **Action:**
  - [ ] Fix manual custom filter creation (industry, revenue range, stage, etc.)
  - [ ] Wire up the AI filter feature (natural language → filter query)
  - [ ] Persist saved filters per user
- **Ref:** (00:18:14)

### 7. AI Reports / Templates — Broken
- **Issue:** Template links redirect to an external website instead of opening within the app. The AI analyst stops giving quality responses after 2 prompts.
- **Impact:** One of the core "AI-native" features is non-functional.
- **Action:**
  - [ ] Fix template links to open in-app (not external redirect)
  - [ ] Debug AI analyst — likely context window overflow or prompt degradation after 2 turns
  - [ ] File preview in AI Reports — uploaded files can't be opened/previewed for quick review
  - [ ] Add auto-generated sample prompts so new users know what to ask
- **Ref:** (00:18:14), (00:12:10), (00:31:40), (00:32:35)

### 8. Parakeet Chatbot — History Lost on Close
- **Issue:** All conversation history is lost when the chatbot is closed and reopened.
- **Impact:** Users lose valuable analysis context. Feels broken compared to ChatGPT-like experiences.
- **Action:**
  - [ ] Implement chat history persistence (save conversations to Supabase)
  - [ ] Show a conversation list/thread selector (like ChatGPT sidebar)
  - [ ] Preserve context when re-opening a conversation
- **Ref:** (00:10:39), (00:11:26)

---

## 🟡 P2 — Medium Priority (UX & Feature Gaps)

### 9. Data Room → Deal Card Auto-Creation Toggle
- **Issue:** Adding any document to the data room automatically creates a deal card, even for non-deal documents (e.g., internal templates, NDAs). This clutters the deals dashboard.
- **Action:**
  - [ ] Add a checkbox/toggle when uploading to data room: "Create deal from this document?"
  - [ ] Default to unchecked (or smart-detect based on file type/content)
  - [ ] Allow linking existing data room files to existing deals
- **Ref:** (00:05:50), (00:07:21)

### 10. Navigation — Can't Return to Dashboard from Sub-Views
- **Issue:** When clicking into a deal or data room item (e.g., "LTD Ideas"), there's no easy way to go back to the main dashboard/list view.
- **Action:**
  - [ ] Add breadcrumb navigation (Data Room > LTD Ideas > File.pdf)
  - [ ] Make sidebar item click navigate to root of that section (clicking "Data Room" goes to data room list)
  - [ ] Add back button / browser back support
- **Ref:** (00:09:32), (00:10:39)

### 11. Folder Rename in Data Room
- **Issue:** Folders in the data room cannot be renamed after creation.
- **Action:**
  - [ ] Add rename option (right-click / three-dot menu on folders)
  - [ ] Update all references when folder is renamed
- **Ref:** (00:04:57)

### 12. Settings / AI Preferences — Not Functional
- **Issue:** The AI Preferences section in settings is a shell with no working features.
- **Action:**
  - [ ] Build AI model selection (GPT-4, Claude, etc. — if applicable)
  - [ ] Add preferences for: default extraction behavior, preferred currency, industry focus
  - [ ] Profile settings: change password, update name/avatar
- **Ref:** (00:07:21), (00:08:06), (00:09:32)

### 13. Notifications — Not Fully Wired
- **Issue:** Notifications UI exists but isn't connected to real events (file added, deal created, team member joined, etc.)
- **Action:**
  - [ ] Connect notification center to real events
  - [ ] Add notification types: deal created, file uploaded, team member invited, AI extraction complete
  - [ ] Add real-time updates (or polling)
- **Ref:** (00:08:51)

### 14. Admin Page — Not Connected to Platform
- **Issue:** Admin page exists as MVP but is isolated. "View Deck" and other links don't work. Task creation may not be fully functional.
- **Action:**
  - [ ] Connect Admin page to live data (deals, users, activity)
  - [ ] Fix task creation and assignment flow
  - [ ] Add team activity/audit log to Admin page (who did what, when)
  - [ ] Implement role-based views (Admin vs Analyst)
- **Ref:** (00:34:56), (00:35:55)

### 15. Deal Dashboard — Customizable Metrics
- **Issue:** Dashboard shows fixed metrics (IRR, MoM, etc.) which may not be relevant to all buyers. Users want to choose which metrics appear.
- **Action:**
  - [ ] Add a "Customize Columns" option on the deals dashboard
  - [ ] Let users toggle which financial metrics are visible
  - [ ] Save preferences per user
- **Ref:** (00:19:25)

---

## 🟢 P3 — Low Priority (Nice-to-Have / Future)

### 16. Google Drive Integration
- **Issue:** Client wants two-way sync between PE OS data room and their Google Drive. Changes in either should reflect in both.
- **Note:** Complex feature. Aum flagged that this complicates audit/security logging. Needs architecture planning.
- **Action:**
  - [ ] Research Google Drive API for two-way sync
  - [ ] Design connector architecture (webhook-based? polling?)
  - [ ] Address audit logging implications
  - [ ] Support Google Docs real-time collaboration & versioning
- **Ref:** (00:00:00), (00:01:15), (00:03:57)

### 17. Security / Audit Logs — Frontend
- **Issue:** Backend tracks user actions (logins, button presses, data access) but frontend has no UI to view these logs.
- **Action:**
  - [ ] Build audit log viewer in Admin page
  - [ ] Show: user, action, timestamp, affected resource
  - [ ] Add export option for SOC2 compliance reporting
- **Ref:** (00:01:15), (00:02:06)

### 18. UI Customization / Theming
- **Issue:** Users want ability to change colors / personalization.
- **Note:** Aum agreed this is valuable but low priority.
- **Action:**
  - [ ] Add theme options (dark/light mode at minimum)
  - [ ] Optional: accent color picker
- **Ref:** (00:08:51)

### 19. Trello-Like Task Board
- **Issue:** Aum suggested Trello-style cards for deal team tasks — assign, checklists, boards.
- **Note:** Aum explicitly said "lowest priority."
- **Action:**
  - [ ] Design Kanban board for tasks within deals
  - [ ] Assign tasks to team members, set priorities
  - [ ] Add checklists within tasks
- **Ref:** (00:37:25)

### 20. Contact Intelligence / Relationship Tracking
- **Issue:** Ganesh proposed tracking relationship history with contacts — who reached out, when, call transcripts auto-linked.
- **Note:** Aum acknowledged merit but pushed to later priority.
- **Action:**
  - [ ] Design contact timeline view
  - [ ] Auto-link communication history to contacts
  - [ ] Track relationship strength signals
- **Ref:** (00:39:16), (00:40:40)

---

## 📋 Summary — Quick Count

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 P0 | 3 | Critical bugs — fix immediately |
| 🟠 P1 | 5 | Core product quality — this sprint |
| 🟡 P2 | 7 | UX & feature gaps — next sprint |
| 🟢 P3 | 5 | Nice-to-have — backlog |
| **Total** | **20** | |

---

## 🎯 Suggested Build Order

**Week 1 (P0 — Critical Bugs):**
1. Fix Invite Team email sending
2. Fix deal value units (K/M/B + currency)
3. Add file/deal deletion in data room

**Week 2 (P1 — Core Quality):**
4. Ingest Deal Data → update existing deals
5. Fix custom filters
6. Fix AI Reports / Templates
7. Chatbot history persistence

**Week 3 (P1 continued + P2 start):**
8. AI extraction — reduce hallucination (confidence + source quotes)
9. Data room → deal card toggle
10. Navigation / breadcrumbs
11. Folder rename

**Week 4+ (P2 continued):**
12–15. Settings, Notifications, Admin page, Dashboard customization

**Backlog (P3):**
16–20. Google Drive, Audit UI, Theming, Task board, Contact Intelligence
