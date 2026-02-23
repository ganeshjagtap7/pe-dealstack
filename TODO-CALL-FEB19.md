# PE OS — To-Do List from Feb 19 Call

> **Source:** Call transcript — Ganesh, Aum Thakarkar, Dev Shah, hello admin (tester)
> **Date of call:** Feb 19, 2026
> **Created:** Feb 21, 2026
> **Last audit:** Feb 23, 2026 (code review)

---

## 🔴 P0 — Critical Bugs (Blocking / Breaking)

These are broken features that currently affect credibility with testers/clients.

### 1. Invite Team — Email Not Sending — ✅ DONE (config fix)
- **Status:** Code is fully implemented using Resend email service. Was blocked by missing `RESEND_API_KEY` env var.
- **Fix applied:** Added `RESEND_API_KEY` to `apps/api/.env` on Feb 23.
- **Remaining:**
  - [ ] Add `RESEND_API_KEY` to Render production env vars
  - [ ] Test end-to-end invite flow in production
- **Ref:** (00:14:10)

### 2. Deal Values — Wrong Units ($38.2M vs $38.2K) — ✅ DONE
- **Status:** Fully fixed. All values stored internally in millions. Frontend auto-formats to K/M/B based on magnitude. Edit modal has unit dropdown ($, $K, $M, $B). AI extractor auto-converts during ingestion.
- **Key files:** `deal.js:192-211` (formatCurrency), `deal.js:2165-2206` (unit conversion), `aiExtractor.ts:4-12`
- **Action:** No further work needed.
- **Ref:** (00:15:44), (00:16:25), (00:17:17)

### 3. Cannot Delete Files or Deals from Data Room — ✅ DONE
- **Status:** Fully implemented in commit `ebd4440` (Feb 23). Cascading deletion covers 11 child tables. UI available in deal detail page (menu → Delete Deal), CRM list (single + bulk delete), and data room (file + folder delete).
- **Key files:** `deals.ts:373-449`, `deal.html:224-228`, `deal.js:103-126`, `crm.html:1082-1143`, `documents.ts:485-535`, `folders.ts:207-272`
- **Action:** No further work needed.
- **Ref:** (00:17:17)

---

## 🟠 P1 — High Priority (Core Product Quality)

Per Aum's guidance: *"Priority should be making the core product outputs accurate and reliable before investing in AI-native input features."*

### 4. Ingest Deal Data — Should Update Existing Deals (Not Just Create New Ones) — ✅ DONE
- **Status:** Fully implemented. Modal now has "Create New Deal" / "Update Existing Deal" toggle. Deal picker with live search. Backend merges extracted data into existing deals (higher confidence wins).
- **What's done:**
  - [x] Mode toggle in Ingest modal: "Create New Deal" vs "Update Existing Deal"
  - [x] Searchable deal picker with live results (searches by name, shows industry + revenue)
  - [x] All 3 ingest paths support `dealId` param (file upload, paste text, URL scrape)
  - [x] Smart merge: updates financial fields only when new extraction has higher confidence or existing is null
  - [x] Merges risks/highlights (appends new unique items)
  - [x] Document always attached to deal's data room regardless of mode
  - [x] Activity log shows "Document Added" for updates vs "Deal Created" for new
  - [x] Extraction preview shows "Deal Updated" vs "Deal Created" dynamically
  - [x] Button labels update: "Extract & Create Deal" → "Extract & Update Deal"
- **Key files:** `deal-intake-modal.js` (mode toggle, deal picker, dealId passing), `ingest.ts` (mergeIntoExistingDeal helper, dealId support on all 3 endpoints)
- **Ref:** (00:23:23), (00:25:43)

### 5. AI Extraction — Reduce Hallucination in Financial Data — ✅ DONE
- **Status:** Fully implemented. Backend extracts with confidence + source quotes. Frontend now displays source quotes, shows "Not Found" for missing values, and lists review reasons.
- **What's done:**
  - [x] Confidence indicators per extracted field (backend + frontend bars)
  - [x] Financial validator catches nonsensical values
  - [x] "Needs Review" flag when confidence is low
  - [x] Source quotes displayed under each field in extraction preview (Feb 23)
  - [x] "Not Found" shown when value is null with 0 confidence (Feb 23)
  - [x] Review reasons listed with specific details (Feb 23)
- **Key files:** `deal-intake-modal.js:165-232` (preview HTML), `deal-intake-modal.js:538-575` (setIntakeField with source)
- **Ref:** (00:20:27), (00:21:27), (00:48:08), (00:51:03)

### 6. Custom Filters — ✅ DONE (was misdiagnosed)
- **Status:** Fully working in `crm.html` (the actual CRM page). Initial audit incorrectly checked `crm-dynamic.html` (an older file).
- **What's working:**
  - [x] Stage filter dropdown with all stages
  - [x] Industry filter (dynamically populated from actual deal data)
  - [x] Deal size range presets (Under $10M, $10-50M, $50-100M, Over $100M)
  - [x] Priority filter (Urgent/High/Medium/Low)
  - [x] Sort by 9 options (Recent, Size, IRR, Revenue, Priority, Name A-Z)
  - [x] Search with debounce across name, industry, thesis
  - [x] Clear All Filters button
  - [x] Backend Zod-validated query params with Supabase filtering
- **Remaining (nice-to-have):**
  - [ ] AI-powered natural language filter (e.g., "show me SaaS deals over $50M")
  - [ ] Persist saved/favorite filter combos per user
- **Ref:** (00:18:14)

### 7. AI Reports / Templates — ✅ DONE
- **Status:** Fully implemented. Templates integrate with memo builder. AI chat quality fixed. Dynamic prompt chips. Citation preview.
- **What's done:**
  - [x] Template CRUD API (create, update, delete, duplicate, sections)
  - [x] Templates page and JS script
  - [x] AI analyst chat persistence
  - [x] Fix template preview to open in-app modal (was `window.open()` popup)
  - [x] Fix AI chat quality degradation (duplicate message bug — user msg saved then re-fetched + re-appended)
  - [x] Integrate templates with memo builder (backend auto-populates sections from template, increments usageCount)
  - [x] "Use Template" button on templates page → navigates to memo builder with `?templateId=<id>`
  - [x] Dynamic deal-specific prompt chips (section-aware, deal-aware, replaces static chips)
  - [x] Citation/file preview (matches source to deal documents, opens fileUrl or shows toast)
- **Key files:** `memos.ts` (templateId in schema, SECTION_TYPE_MAP, chat dedup fix), `templates.html` (preview modal, Use Template btn), `templates.js` (in-app preview, useSelectedTemplate), `memo-builder.html` (dynamic chips container), `memo-builder.js` (templateId handling, renderPromptChips, showCitation)
- **Ref:** (00:18:14), (00:12:10), (00:31:40), (00:32:35)

### 8. Parakeet Chatbot — History Lost on Close — ✅ DONE
- **Status:** Chat history was being saved to DB all along, but a CSS class mismatch prevented the intro message from being removed when history loaded — making it look like history was lost. Fixed Feb 23.
- **What was done previously:**
  - [x] Chat history persistence in database (ChatMessage table per deal)
  - [x] API endpoints: send message, get history, clear history
  - [x] Context preservation (last 10 messages sent to AI)
  - [x] History loaded on page init via `loadChatHistory()`
- **What was fixed (Feb 23):**
  - [x] Fixed intro message removal (wrong CSS class selector `.ai-intro-message`)
  - [x] Removed hardcoded fake document names from intro ("Q3 Financial Model" etc.)
  - [x] Added "X previous messages" header when history loads
  - [x] Added "Clear Chat" button in chat header (calls DELETE /api/deals/:id/chat/history)
- **Key files:** `deal.html:464-493` (chat HTML), `deal.js:1412-1457` (loadChatHistory), `deal.js:1338-1368` (clear chat)
- **Ref:** (00:10:39), (00:11:26)

---

## 🟡 P2 — Medium Priority (UX & Feature Gaps)

### 9. Data Room → Deal Auto-Update Toggle & Document Linking — ✅ DONE
- **Status:** Fully implemented. Upload confirmation modal with "Auto-update deal" toggle. Smart defaults for CIM/financials. "Link to Deal" action in file context menu.
- **What's done:**
  - [x] Upload confirmation modal with file list + "Auto-update deal with extracted data" checkbox
  - [x] Smart default: auto-checked when filename contains `cim`, `teaser`, `financial`, `model`
  - [x] Backend: `autoUpdateDeal` flag on `POST /api/deals/:id/documents` triggers `mergeIntoExistingDeal` (confidence-based merge)
  - [x] "Link to Deal" in file context menu → searchable deal picker modal → copies document to target deal
  - [x] Backend: `POST /api/documents/:id/link` endpoint creates Document copy + auto-merges extracted data
  - [x] Extracted `mergeIntoExistingDeal` into shared `dealMerger.ts` service (used by both ingest + documents routes)
  - [x] Success toast notifications for deal updates and document linking
- **Key files:** `dealMerger.ts` (shared service), `documents.ts` (autoUpdateDeal + link endpoint), `vdr.tsx` (upload modal + link modal), `vdrApi.ts` (uploadDocument options + linkDocumentToDeal), `FileTable.tsx` (Link to Deal menu item)
- **Ref:** (00:05:50), (00:07:21)

### 10. Navigation — Breadcrumbs + Back Support — ✅ DONE
- **Status:** Fully implemented. Breadcrumbs on all key pages. Back buttons on sub-views. Sidebar already links to section roots.
- **What's done:**
  - [x] Breadcrumb trail on deal detail: Deals > {Industry} > {Deal Name} (populated from API data)
  - [x] Breadcrumb on CRM: Dashboard > Deals
  - [x] Breadcrumb on VDR: Deals > {Deal Name} > Data Room > {Folder Name} (updates on folder switch)
  - [x] Breadcrumb on memo builder: Dashboard > AI Reports > {Memo Name} (or Deals > {Deal} > {Memo} if linked)
  - [x] Back button (arrow) on deal, VDR, and memo builder pages (uses history.back())
  - [x] Shared `renderBreadcrumbs()` helper in layout.js for reuse
  - [x] Sidebar already navigates to section roots (no change needed)
- **Key files:** `layout.js` (helper), `deal.html` + `deal.js` (breadcrumb fix), `crm.html`, `vdr.tsx`, `memo-builder.html` + `memo-builder.js`
- **Ref:** (00:09:32), (00:10:39)

### 11. Folder Rename in Data Room — ✅ DONE
- **Status:** Fully implemented. Three-dot context menu on folders with Rename and Delete options. Inline rename with Enter/Escape support, following the same UX pattern as file rename in FileTable.
- **What's done:**
  - [x] Three-dot context menu on folders (appears on hover) with Rename and Delete
  - [x] Inline rename: replaces folder name with focused input, Enter to save, Escape to cancel
  - [x] `renameFolder()` API function in vdrApi.ts (calls existing `PATCH /api/folders/:id`)
  - [x] Delete folder with cascade (removes folder + all child files)
  - [x] Toast notification on rename/delete success
  - [x] Active folder auto-switches if deleted folder was active
- **Key files:** `FolderTree.tsx` (context menu + inline rename), `vdrApi.ts` (renameFolder), `vdr.tsx` (handlers)
- **Ref:** (00:04:57)

### 12. Settings / AI Preferences — ✅ DONE
- **Status:** Fully functional. All 5 settings sections now work: General (profile), AI Preferences (sectors + sensitivity + currency + extraction defaults), Interface (typography + density), Security (password change), Notifications (6 toggle types).
- **What's done:**
  - [x] Password change form with live validation (8+ chars, uppercase, number, match) via Supabase Auth
  - [x] Notification preferences: 6 toggleable types (Deal Updates, Document Uploads, Mentions, AI Insights, Tasks, Comments)
  - [x] Preferred currency dropdown (USD, EUR, GBP, INR, CAD, AUD, JPY, CHF)
  - [x] Auto-extract on upload toggle (default ON)
  - [x] Auto-update deal from extraction toggle (default OFF)
  - [x] Backend schema extended with merge-safe preferences update
  - [x] Industry focus — already worked (sectors + presets + modal)
  - [x] Profile name/title/avatar — already worked
- **Key files:** `settings.html` (UI + JS), `users.ts` (schema + merge logic)
- **Ref:** (00:07:21), (00:08:06), (00:09:32)

### 13. Notifications — Not Fully Wired — ❌ NOT DONE
- **Action:**
  - [ ] Connect notification center to real events
  - [ ] Add notification types: deal created, file uploaded, team member invited, AI extraction complete
  - [ ] Add real-time updates (or polling)
- **Ref:** (00:08:51)

### 14. Admin Page — Not Connected to Platform — ❌ NOT DONE
- **Action:**
  - [ ] Connect Admin page to live data (deals, users, activity)
  - [ ] Fix task creation and assignment flow
  - [ ] Add team activity/audit log to Admin page
  - [ ] Implement role-based views (Admin vs Analyst)
- **Ref:** (00:34:56), (00:35:55)

### 15. Deal Dashboard — Customizable Metrics — ❌ NOT DONE
- **Action:**
  - [ ] Add a "Customize Columns" option on the deals dashboard
  - [ ] Let users toggle which financial metrics are visible
  - [ ] Save preferences per user
- **Ref:** (00:19:25)

---

## 🟢 P3 — Low Priority (Nice-to-Have / Future)

### 16. Google Drive Integration — ❌ NOT DONE
- **Ref:** (00:00:00), (00:01:15), (00:03:57)

### 17. Security / Audit Logs — Frontend — ❌ NOT DONE
- **Ref:** (00:01:15), (00:02:06)

### 18. UI Customization / Theming — ❌ NOT DONE
- **Ref:** (00:08:51)

### 19. Trello-Like Task Board — ❌ NOT DONE
- **Ref:** (00:37:25)

### 20. Contact Intelligence / Relationship Tracking — ❌ NOT DONE
- **Ref:** (00:39:16), (00:40:40)

---

## 📋 Summary — Status Count (as of Feb 23, 2026)

| Priority | Total | Done | Partial | Remaining |
|----------|-------|------|---------|-----------|
| 🔴 P0 | 3 | 3 ✅ | 0 | 0 |
| 🟠 P1 | 5 | 5 ✅ | 0 | 0 |
| 🟡 P2 | 7 | 4 ✅ | 0 | 3 ❌ |
| 🟢 P3 | 5 | 0 | 0 | 5 ❌ |
| **Total** | **20** | **12** | **0** | **8** |

---

## 🎯 Next Build Order (Updated)

**All P0 + P1 complete! ✅**
1. ~~Fix Invite Team email~~ ✅
2. ~~Fix deal value units~~ ✅
3. ~~Add file/deal deletion~~ ✅
4. ~~Custom Filters~~ ✅ (already working)
5. ~~AI Extraction source quotes~~ ✅ (source quotes + "Not Found" + review reasons)
6. ~~Chatbot history UI~~ ✅ (fixed intro removal bug + added clear chat button)
7. ~~Ingest → Update Existing Deals~~ ✅ (mode toggle + deal picker + smart merge)
8. ~~AI Reports / Templates~~ ✅ (in-app preview, chat dedup fix, template→memo integration, dynamic chips, citation preview)

**Next — P2 (4 of 7 done):**
9. ~~Data room auto-update toggle + document linking~~ ✅
10. ~~Navigation — breadcrumbs + back support~~ ✅
11. ~~Folder rename in data room~~ ✅ (three-dot menu + inline rename + delete)
12. ~~Settings / AI Preferences~~ ✅ (password change, notification prefs, currency, extraction defaults)
13–15. Notifications, Admin, Dashboard metrics

**Backlog (P3):**
16–20. Google Drive, Audit UI, Theming, Task board, Contact Intelligence
