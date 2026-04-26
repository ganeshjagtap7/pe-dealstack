# Performance Optimization — Manual Testing Guide

**Date:** April 26, 2026
**Tester:** QA / Non-technical tester
**Build:** Latest main branch
**Test URL:** Your deployed PE OS URL (or localhost:3000)

---

## Pre-requisites

- Google Chrome browser (required for DevTools)
- A logged-in PE OS account with at least 2-3 deals and some uploaded documents
- Know how to open Chrome DevTools: **Right-click anywhere on page > Inspect** (or press `Cmd + Option + I` on Mac / `F12` on Windows)

---

## Test 1: Page Loads Faster (No Blank White Screen)

**What we changed:** Scripts no longer block the page from rendering. You should see the page layout (header, sidebar, sections) appear almost instantly, even before data loads.

### Steps:

1. Open the **CRM / Deals page**
2. Press `Cmd + Shift + R` (Mac) or `Ctrl + Shift + R` (Windows) to hard refresh
3. **Watch the page carefully as it loads**

### Expected:
- The page header, sidebar, and card grid skeleton (shimmering gray boxes) should appear **within 1 second**
- You should NOT see a blank white screen for 2-3 seconds before content appears
- The skeleton loading animation (shimmering gray shapes) shows up before deal cards render

### Fail:
- Blank white screen for more than 1-2 seconds before anything appears
- Page appears to freeze/hang before showing content

---

## Test 2: Deal Page Loads All Sections at Once

**What we changed:** The deal page now fetches all data (deal info, financials, chat history) at the same time instead of one after another.

### Steps:

1. Open any **Deal page** (click on a deal from CRM)
2. Press `Cmd + Shift + R` to hard refresh
3. **Watch the left panel sections** as they load

### Expected:
- The deal header (name, icon, stage pipeline) appears quickly
- Financial Statements section, Activity Feed, Key Risks, and Documents all start loading **at roughly the same time** — not one after another
- Chat panel on the right starts loading its history at the same time as the left panel

### Fail:
- You see the deal header appear, then a long pause before financials show up
- Sections load one by one with noticeable delays between them
- Chat panel stays empty for several seconds after the left panel is fully loaded

---

## Test 3: Skeleton Loading Animations

**What we changed:** Instead of showing "Loading..." text or empty space, sections now show animated gray placeholder shapes while data loads.

### Steps:

1. Open any **Deal page**
2. Press `Cmd + Shift + R` to hard refresh
3. **Watch these three sections** in the left panel as the page loads:

### Expected:

| Section | What you should see while loading |
|---------|----------------------------------|
| **Key Risks** | 3 shimmering rows with a light amber/yellow background |
| **Activity Feed** | 3 rows, each with a gray circle on the left + two shimmering text lines on the right |
| **Recent Documents** | 3 rounded rectangle cards (shimmer animation) in a horizontal row |

- Once data arrives, the skeletons get replaced with real content
- There should be NO visible "jump" or layout shift when real content replaces skeletons

### Fail:
- You see text like "Loading risks..." or "Loading activities..." instead of skeleton shapes
- You see "No documents uploaded yet." flash briefly before real documents appear
- The page layout jumps/shifts when content loads (things move around)

---

## Test 4: Instant Page Loads on Revisit (Caching)

**What we changed:** After you visit a page once, the data is saved locally. When you come back, it shows instantly while fresh data loads in the background.

### Steps:

**Part A — CRM Deals Page:**

1. Open the **CRM / Deals page** — wait for deals to fully load
2. Click on any deal to go to the Deal page
3. Click the **back arrow** or **"Deals"** in the sidebar to go back to CRM
4. **Watch how fast the deals appear**

**Part B — Deal Page:**

1. Open any **Deal page** — wait for it to fully load
2. Go to the **CRM page** (click sidebar)
3. Click the **same deal** again
4. **Watch how fast the deal info appears**

### Expected:
- **Part A:** Deals should appear **instantly** (no spinner, no loading animation). You may see a very brief flicker as fresh data replaces cached data, but the page should NOT be empty.
- **Part B:** The deal header, metrics, and sections should appear **instantly** on the second visit. No skeleton loading, no spinner — content is already there.
- Open Chrome DevTools Console (`Cmd + Option + J`). You should see messages like:
  - `[CRM] Rendered from cache, refreshing...`
  - `[Deal] Rendered from cache, refreshing in background...`

### Fail:
- You see the loading spinner (rotating circle) again on revisit
- The page is blank/skeleton for 1+ seconds on revisit
- No `Rendered from cache` message appears in the Console
- Deal data shows stale/wrong information (e.g., old name after you just renamed it)

---

## Test 5: Cache Expires After Time

**What we changed:** Cached data expires after a set time (deals list = 5 minutes, individual deal = 2 minutes), so users always get fresh data eventually.

### Steps:

1. Open the **CRM / Deals page** — deals load and get cached
2. **Wait 5+ minutes** (or change your system clock forward by 5 minutes)
3. Navigate away and come back to the CRM page

### Expected:
- After 5 minutes, the cache has expired
- You should see the **loading spinner** again (not cached instant load)
- Fresh data loads from the server

### Fail:
- Deals still load instantly from cache after 5+ minutes (cache never expires)

---

## Test 6: Resizable Chat Panel (from earlier update)

**What we changed:** You can now drag the border between the deal details (left) and chat panel (right) to resize them.

### Steps:

1. Open any **Deal page** on a desktop/laptop (not mobile)
2. Find the **thin vertical line** between the left panel and the chat panel
3. **Hover over it** — your cursor should change to a left-right resize cursor (↔)
4. **Click and drag** left or right
5. Release the mouse
6. **Refresh the page** (`Cmd + R`)

### Expected:
- Dragging left makes the chat panel wider, deal details narrower
- Dragging right makes the deal details wider, chat panel narrower
- After refresh, the panel sizes should be **remembered** (same as you left them)
- **Double-click** the resize handle to reset to default sizes

### Fail:
- Cannot find or see the resize handle
- Dragging doesn't work or panels don't resize
- Panel sizes reset to default after page refresh (not remembered)
- Panels can be dragged too small (text gets cut off or unreadable)

---

## Test 7: Everything Still Works (Regression Check)

After all performance changes, make sure basic features still work:

### Steps:

1. **CRM Page:**
   - [ ] Deals load and display correctly
   - [ ] Filters work (Stage, Industry, Deal Size, Priority)
   - [ ] Sort works (Sort by Recent, etc.)
   - [ ] Search works
   - [ ] Click a deal to open it

2. **Deal Page:**
   - [ ] Deal header shows correct name, icon, stage
   - [ ] Pipeline stages display correctly
   - [ ] Lead Partner / Analyst / Source / Last Updated show correct values
   - [ ] Financial metrics cards show (Revenue, EBITDA, etc.)
   - [ ] Financial Statements section loads (if deal has financials)
   - [ ] Key Risks section shows risks (or "no risks" message)
   - [ ] Activity Feed shows recent activities
   - [ ] Documents section shows uploaded documents
   - [ ] Chat panel works — can send a message and get a response
   - [ ] "Change Stage" button works
   - [ ] "Edit Deal" button opens the edit modal

3. **Navigation:**
   - [ ] Sidebar links all work (Dashboard, Deals, Contacts, Settings)
   - [ ] Command palette opens with `Cmd + K`
   - [ ] Notifications bell works
   - [ ] Logout works

---

## How to Report Issues

If any test FAILS, please report:

1. **Which test** failed (e.g., "Test 3 — Activity Feed skeleton")
2. **What you expected** vs **what actually happened**
3. **Screenshot** of the issue
4. **Browser console errors** (if any): Open DevTools > Console tab > screenshot any red errors
5. **URL** of the page where the issue occurred

Send reports to the dev team in Slack or Linear.

---

## Summary

| Test | What it checks | Priority |
|------|---------------|----------|
| Test 1 | No blank white screen on load | High |
| Test 2 | All deal sections load together | High |
| Test 3 | Skeleton animations while loading | Medium |
| Test 4 | Instant load on revisit (cache) | High |
| Test 5 | Cache expires correctly | Low |
| Test 6 | Resizable chat panel | Medium |
| Test 7 | Nothing is broken (regression) | Critical |
