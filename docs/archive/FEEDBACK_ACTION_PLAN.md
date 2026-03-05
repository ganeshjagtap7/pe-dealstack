# Feedback Action Plan — $100M Firm (First Sweep)

> **Date:** Feb 19, 2026
> **Source:** Preliminary instinctive review (no AI used by reviewer)
> **Signal:** This person is a real operator. Every bullet is a workflow pain point they live daily. The closing "overall looks clean" means the foundation impressed them — they wouldn't give this level of detail otherwise.

---

## TL;DR — What They're Really Saying

**"Your product looks good, but I can't replace my Google Drive + Excel workflow unless you solve these 9 things. I need ONE place for everything — not a tool that creates more copies and more tabs."**

---

## Feedback Breakdown

### 1. In-App Document Editing + Single-Link Collaboration

> *"Are the documents editable within the data room and can they be edited and shared via a single link. I find collaborating between buyer and seller on VDR doc should have a single source of truth, not multiple copies"*

**What they said:** Can I edit docs in the VDR and share a single link?

**What they mean:** "Right now I edit a doc, download it, re-upload it, and the seller has a different version. It's chaos. I want Google Docs-level collaboration inside your data room."

**The real pain:** Version control hell. In M&A, a single NDA or LOI goes through 5-10 redlines between buyer and seller. If your VDR is just a file locker (upload/download), it's no better than Dropbox. The magic is **one link, one truth, both sides editing.**

**Current state:** Upload/download only. No in-app editing. No external sharing links. No version history.

| Priority | Effort | Impact |
|----------|--------|--------|
| **HIGH** | Large | Deal-breaker for adoption |

**Actions:**
- [ ] **Phase 1 — View + Comment (Quick Win):** Add inline commenting on documents (PDF annotations, doc comments). This alone reduces back-and-forth.
- [ ] **Phase 2 — Shareable Links:** Generate a unique link per document/folder with access controls (view-only, comment, edit). External users (sellers, lawyers) access without needing an account.
- [ ] **Phase 3 — Collaborative Editing:** Integrate a document editor (OnlyOffice, Collabora, or iframe Google Docs) so redlines happen inside PE OS.
- [ ] **Phase 4 — Version History:** Track every edit with timestamps, who changed what, and ability to revert.

---

### 2. Deal Kickoff Templates (Preloaded VDR Structure)

> *"Can the VDR have a preload template that setups each time with a checklist and folder index for each new deal kicking off?"*

**What they said:** Can I get a template that auto-creates folders and a checklist?

**What they mean:** "Every deal has the same 15-20 folders (Financials, Legal, CIM, LOI, etc.) and the same 50-item diligence checklist. I don't want to set this up from scratch every time. My junior associates waste hours on this."

**The real pain:** Deal setup is manual and inconsistent. Different team members create different folder structures. Things get missed. They want **institutional consistency** — every deal starts the same way.

**Current state:** You DO have default folder creation when a deal is created (Financial, Legal, Operational, Market, Management, Misc). But no customizable templates and no checklist system.

| Priority | Effort | Impact |
|----------|--------|--------|
| **HIGH** | Medium | Immediate workflow improvement |

**Actions:**
- [ ] **VDR Templates:** Create a template system where firms can define their own folder structures + standard documents per deal type (LBO, Growth Equity, Add-on, etc.).
- [ ] **Template Library:** Ship 2-3 default templates (Standard DD, Quick Screen, Platform vs. Add-on) out of the box.
- [ ] **Auto-Checklist from Template:** When a template is applied, auto-generate a diligence checklist tied to each folder (e.g., "Financial" folder → checklist items: "3-yr audited financials", "Monthly P&L", "Balance sheet", etc.).
- [ ] **Template Management UI:** Let admins create/edit/clone templates from Settings or the Templates page.

---

### 3. File Lifecycle & Continuous Editing Workflow

> *"How manual is the engagement - for each deal a new Deal is made and all the files dump into there? If the files need work, what happens. We are editing NRR sheets, financials continuously"*

**What they said:** What happens when files need ongoing edits?

**What they mean:** "My financial models change DAILY. NRR sheets get updated every week as new data comes in. If I have to re-upload every time, I'll just stay in Google Sheets. Your VDR needs to handle living documents, not just static file dumps."

**The real pain:** PE firms don't just *store* documents — they *work* on them continuously. The VDR can't be a one-time dump. It needs to support the **iterative, messy reality** of deal execution where financials are living spreadsheets that evolve over months.

**Current state:** Upload-only. No edit-in-place. No sync. No version tracking. Every update requires manual re-upload.

| Priority | Effort | Impact |
|----------|--------|--------|
| **CRITICAL** | Large | This is why they'd stay on Google Drive |

**Actions:**
- [ ] **Version Upload:** Allow uploading a new version of an existing file (not a new file). Show version history with diff indicators.
- [ ] **Google Drive / OneDrive Sync:** Let users link a Google Sheet or Excel file. PE OS stays in sync automatically. This is the killer feature — they keep editing in their tool, PE OS reflects the latest.
- [ ] **"Last Updated" Indicators:** Show prominent timestamps on files so everyone knows when financials were last touched.
- [ ] **Edit Notifications:** When a key document (financials, NRR sheet) is updated, notify deal team members.
- [ ] **"Needs Update" Flag:** Let users flag documents that are stale and need refreshing, visible on the checklist.

---

### 4. UX Flow — Navigation Simplification

> *"I don't understand the UX flow - deal intake comes before deals on the side tab. Maybe just have a Deals tab"*

**What they said:** The nav order is confusing.

**What they mean:** "I opened your app and immediately got confused. Why is 'Deal Intake' a separate thing from 'Deals'? In my head, intake IS part of deals. You're making me think about your system's architecture instead of my workflow."

**The real pain:** Your information architecture mirrors your *code structure* (intake → processing → deals), not the *user's mental model* (I have deals, some are new, some are active). Users don't think in pipelines — they think in objects.

**Current state:** Sidebar shows: Dashboard → Deals → Deal Intake → Data Room → CRM → ...

| Priority | Effort | Impact |
|----------|--------|--------|
| **QUICK WIN** | Small | Reduces first-impression friction |

**Actions:**
- [ ] **Merge "Deal Intake" into "Deals":** Make Deal Intake a tab or action *within* the Deals page (e.g., a "+ New Deal" button that opens the intake flow, or a "Pipeline" vs "Intake Queue" tab).
- [ ] **Reorder sidebar:** Deals (with intake inside) → Data Room → CRM → AI Reports → Templates → Admin.
- [ ] **Consider merging Data Room into Deals:** Each deal has its own data room. A separate "Data Room" top-level nav may not be needed if you can access it from within a deal. (Validate with more users first.)

---

### 5. Deal Data → Data Room Continuity

> *"Would be cool if prelim data in deals tab is still accessible or connected to Data room - the point being I like to have my gdrive spaces in a rhythm where I can see everything next to one another. Prelim deal data, flows to a live deals to be executed area (the VDR)."*

**What they said:** Connect deal info to the data room.

**What they mean:** "When I look at a deal, I want to see the CIM summary, the financials I uploaded during screening, AND the live data room all in one view. Right now it feels like Deal info and VDR are separate islands. In Google Drive, everything is in one folder — I can see it all."

**The real pain:** Context switching. They don't want to click between "Deals" and "Data Room" to get the full picture. The **deal page should BE the data room** (or at least seamlessly include it). Their Google Drive workflow works because everything is spatially co-located.

**Current state:** Deal page has its own document section + AI chat. Data Room is a separate page. There's some connection but it feels disjointed.

| Priority | Effort | Impact |
|----------|--------|--------|
| **HIGH** | Medium | Makes the product feel unified |

**Actions:**
- [ ] **Deal Page = Hub:** Make the deal detail page the single hub with tabs: Overview (prelim data, metrics, thesis) → Documents (the VDR) → Checklist → Chat → Memo.
- [ ] **Carry Forward:** When a deal moves from screening to DD, all prelim data (uploaded CIM, teaser, initial financials) should auto-appear in the VDR without re-upload.
- [ ] **Side-by-Side View:** Allow split-pane or tab view where deal metrics + VDR docs are visible together.
- [ ] **Breadcrumb Trail:** Show the deal's journey — what came in during intake, what was added during screening, what's in active DD — as a timeline or phase-grouped view.

---

### 6. External Access & Granular Permissions

> *"VDR viewing and access rights are important: external advisors on both sides need to view or edit, and different team members too"*

**What they said:** External people need access with different permission levels.

**What they mean:** "On any deal, I have: my team (analyst, VP, partner), the seller's team (banker, CFO), external lawyers (buyer-side, seller-side), and maybe an accounting firm. Each needs different access. The analyst sees everything. The seller's lawyer sees only the legal folder. If I can't do this, I can't use your product for real deals."

**The real pain:** Current sharing is limited to internal workspace members. Real M&A deals involve 10-20 people across 4-5 organizations. This is **table stakes for any serious VDR** (Intralinks, Datasite, etc. all have this).

**Current state:** RBAC exists for internal roles (Admin → Viewer). Share modal adds workspace members. NO external user access. NO folder-level permissions.

| Priority | Effort | Impact |
|----------|--------|--------|
| **CRITICAL** | Large | Can't replace existing VDR without this |

**Actions:**
- [ ] **External User Invites:** Allow inviting people by email who are NOT workspace members. They get a limited "guest" experience — see only what's shared with them.
- [ ] **Folder-Level Permissions:** Set view/edit/download permissions per folder per user/group. E.g., "Seller's counsel can view Legal folder only."
- [ ] **Permission Groups:** Create groups like "Buy-side Team", "Sell-side Advisors", "Legal Counsel" and assign folder access to groups instead of individuals.
- [ ] **Watermarking:** Auto-watermark downloaded PDFs with the viewer's name/email (industry standard for VDRs).
- [ ] **Access Audit Log:** Show who accessed what document and when. (You already have audit logging — extend it to VDR access.)
- [ ] **NDA Gate:** Require users to sign/acknowledge an NDA before accessing the data room.

---

### 7. Integration with Existing Stack

> *"How does this fit in within the typical stack: sourcing software, email, word/gsuite?"*

**What they said:** How does this connect to tools I already use?

**What they mean:** "I use DealCloud/Affinity for sourcing, Gmail for communication, and Google Sheets for models. If your product is another silo, it's another tab I have to check. I need it to plug into my existing workflow, not replace everything."

**The real pain:** PE firms are NOT going to rip out their entire stack. They need PE OS to **complement** existing tools, not compete with them. The winning strategy is integration, not replacement.

**Current state:** No integrations. Standalone application.

| Priority | Effort | Impact |
|----------|--------|--------|
| **MEDIUM** | Large (ongoing) | Long-term stickiness play |

**Actions:**
- [ ] **Gmail / Outlook Integration:** Forward deal-related emails to a deal-specific inbox. Auto-file email attachments into the VDR. (Could start with a simple "email to deal" forwarding address.)
- [ ] **Google Drive Sync:** Two-way sync a Google Drive folder with a deal's VDR. This is the #1 request based on this feedback.
- [ ] **CSV/Excel Import for Deal Data:** One-click import of deal pipeline from existing tools.
- [ ] **Zapier/Webhook Support:** Let firms connect PE OS to DealCloud, Affinity, HubSpot, etc. via webhooks or Zapier.
- [ ] **Browser Extension:** "Save to PE OS" — clip a deal from a sourcing tool or email and push it to deal intake.
- [ ] **API Documentation:** Publish a public API so firms' internal tools can push/pull data.

---

### 8. Native Dynamic Checklist

> *"Is there a way to have a native checklist. We use an excel in the gdrive VDR. If the checklist could auto update based on what's in the indexed folders shared, that would be mad good"*

**What they said:** Build a checklist that auto-updates based on uploaded docs.

**What they mean:** "My DD checklist is 50-100 items. Right now it's an Excel file I manually update. If your system knows that 'Q1 Financials' is in the Financial folder, it should auto-check 'Q1 Financials received' on my checklist. THAT would be magic."

**The real pain:** The checklist is the **command center** of any deal. It's what partners review in Monday meetings. It's what tells you if a deal is 40% or 80% done. Manually maintaining it is painful and error-prone. **Auto-updating it based on actual document uploads is a genuine differentiator.**

**Current state:** Checklist is DEMO-ONLY. Mock data in dashboard. No backend. No database table. No real functionality.

| Priority | Effort | Impact |
|----------|--------|--------|
| **CRITICAL** | Medium | This is your "wow" feature — build it |

**Actions:**
- [ ] **Checklist Data Model:** Create `checklist_items` table: id, deal_id, template_id, label, category (Financial, Legal, etc.), status (pending, received, reviewed, flagged), linked_document_id, assigned_to, due_date.
- [ ] **Checklist UI:** Build a real checklist page within each deal. Group items by category. Show status, who uploaded, when.
- [ ] **Auto-Match Engine:** When a document is uploaded, use filename + AI classification (you already categorize docs!) to auto-match it to a checklist item and mark it "received."
- [ ] **Completion Dashboard:** Show % complete per category and overall. This becomes the deal health indicator.
- [ ] **Checklist from Template:** When a deal uses a template (Feedback #2), auto-populate the checklist.
- [ ] **Request Documents:** Click a checklist item → "Request from seller" → sends an email/notification to external user asking for that specific document.
- [ ] **Export Checklist:** Export as PDF/Excel for partner meetings and IC reviews.

---

### 9. "Overall Looks Clean"

> *"Overall looks clean"*

**What they said:** It looks good.

**What they mean:** "The visual design and general concept is solid. I can see the vision. I wouldn't have spent 10 minutes writing this feedback if I didn't think this had potential. But right now it's a prototype that can't handle my real workflow. Make it work for real deals and I'll use it."

**The real signal:** This person is a **potential champion** inside their firm. They took time to give thoughtful, specific feedback without being asked to use AI analysis. They're telling you exactly what they need to convert from "interesting" to "let's pilot this."

---

## Priority Matrix

```
                        HIGH IMPACT
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         │  #8 Checklist    │  #6 External     │
         │  #4 Nav Fix      │     Permissions  │
         │  #2 Templates    │  #3 File         │
         │                  │     Lifecycle    │
         │                  │  #1 Doc Editing  │
    LOW ─┼──────────────────┼──────────────────┼─ HIGH
  EFFORT │                  │                  │  EFFORT
         │                  │  #5 Deal-VDR     │
         │                  │     Continuity   │
         │                  │  #7 Integrations │
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                        LOW IMPACT
```

## Recommended Build Order

| Phase | Items | Why This Order |
|-------|-------|----------------|
| **Sprint 1 (Now)** | #4 Nav Fix, #8 Checklist (MVP) | Quick win + highest-wow feature. Ship in 1-2 weeks. |
| **Sprint 2** | #2 Templates, #5 Deal-VDR Continuity | Makes deal setup fast and unified. Builds on checklist. |
| **Sprint 3** | #3 File Versioning, #1 Shareable Links | Addresses the "living document" pain. Core VDR upgrades. |
| **Sprint 4** | #6 External Permissions | Unlocks real deal usage with outside parties. |
| **Sprint 5** | #7 Google Drive Sync, #1 Collab Editing | Integration play. Makes PE OS the hub, not a silo. |

## How to Use This Document

1. Work through items top-to-bottom within each sprint
2. Check off actions as you complete them
3. After each sprint, send the firm an update: "Based on your feedback, we built X. Want to try it?"
4. Their response to each update tells you what to prioritize next

---

*This feedback is gold. A $100M firm telling you exactly what to build is the best product roadmap you can get.*
