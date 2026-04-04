# Admin Command Center — Design Spec

**Date:** 2026-04-04
**Target User:** Operations Manager / Chief of Staff at PE firms, search funds, investment shops
**Style:** Action-heavy, execution-focused — scan for problems, act immediately
**Architecture:** Single page (`admin-dashboard.html`), 3-file JS split, expand-in-place pattern

---

## 1. Stats Cards (Top Row)

**Current:** Shows dashes with meaningless hardcoded progress bars.

**Fix:**
- Real numbers from API (already working for values)
- Replace progress bars with contextual subtitles:
  - **Team:** "3 active / 5 total" (count active vs inactive users)
  - **Deal Volume:** "$42M across 8 deals"
  - **Overdue:** Red-styled count + "2 due this week" secondary stat
  - **Utilization:** "4/5 members assigned" (members with at least 1 deal)
- **Click action:** Each card scrolls to + filters the relevant section below
  - Team card → scrolls to Resource Allocation
  - Deal Volume → scrolls to Resource Allocation (deal view)
  - Overdue → scrolls to task table, auto-filters to "Overdue"
  - Utilization → scrolls to Resource Allocation

## 2. Resource Allocation

**Current:** Shows per-user deal assignments, capped at 8. Infinite spinner on failure.

**Fix:**
- **Error state:** "Could not load team data" + Retry button (replaces infinite spinner)
- **Empty state:** "No team members yet — invite your first team member" + link to `/settings.html` (Invite Team page)
- **Capacity formula:** `(dealCount / 5) * 100` — 5 deals = 100% capacity. Meaningful for PE/search fund.
- **"View Detailed Report" button:** Toggles expanded mode:
  - Shows ALL team members (removes slice(0,8) cap)
  - Adds columns: open task count, last login date (from user data)
  - Button text changes to "Show Less" when expanded

## 3. Task Table

**Current:** Functional table with filter/sort. Dead "View all tasks" link. No inline status editing.

**Fix:**
- **Inline status update:** Click status badge → dropdown (Pending / In Progress / Completed / Stuck). PATCHes `PUT /api/tasks/:id`, refreshes stats cards + badge count. This is the #1 ops manager action.
- **"View all tasks" button:** Removes task limit, loads all tasks. Button changes to "Show recent" to toggle back. Uses same `renderTaskTable` but with full `allTasks` array.
- **Empty state:** "No tasks yet — create your first task to start tracking work" with Create Task CTA button
- **Row click:** Task title is clickable — if deal linked, navigates to deal page. If no deal, no-op.

## 4. Activity Feed

**Current:** Pulls audit logs. Infinite spinner on failure.

**Fix:**
- **Error state:** "Could not load activity" + Retry button
- **Empty state:** "No activity yet — actions across your org will appear here"
- **Day grouping:** Group entries under "Today", "Yesterday", "Apr 2" headers
- **"View full history" button:** Loads next 10 audit entries (paginated via offset), appends to feed. Button shows "Loading..." during fetch, hides when no more entries.

## 5. Upcoming Reviews Card

**Current:** Already functional — reads `[Review]` tasks.

**Fix:**
- Better empty state: "No reviews scheduled" + "Schedule Review" CTA (already has this, keep it)
- No other changes needed

## 6. Quick Actions Bar

**Current:** All 4 modals work. Assign Deal, Create Task, Schedule Review, Send Reminder.

**Fix:** No changes — already functional.

## 7. Error Handling Pattern (all sections)

```
if (apiCallFails) {
    show: icon + "Could not load [section]" + [Retry] button
    retry button calls the same load function
}
// NEVER show infinite spinner on error
```

## 8. What We're NOT Building

- No separate admin pages (single page, expand-in-place)
- No charts/graphs (premature for beta)
- No email integration for reminders (phase 2)
- No drag-and-drop task reordering
- No real-time updates / websockets
- No team member CRUD from this page (Invite Team page exists)

---

## Files Modified

- `apps/web/admin-dashboard.js` — stats cards, resource allocation, activity feed, error states
- `apps/web/admin-tasks.js` — task table inline status, expand/collapse, empty states
- `apps/web/admin-modals.js` — no changes expected
- `apps/web/admin-dashboard.html` — update stat card HTML (remove progress bars, add subtitles), update empty states in HTML
