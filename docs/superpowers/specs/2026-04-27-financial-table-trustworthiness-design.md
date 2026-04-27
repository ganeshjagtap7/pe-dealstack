# Financial Table Trustworthiness — Design Spec

**Date:** 2026-04-27
**Goal:** Every cell in the financial table shows where its value came from and how confident the system is. No silent guesses.
**Principle:** Show what you found, cite where you found it, flag uncertainty — never silently guess.

---

## Problem

The financial table renders extracted values as flat numbers with no provenance. Users cannot tell which values were explicitly found in the document vs. inferred by AI. Confidence is shown per-column but not per-cell. Source citations (`_source` fields) exist in the DB but are never displayed. This destroys user trust, especially when values are wrong.

---

## Design

### Cell Trust Levels

Every cell in the financial table is classified into one of three trust tiers based on its confidence score and source citation status:

| Tier | Criteria | Background | Visual |
|------|----------|------------|--------|
| **Verified** | Confidence >= 80% AND has `_source` field | White (default) | No extra indicator |
| **Review suggested** | Confidence 60-79% OR missing `_source` | Amber `#FFFBEB` | Small warning icon in cell |
| **Unverified** | Confidence < 60% OR cross-verify flagged | Light red `#FEF2F2` | Small warning icon in cell |

### Source Citation Tooltips

Hovering any data cell shows a tooltip with provenance info:

**For cells with source citation:**
```
"Revenue of $2,100 for month ending Jan 2026"

Confidence: 90%  ·  GPT-4o
Source: CIM - DMPRO.docx.pdf
```

**For cells without source citation:**
```
No source citation

This value was inferred by AI but could not be traced
to a specific location in the document. Verify manually.

Confidence: 65%  ·  GPT-4o
```

### Table Legend

A single-line legend above the table (below the tab bar):

```
● Verified (80%+)   ● Review suggested (60-79%)   ● Unverified (<60%)
```

Green/amber/red dots matching the badge colors already used in the column header confidence badges.

### Implementation Details

**Frontend only — no API changes needed.** All data is already in the response:

- `lineItems.revenue` — the numeric value
- `lineItems.revenue_source` — the source citation string (may be null/missing)
- `extractionConfidence` — per-period confidence (on the statement row, not per line item)
- `Document.name` — the source document name
- `extractionSource` — the extraction method ('gpt4o', 'vision', 'azure')

### Files Modified

| File | Change |
|------|--------|
| `apps/web/js/financials.js` | `buildStatementTable()` — add trust background, tooltip data attributes, tooltip rendering |
| `apps/web/js/financials-helpers.js` | Add `getCellTrustTier()`, `buildSourceTooltip()` helper functions |

### Cell Rendering Changes (financials.js)

In `buildStatementTable()`, each data cell currently renders as:

```html
<td class="..." onclick="editFinancialCell(...)">$2,100</td>
```

After this change:

```html
<td class="..." onclick="editFinancialCell(...)"
    style="background: #FFFBEB;"
    data-source="Revenue of $2,100 for month ending Jan 2026"
    data-confidence="72"
    data-method="gpt4o"
    data-doc="CIM - DMPRO.docx.pdf"
    onmouseenter="showCellTooltip(event)"
    onmouseleave="hideCellTooltip()">
  <span class="material-symbols-outlined text-amber-500" style="font-size:10px;vertical-align:super;">warning</span>
  $2,100
</td>
```

### Tooltip Implementation

A single floating tooltip div (created once, repositioned on hover):

```javascript
function showCellTooltip(event) {
  const td = event.currentTarget;
  const source = td.dataset.source;
  const confidence = td.dataset.confidence;
  const method = td.dataset.method;
  const doc = td.dataset.doc;
  // Position and show tooltip near the cell
}
```

CSS: Fixed-position div with `z-index: 9999`, max-width 300px, white background, shadow, rounded corners. Matches the existing premium "banker" aesthetic (Inter font, subtle shadows).

### Legend Implementation

Inserted as a single flex row between the tab bar and the table:

```html
<div class="flex items-center gap-4 text-[10px] text-gray-500 mb-2 px-1">
  <span class="flex items-center gap-1">
    <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span> Verified (80%+)
  </span>
  <span class="flex items-center gap-1">
    <span class="inline-block w-2 h-2 rounded-full bg-amber-400"></span> Review suggested
  </span>
  <span class="flex items-center gap-1">
    <span class="inline-block w-2 h-2 rounded-full bg-red-400"></span> Unverified
  </span>
</div>
```

---

## What This Does NOT Do

- Does not change the extraction pipeline or backend
- Does not add per-line-item confidence (uses per-period confidence as proxy)
- Does not add inline editing of source citations
- Does not add audit trail for manual edits (separate feature)

---

## Success Criteria

1. Every data cell has a colored background reflecting its trust tier
2. Hovering any cell shows where the number came from (source quote) or explicitly says "no source"
3. A legend explains what the colors mean
4. No cell appears "trusted" if it lacks a source citation
5. The tooltip matches the existing banker aesthetic (Inter, white, subtle shadow)
