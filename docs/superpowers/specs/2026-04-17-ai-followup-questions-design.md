# AI Follow-Up Questions — Design Spec

**Date:** 2026-04-17
**Feature:** Contextual AI follow-up questions in deal ingest modal
**Status:** Approved for implementation

---

## Problem

When users ingest a deal, the AI extracts financial data but has no context about the user's intent — why they're looking at this deal, what concerns them, what stage they're at. This makes downstream features (chat, analysis, memos) less useful because they lack the human perspective.

## Solution

After AI extraction completes and the preview renders, the system generates 3-4 **document-specific** follow-up questions using GPT-4o-mini. Questions appear inline in the modal below the extraction preview. Answers are optional but encouraged, stored on the Deal for downstream AI features to consume.

---

## User Flow

```
1. User uploads file → clicks "Extract & Create Deal"
2. Loading spinner (30-60s)
3. Extraction preview appears (Company, Industry, Revenue, EBITDA, confidence)
4. ~1s delay → AI follow-up questions fade in below preview
   - Simultaneously: background API call generates questions from extraction data
   - Questions render as they arrive
5. User answers some/all/none:
   - Choice questions: click pill chips (single-select per question)
   - Text question: type in input field
6. User clicks:
   - "Save & View Deal" → saves answers to Deal, navigates to deal page
   - "Skip — I'll add context later" → navigates without saving answers
   - "View Deal" (original button, shown when no answers given) → same as skip
```

## API Design

### New Endpoint: `POST /api/deals/:dealId/follow-up-questions`

**Request:**
```json
{
  "extraction": {
    "companyName": "Nino Burgers",
    "industry": "Food & Beverages",
    "revenue": 90,
    "ebitda": 24,
    "currency": "INR",
    "summary": "Cloud kitchen operating two brands...",
    "keyRisks": ["High aggregator dependency", "..."],
    "investmentHighlights": ["74% gross margins", "..."]
  }
}
```

**Response:**
```json
{
  "questions": [
    {
      "id": "q1",
      "type": "choice",
      "question": "What type of investment are you considering?",
      "reason": "Based on the Rs. 9.5Cr asking valuation",
      "options": ["Majority Acquisition", "Minority Stake", "Growth Equity", "Strategic Partnership"]
    },
    {
      "id": "q2",
      "type": "choice",
      "question": "How concerned are you about the 95% aggregator dependency?",
      "reason": "Based on Swiggy/Zomato concentration mentioned in the document",
      "options": ["Major concern", "Moderate — manageable", "Not worried", "Need more data"]
    },
    {
      "id": "q3",
      "type": "choice",
      "question": "What's your expected hold period?",
      "reason": "Helps frame the financial analysis and exit modeling",
      "options": ["1-2 years", "3-5 years", "5-7 years", "Open-ended"]
    },
    {
      "id": "q4",
      "type": "text",
      "question": "What specifically caught your attention about this deal?",
      "reason": "Helps AI tailor future analysis to your investment thesis",
      "placeholder": "e.g., Strong unit economics, brand moat, expansion potential..."
    }
  ]
}
```

### Save Answers: `PATCH /api/deals/:dealId`

Answers saved to `Deal.customFields` JSONB:
```json
{
  "customFields": {
    "aiFollowUp": {
      "generatedAt": "2026-04-17T...",
      "questions": [...],
      "answers": {
        "q1": "Majority Acquisition",
        "q2": "Moderate — manageable",
        "q3": "3-5 years",
        "q4": "Strong unit economics with proven playbook for expansion"
      }
    }
  }
}
```

## Backend Implementation

### Question Generation Service

**File:** `apps/api/src/services/followUpQuestions.ts`

Uses `getFastModel()` (GPT-4o-mini, ~$0.003/call) with structured output via LangChain `withStructuredOutput()`.

**System Prompt:**
```
You are a senior PE analyst. Based on the extracted deal data, generate 3-4 short follow-up questions that would help an investor evaluate this opportunity.

Rules:
- Generate exactly 3 choice questions and 1 text question
- Each question must reference specific data from the extraction (cite numbers, risks, or highlights)
- Choice questions: 3-4 concise options each
- Include a "reason" field explaining WHY you're asking (reference the document data)
- Questions should cover: deal structure/intent, key risk assessment, timeline/strategy, and open-ended thesis
- Keep questions short (under 15 words). Keep options short (under 5 words each).
- Never ask about data that was already clearly extracted (don't re-ask revenue if it's 100% confidence)
```

**Zod Schema:**
```typescript
const FollowUpQuestionSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    type: z.enum(['choice', 'text']),
    question: z.string(),
    reason: z.string(),
    options: z.array(z.string()).optional(),
    placeholder: z.string().optional(),
  })).min(3).max(4),
});
```

### Route

**File:** `apps/api/src/routes/deals.ts` (add to existing router)

```
POST /api/deals/:dealId/follow-up-questions
```

- Requires auth + org scope
- Accepts extraction data in body
- Calls `generateFollowUpQuestions(extractionData)`
- Returns structured questions JSON

## Frontend Implementation

### Template Changes

**File:** `apps/web/js/deal-intake-template.js`

Add a new section between Review Reasons and Actions in `#intake-extraction-preview`:

```html
<!-- AI Follow-Up Questions -->
<div id="intake-followup-section" class="hidden mt-5">
  <div class="h-px bg-gray-100 mb-5"></div>
  
  <!-- Header -->
  <div class="flex items-center gap-2 mb-4">
    <span class="material-symbols-outlined text-primary text-base">psychology</span>
    <p class="text-xs font-semibold text-gray-700 tracking-wide uppercase">Quick context</p>
    <span class="text-[10px] text-gray-400 font-normal normal-case">— helps AI serve you better</span>
  </div>
  
  <!-- Questions container (populated dynamically) -->
  <div id="intake-followup-questions" class="space-y-5"></div>
</div>
```

### Question Rendering

Each question renders as:

**Choice question:**
```html
<div class="followup-q" data-qid="q1">
  <p class="text-sm text-gray-800 font-medium mb-1">What type of investment are you considering?</p>
  <p class="text-[10px] text-gray-400 italic mb-2.5">Based on the Rs. 9.5Cr asking valuation</p>
  <div class="flex flex-wrap gap-2">
    <button class="followup-chip px-3 py-1.5 text-xs rounded-full border transition-all
      border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary"
      data-value="Majority Acquisition">Majority Acquisition</button>
    <!-- ... more chips -->
  </div>
</div>
```

**Selected chip state:**
```css
.followup-chip.selected {
  background: #003366;
  color: white;
  border-color: #003366;
}
```

**Text question:**
```html
<div class="followup-q" data-qid="q4">
  <p class="text-sm text-gray-800 font-medium mb-1">What caught your attention about this deal?</p>
  <p class="text-[10px] text-gray-400 italic mb-2.5">Helps AI tailor future analysis</p>
  <input type="text" class="followup-text-input w-full px-3 py-2 text-xs border border-gray-200 
    rounded-lg focus:ring-1 focus:ring-primary/30 focus:border-primary"
    placeholder="e.g., Strong unit economics, brand moat..." />
</div>
```

### Action Buttons (Updated)

When any question is answered, the button area morphs:

```html
<!-- Default (no answers) -->
<button onclick="intakeGoToDeal()">View Deal</button>
<button onclick="resetIntakeModal()">Add Another</button>

<!-- When answers exist -->
<button onclick="saveFollowUpAndGoToDeal()">Save & View Deal</button>
<button onclick="resetIntakeModal()">Add Another</button>
<p class="text-center mt-2">
  <a onclick="intakeGoToDeal()" class="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">
    Skip — I'll add context later
  </a>
</p>
```

### Animation

Questions section uses a staggered fade-in:

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.followup-q {
  animation: fadeInUp 0.4s ease-out both;
}
.followup-q:nth-child(1) { animation-delay: 0.1s; }
.followup-q:nth-child(2) { animation-delay: 0.2s; }
.followup-q:nth-child(3) { animation-delay: 0.3s; }
.followup-q:nth-child(4) { animation-delay: 0.4s; }
```

### Data Flow

```
showIntakeExtractionPreview(data)
  ↓ renders preview (existing)
  ↓ fires background: POST /deals/:id/follow-up-questions
  ↓ response arrives → renderFollowUpQuestions(questions)
  ↓ user interacts with chips/text
  ↓ "Save & View Deal" → PATCH /deals/:id { customFields: { aiFollowUp: ... } }
  ↓ navigate to deal page
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/services/followUpQuestions.ts` | **Create** | Question generation service (GPT-4o-mini + Zod schema) |
| `apps/api/src/routes/deals.ts` | Modify | Add `POST /:id/follow-up-questions` endpoint |
| `apps/web/js/deal-intake-template.js` | Modify | Add follow-up questions HTML section |
| `apps/web/js/deal-intake-actions.js` | Modify | Add `renderFollowUpQuestions()`, chip handlers, `saveFollowUpAndGoToDeal()` |

## Cost

- GPT-4o-mini: ~$0.003 per question generation call
- One call per deal ingest (not per document)
- No additional DB tables needed (uses existing `customFields` JSONB)

## Success Criteria

- Questions appear within 2-3s of extraction completing
- At least 2 of 3-4 questions reference specific extracted data points
- Answer rate > 50% of users answer at least one question
- Zero impact on existing flow if user skips
