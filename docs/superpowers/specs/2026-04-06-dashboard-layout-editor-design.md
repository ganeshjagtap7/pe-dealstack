# Dashboard Layout Editor — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Scope:** v1 — drag-to-reorder widgets within the right column. No resize, no cross-column moves, no backend sync.

## Context

We just shipped 12 new dashboard widgets via the Customize Dashboard modal. Two buttons exist below the widget list — **Add Widget** and **Customize Dashboard** — but they currently open the same widget picker. The user asked for them to do different things: Add Widget should remain the picker (choose what appears), and Customize Dashboard should let users **drag and drop** widgets to reorder their layout.

This spec covers v1 only: drag-to-reorder. Resize and free positioning are explicitly out of scope (deferred to v2 if usage data shows demand).

## Goals

1. Give the Customize Dashboard button a real, distinct purpose
2. Let users reorder widgets in the right column by dragging
3. Persist the order across page reloads
4. Zero new dependencies, zero backend changes
5. Keep the existing widget visibility flow (Add Widget) untouched

## Non-Goals (v1)

- Resizing widgets
- Moving widgets between columns (left ↔ right)
- Free positioning (x/y grid)
- Backend persistence / cross-device sync
- Mobile / touch device support
- Undo/redo

## UX Flow

```
[Dashboard normal state]
        │
        ▼ click "Customize Dashboard" button
[Edit mode ON]
  • Every visible widget gets:
      - Dotted blue outline (border-2 border-dashed border-primary)
      - Drag handle (drag_indicator icon) in top-right of title bar
      - cursor: grab on the handle
  • Customize Dashboard button transforms → "Done" button (filled blue)
  • Top of dashboard shows banner: "Drag widgets by the handle to reorder · Click Done when finished"
        │
        ▼ user grabs handle and drags widget
[Dragging]
  • Source widget gets opacity-50 + cursor: grabbing
  • Other widgets shift to show drop slot (visual placeholder is the dragged element being moved live in DOM)
        │
        ▼ on drop
[Drop committed]
  • DOM order updated immediately
  • New order written to localStorage["pe-dashboard-widget-order"]
  • Toast: (suppressed during edit mode to reduce noise)
        │
        ▼ click "Done" or press Esc
[Edit mode OFF]
  • Outlines and handles disappear
  • Done button reverts to "Customize Dashboard"
  • Banner disappears
  • Toast: "Layout saved"
```

## Architecture

### New file
- **`apps/web/js/widgets/layout-editor.js`** (~150 lines) — self-contained module exposing `window.LayoutEditor.{enter, exit, isEditing}`. Knows nothing about widgets, preferences, or the registry. Only knows: "find draggable elements within a container, attach drag handlers, fire a callback on drop."

### Modified files
- **`apps/web/dashboard.html`** — add one `<script src="js/widgets/layout-editor.js">` tag in the existing widget script block. Add a hidden edit-mode banner above the main content grid.
- **`apps/web/dashboard-widgets.js`** — three new functions:
  - `getWidgetOrder()` — read array from `localStorage["pe-dashboard-widget-order"]`
  - `saveWidgetOrder(orderArray)` — write array
  - `applyWidgetOrder()` — re-order DOM children of the right column based on saved array
  - Wire the existing `widget-settings-btn` click handler to call `LayoutEditor.enter()` instead of the placeholder toast.
- **`apps/web/dashboard.js`** — call `applyWidgetOrder()` after `applyWidgetPreferences()` in `initializeFeatures()`.

### Single responsibility
- `layout-editor.js` is a leaf module — no imports from any widget code. It accepts a container selector and drop callback as parameters.
- `dashboard-widgets.js` owns persistence and DOM application.
- The 12 widget files and `widget-base.js` are untouched.

### No new dependencies
Native HTML5 drag-and-drop API (`draggable`, `dragstart`, `dragover`, `drop`, `dragend`). Sufficient for vertical-list reorder. No SortableJS, GridStack, or React DnD.

## Data Model

Two separate `localStorage` keys, by design:

```js
// Existing — visibility only (unchanged)
localStorage["pe-dashboard-widgets"] = {
  "stats-cards": true,
  "quick-actions": true,
  "deal-funnel": false,
  // ...
}

// NEW — order only
localStorage["pe-dashboard-widget-order"] = [
  "my-tasks",
  "portfolio-allocation",
  "quick-actions",
  "deal-funnel",
  // ...
]
```

**Why two keys, not one merged object:**
- Visibility and order change independently
- Existing code touches the visibility key heavily — leaving it alone reduces blast radius
- A user can have a widget enabled but not yet in the order array (e.g., a newly added widget) — append-to-end fallback

### `applyWidgetOrder()` algorithm
1. Read the saved order array. If null/missing, return (preserve HTML order).
2. Find the right-column container (`document.querySelector('.flex.flex-col.gap-6')` — the Tailwind class signature of the right column).
3. For each widget ID in the saved array, find its `<div data-widget="<id>">` element. If found AND a child of the right column, append it to the parent. (Appending an existing element moves it.)
4. Widget elements NOT in the saved array stay in their current DOM position — stable for newly added widgets which appear at the bottom.

## Edge Cases

| Edge case | Handling |
|---|---|
| User has never customized layout | No saved order → `applyWidgetOrder` returns early → DOM stays in HTML order → zero behavior change |
| User added a new widget after last customizing | New widget appears at the bottom of the saved order (not interleaved). Saved order untouched. |
| User removed a widget (toggled off via Add Widget) | `display: none` on the container → drag handle hidden → widget can't be dragged. Order array still contains the ID, harmless. |
| User drags during page load (race) | Customize button is not interactive until after `WidgetRegistry.initAll()` completes. The button is part of the static HTML and click handlers wire up in `initWidgetManagement()` which runs after init. |
| Two browser tabs open | Last save wins. No cross-tab sync. Acceptable for v1. |
| Mobile / touch device | HTML5 drag-and-drop has spotty touch support. **v1 hides the Customize Dashboard button on screens < 768px** via Tailwind `hidden md:flex`. |
| User accidentally closes browser mid-drag | Drop is committed instantly to localStorage on `dragend` — no half-state. |
| The five "core" widgets that shipped with the dashboard (stats-cards, active-priorities, my-tasks, portfolio-allocation, ai-signals) | Treated identically — fully draggable. Note: stats-cards lives at the top of the left column, not the right column. v1 only reorders within the right column, so stats-cards stays put. |
| User toggles edit mode and immediately exits without dragging | No-op. Saved order unchanged. |

## Testing Plan

Manual QA only — pure DOM manipulation, no automated tests.

### Test script
1. Open dashboard fresh (no localStorage) → confirm widgets render in HTML order
2. Click **Customize Dashboard** → confirm:
   - Banner appears: "Drag widgets by the handle to reorder · Click Done when finished"
   - Every visible widget in the right column shows a dotted blue outline
   - Each widget shows a drag handle (drag_indicator icon) in its title bar
   - Customize Dashboard button text changes to "Done" with filled blue style
3. Drag My Tasks down past Portfolio Allocation → confirm:
   - Source widget shows opacity-50 during drag
   - On drop, My Tasks now appears below Portfolio Allocation
4. Click **Done** → confirm:
   - Outlines and handles disappear
   - Banner disappears
   - Toast: "Layout saved"
5. Hard reload page (Cmd+Shift+R) → confirm new order persists
6. Open **Add Widget** → enable a new widget (e.g., Calendar) → save → confirm Calendar appears at the bottom of the customized layout (NOT interleaved into a default position)
7. Click **Customize Dashboard** → drag Calendar into the middle of the column → click Done → reload → confirm new position persists
8. Press **Esc** during edit mode → confirm exits cleanly without saving extra changes
9. Set Chrome devtools to mobile width (375px) → confirm Customize Dashboard button is hidden
10. Try clicking inside a widget body (e.g., Quick Notes textarea) during edit mode → confirm the click still works (drag handle is the only drag initiator)

### Build/test commands
- No build step changes
- `cd apps/web && npm run dev` — frontend dev server
- No `tsc` check needed (frontend is vanilla JS)

## Out of Scope (Future)

- **Resize handles** — drag widget edges to change height/width. Requires CSS Grid template areas or a library like GridStack.js. ~1-2 days.
- **Cross-column moves** — drag from right column to left or vice versa. Needs the layout to know which widgets are eligible for each column.
- **Backend persistence** — `User.dashboardLayout` JSONB column + sync endpoint so layouts follow users across devices.
- **Mobile/touch support** — would need a touch-aware drag library or polyfill.
- **Undo/redo** — single-level undo could be added with a one-step history stack, but not in v1.
