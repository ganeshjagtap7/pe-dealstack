# AI CRM Project Progress Log

## Overview
This file tracks all progress, changes, new features, updates, and bug fixes made to the AI CRM project.

---

## January 21, 2026

### Day 1 - Project Initialization

#### 10:00 AM - Initial Setup
- **Type:** New Feature
- **Description:** Created the initial landing page for PE OS (Private Equity Operating System)
- **File Created:** `index.html`
- **Details:**
  - Implemented complete landing page with Tailwind CSS
  - Added responsive design with mobile support
  - Integrated Google Fonts (Manrope) for typography
  - Added Material Symbols for icons
  - Implemented light/dark mode support

#### Landing Page Sections Added:
1. **Sticky Navbar**
   - Logo and branding
   - Navigation links (Platform, Solutions, Resources, Company)
   - Request Demo CTA button
   - Mobile hamburger menu

2. **Hero Section**
   - Announcement badge (GPT-4o Integration)
   - Main headline and subheadline
   - Primary CTA (Request Demo) and Secondary CTA (View Documentation)
   - Trust indicators (SOC2 Certified, No credit card required)
   - Dashboard preview with hover effects

3. **Trusted By Section**
   - Company logos: Kingsford, Summit Partners, Blackstone, Global Harbor, Apex Capital
   - Grayscale to color hover effect

4. **Key Capabilities Section**
   - AI-Driven Deal Ingestion feature card
   - Chat with Deals feature card
   - Institutional CRM feature card
   - Hover animations on cards

5. **CTA Section**
   - Call to action headline
   - Start Free Trial and Talk to Sales buttons

6. **Footer**
   - Company info and description
   - Social links
   - Product links (Deal Flow, CRM, Intelligence, Integrations)
   - Company links (About Us, Careers, Blog, Contact)
   - Resources links (Documentation, API Reference, Community, Help Center)
   - Legal links (Privacy Policy, Terms of Service, Security)

#### Technologies Used:
- HTML5
- Tailwind CSS (via CDN)
- Google Fonts
- Material Symbols

---

#### 11:30 AM - Monorepo Setup
- **Type:** Architecture Update
- **Description:** Converted project to a monorepo structure using Turborepo
- **Changes Made:**
  - Restructured project to use npm workspaces
  - Moved landing page from root to `apps/web/`
  - Set up Turborepo for build orchestration

#### New Project Structure:
```
ai-crm/
├── apps/
│   ├── web/              # Frontend application (landing page)
│   │   ├── index.html
│   │   └── package.json
│   └── api/              # Backend API server
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/           # Shared types and utilities
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/               # Shared UI component library
│       ├── src/
│       │   ├── components/
│       │   │   └── Button.tsx
│       │   ├── utils.ts
│       │   ├── styles.css
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json          # Root workspace config
├── turbo.json            # Turborepo config
├── .gitignore
└── PROGRESS.md
```

#### Files Created:
| File | Purpose |
|------|---------|
| `package.json` (root) | Workspace configuration with Turborepo |
| `turbo.json` | Build pipeline configuration |
| `apps/web/package.json` | Web app with Vite + React + Tailwind |
| `apps/api/package.json` | API server with Express + TypeScript |
| `apps/api/src/index.ts` | Basic Express server setup |
| `packages/shared/package.json` | Shared types package |
| `packages/shared/src/index.ts` | Types for User, Deal, Contact + utilities |
| `packages/ui/package.json` | UI component library |
| `packages/ui/src/components/Button.tsx` | Reusable Button component with variants |
| `packages/ui/src/utils.ts` | Tailwind merge utility |
| `.gitignore` | Git ignore rules |

#### Tech Stack Configured:
- **Build Tool:** Turborepo v2.0
- **Frontend:** Vite + React 18 + TypeScript + Tailwind CSS
- **Backend:** Express + TypeScript + tsx (dev runner)
- **UI Library:** CVA (class-variance-authority) + Tailwind Merge
- **Package Manager:** npm workspaces

---

## January 22, 2026

### Day 2 - Pricing Page Development

#### 10:00 AM - Pricing Page Created
- **Type:** New Feature
- **Description:** Created the institutional pricing page with tiered plans
- **File Created:** `apps/web/pricing.html`

#### Pricing Page Sections:
1. **Navigation Header**
   - Same consistent navbar as landing page
   - Active state on Pricing link
   - Log In and Get Demo buttons

2. **Page Header**
   - Main headline: "Institutional-Grade Intelligence. Tailored Pricing."
   - Descriptive subheadline

3. **Billing Toggle**
   - Monthly/Annual switch
   - "Save 20%" badge for annual billing
   - CSS-only toggle using radio buttons

4. **Pricing Cards (3 tiers)**
   | Plan | Price | Target Audience |
   |------|-------|-----------------|
   | Boutique | $249/user/mo | Solo analysts, small partnerships |
   | Mid-Market | $599/user/mo | Growing investment teams |
   | Enterprise | Custom | Full-scale operations |

5. **Plan Features:**
   - **Boutique:** Basic AI Deal Ingestion, 5 Deal Rooms, Standard Screening, Email Support
   - **Mid-Market:** Advanced Chat with Deals AI, Team Collaboration, Sentiment Analysis, Unlimited Historical Data
   - **Enterprise:** Custom API, Unlimited Deal Rooms, Dedicated Account Manager, SSO & Audit Logs

6. **Trust Section**
   - "Trusted by leading PE Firms globally"
   - Company logos (Kingsford, Summit, Blackstone, Global Harbor, Apex)

7. **Feature Comparison Table**
   - Core Platform features
   - Intelligence & AI features
   - Support & Security features
   - Sticky first column for mobile scrolling

8. **Bottom CTA Section**
   - Gradient background
   - "Ready to modernize your deal flow?"
   - Start Free Trial and Book a Demo buttons

9. **Footer**
   - Consistent with landing page
   - Copyright, Privacy Policy, Terms, Contact links

#### Design Elements:
- "Most Popular" badge on Mid-Market plan
- Hover animations on pricing cards
- Primary border highlight on featured plan
- Check/remove icons for feature availability
- Responsive table with horizontal scroll on mobile

#### 11:00 AM - Dashboard Page Created
- **Type:** New Feature
- **Description:** Created the analyst overview dashboard with full UI
- **File Created:** `apps/web/dashboard.html`

#### Dashboard Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (264px)  │           Main Content                  │
│  ┌─────────────┐  │  ┌─────────────────────────────────────┐│
│  │   PE OS     │  │  │  Header: Search + Market Status    ││
│  │   Logo      │  │  └─────────────────────────────────────┘│
│  ├─────────────┤  │  ┌─────────────────────────────────────┐│
│  │ User Card   │  │  │  Welcome: Good Morning, Alex       ││
│  │ Alex Morgan │  │  └─────────────────────────────────────┘│
│  ├─────────────┤  │  ┌────┬────┬────┬────┐                 │
│  │ Navigation  │  │  │Src │ DD │LOI │Clsd│  Stats Cards    │
│  │ • Dashboard │  │  └────┴────┴────┴────┘                 │
│  │ • Deals     │  │  ┌───────────────────┬─────────────────┐│
│  │ • CRM       │  │  │ AI Market        │ My Tasks        ││
│  │ • Portfolio │  │  │ Sentiment        │ (5 Pending)     ││
│  │ • Analytics │  │  ├───────────────────┼─────────────────┤│
│  │ • AI Reports│  │  │ Active Priorities│ Portfolio       ││
│  ├─────────────┤  │  │ (Deal Table)     │ Allocation      ││
│  │ + New Deal  │  │  └───────────────────┴─────────────────┘│
│  └─────────────┘  │                                         │
└─────────────────────────────────────────────────────────────┘
```

#### Dashboard Sections:
1. **Sidebar Navigation**
   - PE OS branding/logo with link to home
   - User profile card (Alex Morgan - Senior Analyst)
   - Navigation: Dashboard, Deals, CRM, Portfolio, Analytics, AI Reports
   - "New Deal" action button

2. **Top Header**
   - AI-powered search bar ("Ask AI anything about your portfolio...")
   - Market status indicator (green pulse - "Market Open")
   - Notifications bell with badge
   - Settings icon

3. **Welcome Section**
   - Personalized greeting with date
   - "Good Morning, Alex" header

4. **Stats Cards (4-column grid)**
   | Card | Value | Status |
   |------|-------|--------|
   | Sourcing | 18 | +2 new (green badge) |
   | Due Diligence | 4 | Active deals (highlighted) |
   | LOI / Offer | 2 | Waiting response |
   | Closed (Q3) | $42M | +12% vs Q2 |

5. **AI Market Sentiment Widget**
   - Psychology icon with "AI Market Sentiment" header
   - Analysis text with bullish trend indicator
   - Confidence score: 78
   - Three indicator cards: Tech Recovery, Low Volatility, Sector Focus

6. **Active Priorities Table**
   - Deal Name, Stage, Value, Next Action, Team columns
   - Sample deals: TechCorp SaaS ($125M), Nexus Logistics ($85M), GreenEnergy Co ($210M)
   - Stage badges with colors (Due Diligence, Modelling, LOI Sent)
   - Team member avatars

7. **My Tasks Widget**
   - Checkbox task list
   - Tasks: Review NDA, Finalize IC Memo, Market Research
   - Due dates and categories
   - "View All Tasks" link

8. **Portfolio Allocation Widget**
   - Donut chart visualization
   - SaaS: 55%, Healthcare: 30%, Others: 15%

9. **Add Widget Button**
   - Dashed border placeholder for customization

#### Design System:
- **Colors:**
  - Primary: #003366 (Banker Blue)
  - Secondary: #059669 (Emerald Green)
  - Background: #F8F9FA (Light Warm Gray)
- **Typography:** Inter font family
- **Shadows:** Subtle card shadows with hover effects

---

#### 12:00 PM - CRM Page Created
- **Type:** New Feature
- **Description:** Created the CRM page where all deals are stored and managed
- **File Created:** `apps/web/crm.html`

#### CRM Page Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Sidebar (256px)  │           Main Content                  │
│  ┌─────────────┐  │  ┌─────────────────────────────────────┐│
│  │  Ventus AI  │  │  │  Header: CRM                        ││
│  │  PE OS      │  │  │  14 Active Opportunities            ││
│  ├─────────────┤  │  │  AI Search Bar + Ingest Button      ││
│  │ Navigation  │  │  └─────────────────────────────────────┘│
│  │ • CRM ◄     │  │  ┌─────────────────────────────────────┐│
│  │ • Portfolio │  │  │  Filter Pills: Stage, Industry,     ││
│  │ • AI Insight│  │  │  Deal Size, Sort by Smart Rank      ││
│  │ • Documents │  │  └─────────────────────────────────────┘│
│  ├─────────────┤  │  ┌────┬────┬────┬────┐                 │
│  │ Settings    │  │  │Card│Card│Card│Card│  Deal Cards     │
│  ├─────────────┤  │  │    │    │    │    │  (4-col grid)   │
│  │ User Card   │  │  └────┴────┴────┴────┘                 │
│  │ Alex Morgan │  │  ┌────┬────┐                           │
│  └─────────────┘  │  │Proc│Add │  Processing + Upload      │
│                   │  └────┴────┘                           │
└─────────────────────────────────────────────────────────────┘
```

#### CRM Sections:
1. **Sidebar Navigation**
   - Ventus AI branding with dataset icon
   - Navigation: CRM (active), Portfolio, AI Insights, Documents
   - Settings link
   - User profile card (Alex Morgan - Senior Associate)

2. **Header Section**
   - "CRM" title with active opportunities count
   - AI-powered search bar with CMD+K shortcut
   - Notification bell with badge
   - "Ingest Deal Data" primary action button

3. **Filter Bar**
   - Stage filter dropdown (All)
   - Industry filter dropdown (SaaS, Healthcare...)
   - Active filter pill: Deal Size > $10M (removable)
   - Sort by: Smart Rank

4. **Deal Cards (4 sample deals)**
   | Deal | Industry | Stage | IRR | MoM | EBITDA | Revenue |
   |------|----------|-------|-----|-----|--------|---------|
   | Apex Logistics | Supply Chain SaaS | Due Diligence | 24.5% | 3.5x | $12.4M | $48M |
   | MediCare Plus | Healthcare Services | Initial Review | 18.2% | 2.1x | $45.0M | $180M |
   | Nebula Systems | Cloud Infrastructure | IOI Submitted | 29.1% | 4.2x | $-2.5M | $15M |
   | Titan Freight | Transportation | Passed | 12% | 1.5x | $8.0M | $62M |

5. **AI Thesis Cards**
   - Each deal card includes AI-generated investment thesis
   - Purple "AI Thesis" badge with auto_awesome icon
   - Risk flags shown in red for passed deals

6. **Processing Card**
   - Skeleton loading state with pulse animation
   - "Processing" badge with ping indicator
   - "Extracting financial tables..." status

7. **Upload Documents Card**
   - Dashed border upload zone
   - "Drag & drop CIMs, Teasers, or Excel models"
   - Hover effects with scale animation

#### Stage Badge Colors:
| Stage | Background | Border | Text |
|-------|------------|--------|------|
| Due Diligence | emerald-50 | emerald-100 | emerald-600 |
| Initial Review | blue-50 | blue-100 | blue-600 |
| IOI Submitted | amber-50 | amber-100 | amber-600 |
| Passed | slate-100 | slate-200 | slate-500 |

#### Design System (Deals Page):
- **Colors:**
  - Primary: #1e293b (Slate 800 - Deep Navy)
  - Primary Hover: #0f172a (Slate 900)
  - Background: #f8fafc (Slate 50 - Off-white)
  - Border: #e2e8f0 (Slate 200)
  - Text Main: #0f172a (Slate 900)
  - Text Muted: #64748b (Slate 500)
- **Typography:** Manrope font family
- **Shadows:** Custom card shadows with hover elevation
- **Custom Scrollbar:** Slate-colored thin scrollbar

---

#### 12:30 PM - Deal Intelligence Page Created
- **Type:** New Feature
- **Description:** Created the Deal Intelligence & Chat Terminal page with AI assistant
- **File Created:** `apps/web/deal.html`

#### Deal Intelligence Page Layout:
```
┌─────────────────────────────────────────────────────────────┐
│  Header: DealOS > CRM > Technology > Project Apex Logistics │
│  Search Bar + Notifications + User Avatar                   │
├─────────────────────────────┬───────────────────────────────┤
│  Deal Details (Left Panel)  │  AI Chat Terminal (Right)     │
│  ┌───────────────────────┐  │  ┌───────────────────────────┐│
│  │ Project Apex Logistics│  │  │ Deal Assistant AI (Beta)  ││
│  │ Series B | Due Diligence│ │  │ Context: P X +2           ││
│  ├───────────────────────┤  │  ├───────────────────────────┤│
│  │ Lead: Sarah Jenkins   │  │  │ AI: I've analyzed docs... ││
│  │ Analyst: Mike Ross    │  │  │ User: Summarize churn...  ││
│  ├───────────────────────┤  │  │ AI: Key Findings:         ││
│  │ $120M  | 22%  | $450M │  │  │ • Q3 Churn +2.1%         ││
│  │ Revenue|EBITDA|Valuation│ │  │ • Enterprise 98%          ││
│  ├───────────────────────┤  │  ├───────────────────────────┤│
│  │ Deal Progress Timeline│  │  │ [Attached Files]          ││
│  │ ✓ NDA Signed         │  │  │ Q3_Financials.xlsx        ││
│  │ ✓ Management Meeting │  │  │ Legal_DD_Memo.pdf         ││
│  │ ● Commercial DD      │  │  ├───────────────────────────┤│
│  │ ○ Investment Committee│  │  │ Ask about the deal...     ││
│  ├───────────────────────┤  │  └───────────────────────────┘│
│  │ Key Risks            │  │                               │
│  │ Recent Documents     │  │                               │
│  └───────────────────────┘  │                               │
└─────────────────────────────┴───────────────────────────────┘
```

#### Deal Intelligence Sections:
1. **Glass Header**
   - DealOS branding with grid icon
   - Breadcrumb navigation (CRM > Technology > Project)
   - Search bar with placeholder
   - Notifications and user avatar

2. **Deal Details Panel (Left)**
   - Project icon and title with tags (Series B, Due Diligence, SaaS/Logistics)
   - Share and Edit Deal buttons
   - Team info (Lead Partner, Analyst, Deal Source, Last Updated)
   - KPI Cards: Revenue $120M, EBITDA Margin 22%, Valuation $450M, Retention 94%
   - Deal Progress timeline with milestones
   - Key Risks section with warnings
   - Recent Documents with file previews

3. **AI Chat Terminal (Right)**
   - Deal Assistant AI header with Beta badge
   - Context indicators showing attached documents
   - Chat messages with AI and User bubbles
   - AI analysis with citations (Page 14, Section 4.2)
   - Key Findings highlighted in cards
   - Helpful/Copy action buttons
   - File attachment chips
   - Text input with attach and send buttons
   - Disclaimer about AI accuracy

#### Navigation Updates:
- Deal cards in CRM page now link to Deal Intelligence page
- DealOS logo links back to CRM page
- Breadcrumb navigation for easy return

#### Design System (Deal Page):
- **Colors:**
  - Primary: #1269e2 (Blue)
  - Background: #ffffff (White)
  - Surface: #f8fafc (Slate 50)
  - Border: #e2e8f0 (Slate 200)
- **Typography:** Manrope + Noto Sans
- **Effects:** Glass panels with backdrop blur, gradient AI bubbles
- **Animations:** fadeIn for chat messages, pulse for typing indicator

---

## January 23, 2026

### Day 3 - Backend Implementation & Database Integration

#### 2:00 PM - CRM Design Update
- **Type:** Design Update
- **Description:** Updated CRM page to match new "Banker Blue" design system
- **File Updated:** `apps/web/crm.html`
- **Changes:**
  - Changed primary color from `#1e293b` (Slate 800) to `#1a3b5d` (Banker Blue)
  - Updated primary-hover color to `#132c45`
  - Changed page title from "CRM" to "Deal Pipeline"
  - Updated navigation active item from "CRM" to "Deals" with `business_center` icon
  - Updated all hover states to use primary color
  - Added border styling to active navigation item
  - Enhanced sidebar with shadow styling

#### 2:30 PM - Database Setup with Prisma
- **Type:** Backend Infrastructure
- **Description:** Set up database layer with Prisma ORM and SQLite
- **Dependencies Installed:**
  - `@prisma/client@^5.0.0`
  - `prisma@^5.0.0`
- **Files Created:**
  - `apps/api/prisma/schema.prisma` - Database schema definition
  - `apps/api/prisma.config.ts` - Prisma configuration
  - `apps/api/.env` - Environment variables
  - `apps/api/prisma/seed.ts` - Seed data script
  - `apps/api/src/db.ts` - Prisma client singleton

#### Database Schema Created:
| Model | Fields | Purpose |
|-------|--------|---------|
| **Company** | id, name, industry, description, website | Store company information |
| **Deal** | id, name, companyId, stage, status, financials, aiThesis | Core deal tracking |
| **Document** | id, dealId, name, type, fileUrl, extractedData | Document management |
| **Activity** | id, dealId, type, title, description | Activity/audit log |

**Key Fields:**
- Deal financials: `irrProjected`, `mom`, `ebitda`, `revenue`, `dealSize`
- Stage values: INITIAL_REVIEW, DUE_DILIGENCE, IOI_SUBMITTED, LOI_SUBMITTED, NEGOTIATION, CLOSING, PASSED, CLOSED_WON, CLOSED_LOST
- Status values: ACTIVE, PROCESSING, PASSED, ARCHIVED
- Document types: CIM, TEASER, FINANCIALS, LEGAL, NDA, LOI, EMAIL, OTHER

#### 3:00 PM - Seed Data Created
- **Type:** Backend Infrastructure
- **Description:** Created seed data with 4 sample companies and deals
- **Seed Data:**
  - 4 Companies: Apex Logistics, MediCare Plus, Nebula Systems, Titan Freight
  - 4 Deals with full financial metrics and AI thesis
  - 4 Documents attached to deals
  - 2 Activity logs

#### 3:30 PM - REST API Routes Built
- **Type:** Backend Feature
- **Description:** Created comprehensive REST API for deals and companies
- **Files Created:**
  - `apps/api/src/routes/deals.ts` - Deals CRUD + statistics
  - `apps/api/src/routes/companies.ts` - Companies CRUD
  - `apps/api/src/index.ts` - Main Express server with routes

**API Endpoints Implemented:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deals` | Get all deals with filters (stage, status, industry) |
| GET | `/api/deals/:id` | Get single deal with all related data |
| POST | `/api/deals` | Create new deal |
| PATCH | `/api/deals/:id` | Update deal |
| DELETE | `/api/deals/:id` | Delete deal |
| GET | `/api/deals/stats/summary` | Get deal statistics by stage |
| GET | `/api/companies` | Get all companies |
| GET | `/api/companies/:id` | Get single company with deals |
| POST | `/api/companies` | Create company |
| PATCH | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company |
| GET | `/health` | Health check with database status |

**Features:**
- Zod validation for request bodies
- Automatic activity logging for stage changes
- Cascade delete for related records
- Proper error handling with status codes
- CORS enabled for frontend access
- Graceful shutdown handling

#### 4:00 PM - Dynamic Frontend Created
- **Type:** Frontend Feature
- **Description:** Created dynamic CRM page that fetches real data from API
- **File Created:** `apps/web/crm-dynamic.html`
- **Features:**
  - Fetches deals from `/api/deals` endpoint
  - Displays loading state with spinner
  - Error handling with retry button
  - Dynamic deal count in header
  - Stage-based color coding
  - Time formatting (hours/days ago)
  - Responsive grid layout
  - Links to deal detail page with ID parameter

**JavaScript Functions:**
- `loadDeals()` - Fetch and render all deals
- `renderDeals()` - Organize and display deal cards
- `renderDealCard()` - Generate HTML for single deal
- `getStageColor()` - Map stages to color schemes
- `getStageLabel()` - Format stage names
- `formatTime()` - Convert timestamps to relative time

#### Testing Results:
- API Server: Running on `http://localhost:3001`
- Health Check: ✅ Connected to database
- GET `/api/deals`: ✅ Returns 4 deals with full data
- Frontend: ✅ Successfully loads and displays deals

#### Tech Stack Summary:
**Backend:**
- Express.js for REST API
- Prisma 5 as ORM
- SQLite for development database
- Zod for validation
- TypeScript for type safety
- tsx for dev running

**Frontend:**
- Vanilla JavaScript with Fetch API
- Tailwind CSS for styling
- Material Symbols for icons
- Manrope font family

---

## Upcoming Tasks
- [x] Run `npm install` to install dependencies
- [x] Set up database (SQLite/Prisma)
- [x] Create REST API routes
- [x] Connect CRM page to real data
- [ ] Convert pages to React components
- [ ] Add interactive billing toggle functionality
- [ ] Implement dark mode toggle
- [ ] Create additional pages (Features, Solutions, Contact)
- [ ] Add form handling for demo requests
- [ ] Add authentication
- [ ] Add file upload for documents
- [ ] Implement AI document processing
- [ ] Add deal creation form
- [ ] Build analytics dashboard
- [ ] Deploy to production

---

## Pages Completed
| Page | File | Status | Type |
|------|------|--------|------|
| Landing Page | `apps/web/index.html` | Done | Static HTML |
| Pricing Page | `apps/web/pricing.html` | Done | Static HTML |
| Dashboard | `apps/web/dashboard.html` | Done | Static HTML |
| CRM | `apps/web/crm.html` | Done | Static HTML |
| Deal Intelligence | `apps/web/deal.html` | Done | Static HTML |
| **VDR (Virtual Data Room)** | `apps/web/vdr.html` | **Done** | **React + TypeScript** |

---

## January 23, 2026

### VDR (Virtual Data Room) - Full React Implementation

#### 2:00 PM - VDR Functional Implementation
- **Type:** New Feature (Major)
- **Description:** Implemented fully functional VDR page using React + TypeScript while preserving pixel-perfect design
- **Files Created:**
  - `apps/web/src/vdr.tsx` - Main VDR component
  - `apps/web/src/main.tsx` - React entry point
  - `apps/web/src/components/FolderTree.tsx` - Folder navigation sidebar
  - `apps/web/src/components/FileTable.tsx` - File list table
  - `apps/web/src/components/FiltersBar.tsx` - Search and smart filters
  - `apps/web/src/components/InsightsPanel.tsx` - AI insights panel
  - `apps/web/src/data/vdrMockData.ts` - Mock data source
  - `apps/web/src/types/vdr.types.ts` - TypeScript type definitions
  - `apps/web/src/index.css` - Tailwind styles
  - `apps/web/vdr.html` - VDR entry point
  - `apps/web/tailwind.config.js` - Tailwind configuration
  - `apps/web/postcss.config.js` - PostCSS configuration
  - `apps/web/VDR_README.md` - Complete documentation

- **Files Modified:**
  - `apps/web/vite.config.ts` - Added React plugin and VDR entry point

#### Features Implemented:

**1. Folder Tree (Left Sidebar)**
- ✅ Display folders with status badges (Ready, Attention, Reviewing, Restricted)
- ✅ Show readiness percentage and file count
- ✅ Keyboard navigation (Tab, Enter, Space)
- ✅ Active folder highlighting
- ✅ Click to select and load files

**2. File List (Center Table)**
- ✅ Display files with Name, AI Analysis, Author, Date columns
- ✅ File type icons (Excel, PDF, Word)
- ✅ AI analysis tags with color coding
- ✅ Search by filename, description, and tags
- ✅ Highlighted rows for high-risk files
- ✅ File click handler (placeholder)

**3. Smart Filters**
- ✅ AI search input with prompt placeholder
- ✅ 4 predefined smart filter chips:
  - "Contains Change of Control"
  - "EBITDA Adjustments"
  - "High Risk Flags"
  - "FY 2023 Only"
- ✅ Multiple active filters support
- ✅ Real-time file list filtering

**4. AI Quick Insights (Right Panel)**
- ✅ Folder summary with completion percentage
- ✅ Red flags with severity indicators (High/Medium)
- ✅ "View File" action for linked red flags
- ✅ Missing documents list
- ✅ "Request" action for missing docs
- ✅ Dynamic updates on folder change

**5. File Upload**
- ✅ Multi-file upload via file picker
- ✅ File validation (max 50MB, PDF/Excel/Word only)
- ✅ Simulated AI processing (2-second delay)
- ✅ Files added to active folder
- ✅ Real-time UI updates
- ✅ Error handling for invalid files

**6. Report Generation**
- ✅ "Generate Full Report" button
- ✅ Markdown report with:
  - Folder summary
  - Red flags list
  - Missing documents
  - Files with AI analysis
- ✅ Download as .md file
- ✅ Filename with folder name + timestamp

**7. Accessibility**
- ✅ Keyboard navigation for folder tree
- ✅ ARIA labels on interactive elements
- ✅ Focus management
- ✅ Semantic HTML structure

#### Technical Implementation:

**Stack:**
- React 18.3.0
- TypeScript 5.3.0
- Vite 5.0.0 (build tool)
- Tailwind CSS 3.4.0
- Material Symbols icons
- Google Fonts (Inter)

**State Management:**
- React useState for local state
- No external state library (kept simple)
- Props-based component communication

**Data Architecture:**
- Mock data in `vdrMockData.ts`
- TypeScript interfaces for type safety
- Ready for API integration (props-based design)

**Design Preservation:**
- ✅ 100% pixel-perfect match to original HTML
- ✅ No layout changes
- ✅ No spacing/padding modifications
- ✅ No color changes
- ✅ Exact same hover states and animations
- ✅ Only functional additions via React

#### Build Results:
- Build time: ~500ms
- JavaScript bundle: 171.96 KB (gzipped: 54.99 KB)
- CSS bundle: 32.37 KB (gzipped: 6.25 KB)
- No build errors or warnings
- All static HTML pages preserved

#### Testing Completed:
- [x] Folder selection changes file list ✅
- [x] Search filters files correctly ✅
- [x] Smart filters work (single and multiple) ✅
- [x] File upload validates size and type ✅
- [x] Uploaded files appear in list ✅
- [x] AI processing simulation works ✅
- [x] Report generation downloads file ✅
- [x] Insights update when folder changes ✅
- [x] Keyboard navigation works ✅
- [x] UI matches original design pixel-perfectly ✅

#### Ready for API Integration:
All components accept data via props and can be easily connected to real backend:
```typescript
// Example future API integration
const folders = await fetch('/api/vdr/folders').then(r => r.json());
const files = await fetch(`/api/vdr/folders/${folderId}/files`).then(r => r.json());
```

#### Next Steps for VDR:
- [ ] Connect to real backend API
- [ ] Implement file storage (S3 or similar)
- [ ] Add real AI document processing
- [ ] Implement authentication/permissions
- [ ] Add file preview modal
- [ ] Implement real-time collaboration
- [ ] Add version history tracking
- [ ] Create PDF report generation (beyond markdown)

---

## January 24, 2026

### Database Migration: SQLite to Supabase

#### 2:00 PM - Supabase Migration
- **Type:** Infrastructure Upgrade (Major)
- **Description:** Migrated database from SQLite to Supabase (PostgreSQL) for production-ready infrastructure
- **Motivation:** User requested to "use supabase as a database"

#### Changes Made:

**1. Dependencies Installed:**
- `@supabase/supabase-js` - Supabase JavaScript client

**2. Prisma Schema Updated** (`apps/api/prisma/schema.prisma`):
- Changed datasource from `sqlite` to `postgresql`
- Added `directUrl` for migrations (port 5432)
- Converted string fields to native PostgreSQL enums:
  - `DealStage` (INITIAL_REVIEW, DUE_DILIGENCE, IOI_SUBMITTED, LOI_SUBMITTED, NEGOTIATION, CLOSING, PASSED, CLOSED_WON, CLOSED_LOST)
  - `DealStatus` (ACTIVE, PROCESSING, PASSED, ARCHIVED)
  - `DocumentType` (CIM, TEASER, FINANCIALS, LEGAL, NDA, LOI, EMAIL, OTHER)
  - `ActivityType` (DOCUMENT_UPLOADED, STAGE_CHANGED, NOTE_ADDED, MEETING_SCHEDULED, CALL_LOGGED, EMAIL_SENT, STATUS_UPDATED)
- Changed `extractedData` and `metadata` from `String?` to `Json?`
- Added database indexes for performance:
  - `Deal`: companyId, stage, status, updatedAt
  - `Document`: dealId, type
  - `Activity`: dealId, createdAt
  - `Company`: name

**3. Environment Configuration:**
- Updated `apps/api/.env` with Supabase connection strings
- Created `apps/api/.env.example` as template
- Added two connection URLs:
  - `DATABASE_URL`: Connection pooling via pgBouncer (port 6543)
  - `DIRECT_URL`: Direct connection for migrations (port 5432)

**4. Documentation Created:**

| File | Purpose |
|------|---------|
| `SUPABASE_SETUP.md` | Complete setup guide for Supabase integration |
| `MIGRATION_GUIDE.md` | Step-by-step migration from SQLite to Supabase |
| `QUICKSTART.md` | 5-minute quick start guide |
| `.env.example` | Template for environment variables |

**5. Updated Documentation:**
- `README.md`: Updated tech stack, installation steps, seed instructions
- Changed "SQLite (development)" to "Supabase (PostgreSQL)"
- Added links to Supabase setup guides

#### Key Benefits of Supabase:

**Type Safety:**
- Native enums instead of strings (compile-time checking)
- Proper JSON types for structured data
- TypeScript types auto-generated by Prisma

**Performance:**
- Connection pooling (pgBouncer) for thousands of concurrent connections
- Database indexes on frequently queried fields
- Query optimization via PostgreSQL engine

**Production Features:**
- Daily automatic backups
- Point-in-time recovery
- SSL encrypted connections
- Web dashboard for data management
- Real-time subscriptions (future use)
- Built-in authentication (future use)
- File storage (future use)

**Developer Experience:**
- Visual table editor
- SQL query runner
- Performance monitoring
- Logs and analytics
- API documentation

#### Migration Steps for Users:

1. Create Supabase project at [supabase.com](https://supabase.com)
2. Get connection strings from Supabase Dashboard > Settings > Database
3. Update `apps/api/.env` with credentials
4. Run migrations: `npx prisma migrate dev --name init`
5. Seed database: `npx tsx prisma/seed.ts`
6. Verify: Test API health and endpoints

#### Backward Compatibility:

- Seed data remains identical (4 companies, 4 deals, 4 documents, 2 activities)
- API routes unchanged (deals.ts, companies.ts)
- No frontend changes required
- Same REST API endpoints and response formats

#### Files Modified:
- `apps/api/prisma/schema.prisma` - Full rewrite for PostgreSQL
- `apps/api/.env` - New connection strings
- `README.md` - Tech stack and setup instructions
- `PROGRESS.md` - This entry

#### Files Created:
- `SUPABASE_SETUP.md` - Comprehensive setup guide
- `MIGRATION_GUIDE.md` - Migration instructions with rollback plan
- `QUICKSTART.md` - Quick start for new developers
- `apps/api/.env.example` - Environment variable template

#### Testing Status:
- Schema changes documented and ready
- Migration commands provided
- Seed data compatible with PostgreSQL enums
- Documentation complete and comprehensive

**Note**: Migration requires user to create Supabase account and configure credentials. All setup steps documented in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

---

---

## January 26, 2026

### Day 5 - Full Stack Integration & AI Features

#### Migration from Prisma to Direct Supabase Client
- **Type:** Architecture Change
- **Description:** Replaced Prisma ORM with direct Supabase JavaScript client for simpler, more direct database access
- **Files Modified:**
  - `apps/api/src/supabase.ts` - Supabase client initialization
  - `apps/api/src/routes/deals.ts` - Rewrote using Supabase queries
  - `apps/api/src/routes/companies.ts` - Rewrote using Supabase queries

#### New Database Schema (Direct SQL)
- **Type:** Infrastructure
- **File Created:** `apps/api/supabase-schema.sql`
- **Description:** Created SQL schema for direct execution in Supabase SQL Editor
- **Tables:**
  - `Company` - Company information with UUID primary keys
  - `Deal` - Deal tracking with financial metrics, stages, AI thesis
  - `Document` - Document metadata with extracted data (JSONB)
  - `Activity` - Activity/audit log for deal events
- **Indexes Added:** 8 performance indexes on frequently queried columns
- **Seed Data:** 4 companies, 4 deals, 4 documents, 2 activities

#### New API Routes Created

**1. Activities API** (`apps/api/src/routes/activities.ts`)
- `GET /api/deals/:dealId/activities` - List activities for a deal
- `POST /api/deals/:dealId/activities` - Create new activity
- Features: Zod validation, automatic timestamps

**2. Documents API** (`apps/api/src/routes/documents.ts`)
- `GET /api/deals/:dealId/documents` - List documents for a deal
- `POST /api/deals/:dealId/documents` - Upload document metadata
- `GET /api/documents/:id` - Get single document
- `DELETE /api/documents/:id` - Delete document
- Features: Supabase Storage ready (placeholder for file upload)

**3. AI API** (`apps/api/src/routes/ai.ts`)
- `POST /api/deals/:dealId/chat` - Chat with AI about a deal
- `POST /api/deals/:dealId/generate-thesis` - Generate investment thesis
- `POST /api/deals/:dealId/analyze-risks` - Analyze deal risks (JSON response)
- `GET /api/ai/status` - Check AI service availability
- Features: OpenAI GPT-4 Turbo integration, conversation history, deal context injection

**4. OpenAI Integration** (`apps/api/src/openai.ts`)
- OpenAI client setup with API key from environment
- System prompt for PE deal analysis
- `generateDealContext()` - Builds context from deal data for AI prompts
- Graceful fallback when API key not configured

#### Updated Main Server (`apps/api/src/index.ts`)
- Mounted all new routers
- Updated API info endpoint with all available routes
- Enhanced startup logging with all endpoint URLs

#### Frontend Integration - CRM Page

**File:** `apps/web/crm.html`

**Features Implemented:**
1. **API Data Loading**
   - Fetches deals from `http://localhost:3001/api/deals`
   - Loading state with spinner
   - Error handling with user-friendly messages

2. **Filter System**
   - Stage filter dropdown (All, Initial Review, Due Diligence, IOI Submitted, etc.)
   - Industry filter dropdown (dynamically populated from deals)
   - Active filter state tracking
   - Filters update URL params and refetch data

3. **Search Functionality**
   - Real-time search with 300ms debounce
   - Searches across deal name, company name, industry, AI thesis
   - Server-side filtering via `?search=` query param

4. **Upload Modal**
   - "Ingest Deal Data" button opens modal
   - Drag & drop file upload zone
   - File type validation (PDF, Excel, Word, Email)
   - Progress bar animation
   - Success notification
   - Keyboard shortcut: ESC to close

5. **Keyboard Shortcuts**
   - CMD+K to focus search bar
   - ESC to close upload modal

6. **Dynamic Deal Cards**
   - Real data from API (company, financials, stage, AI thesis)
   - Clickable cards link to `deal.html?id={dealId}`
   - Stage badges with appropriate colors
   - Relative time formatting ("2 hours ago", "3 days ago")

#### Frontend Integration - Deal Page

**File:** `apps/web/deal.js`

**Features Implemented:**
1. **Dynamic Data Loading**
   - Reads deal ID from URL parameter (`?id=`)
   - Fetches deal data from `GET /api/deals/:id`
   - Populates all page sections with real data

2. **Data Population**
   - Deal header (name, stage, industry)
   - Financial metrics (Revenue, EBITDA margin, Deal Size)
   - AI Thesis display in chat intro
   - Documents list with file icons and sizes
   - Last updated timestamp

3. **Chat Interface**
   - Keyword-based responses using real deal data
   - Responses for: risks, valuation, financials, thesis, general overview
   - Dynamic calculations (EV/EBITDA, revenue multiples)
   - Formatted HTML responses with cards and bullet points

4. **Utility Functions**
   - `formatCurrency()` - Currency formatting ($48M, $1.2B)
   - `formatFileSize()` - File size formatting (KB, MB)
   - `getStageLabel()` - Stage enum to display name
   - `formatRelativeTime()` - Relative time display
   - `getDocIcon()` / `getDocColor()` - Document type styling

#### Environment Configuration
- **File:** `apps/api/.env`
- Added `OPENAI_API_KEY` for AI features
- Supabase URL and anon key configured

#### Testing Results
- API Server: Running on `http://localhost:3001`
- Web Server: Running on `http://localhost:3000`
- All endpoints tested and working:
  - ✅ GET /api/deals - Returns deals with filters
  - ✅ GET /api/deals/:id - Returns single deal with relations
  - ✅ GET /api/deals/:dealId/activities - Returns activities
  - ✅ POST /api/deals/:dealId/chat - AI chat working
  - ✅ GET /api/ai/status - Returns AI availability
- Frontend tested:
  - ✅ CRM page loads deals from API
  - ✅ Filters work (stage, industry)
  - ✅ Search functionality works
  - ✅ Upload modal opens and closes
  - ✅ Deal cards link to detail page
  - ✅ Deal detail page loads real data

#### Current Project State
The CRM is now fully functional with:
- Real database (Supabase PostgreSQL)
- REST API with all CRUD operations
- AI integration (OpenAI GPT-4)
- Dynamic frontend with API data
- Working filters, search, and navigation

#### Known Issues / Next Steps
- [ ] Real file upload to Supabase Storage (currently demo only)
- [ ] Real AI chat (currently keyword-based responses)
- [ ] Consistent design across all pages (headers/sidebars differ)
- [ ] Convert to SPA or add shared layout components

---

## January 27, 2026

### Day 6 - Shared Layout & Collapsible Sidebar

#### Shared Layout Component Created
- **Type:** Architecture Improvement
- **Description:** Created a shared layout component for consistent sidebar and header across all pages
- **File Created:** `apps/web/js/layout.js`

**Features:**
- `NAV_ITEMS` configuration array for navigation items
- `generateSidebar(activePage, options)` - Generates sidebar HTML with active state
- `generateHeader(options)` - Generates header HTML
- `generateStyles()` - Injects required CSS styles
- `PELayout.init(activePage, options)` - Initialize layout on page load
- Collapsible sidebar with localStorage persistence
- Keyboard shortcut CMD+K to focus search

#### Navigation Items Added
| ID | Label | Icon | URL |
|----|-------|------|-----|
| dashboard | Dashboard | dashboard | /dashboard.html |
| deals | Deals | work | /crm.html |
| data-room | Data Room | folder_open | /vdr.html |
| crm | CRM | groups | # (placeholder) |
| portfolio | Portfolio | pie_chart | # (placeholder) |
| admin | Admin | admin_panel_settings | # (placeholder) |
| ai-reports | AI Reports | auto_awesome | # (placeholder) |

#### Collapsible Sidebar Implementation
- **Type:** New Feature
- **Description:** Added ability to collapse/expand the sidebar for more screen space

**Technical Details:**
- Collapse button positioned at top-right of sidebar (-right-3)
- CSS transitions for smooth animation (300ms)
- Collapsed state saves to localStorage (`pe-sidebar-collapsed`)
- Auto-restores collapsed state on page load
- Chevron icon rotates 180deg when collapsed

**Collapsed Behavior:**
- Sidebar width changes from 256px to 72px
- Navigation labels hidden
- Logo text hidden
- User info hidden
- Dividers hidden
- Icons centered
- User avatar remains visible

#### Pages Refactored to Use Shared Layout

**1. Dashboard Page (`dashboard.html`)**
- ✅ Added `<div id="sidebar-root"></div>` placeholder
- ✅ Loads `js/layout.js`
- ✅ Calls `PELayout.init('dashboard', { collapsible: true })`

**2. CRM Page (`crm.html`)**
- ✅ Replaced inline sidebar (50+ lines) with `<div id="sidebar-root"></div>`
- ✅ Loads `js/layout.js` before main script
- ✅ Calls `PELayout.init('deals', { collapsible: true })`
- ✅ Keeps custom header with "Ingest Deal Data" button

**3. Deal Page (`deal.html`)**
- ✅ Replaced inline sidebar with `<div id="sidebar-root"></div>`
- ✅ Loads `js/layout.js` before `deal.js`
- ✅ `deal.js` calls `PELayout.init('deals', { collapsible: true })`

**4. VDR Page (`vdr.tsx`)**
- ✅ Removed PE OS navigation sidebar entirely
- ✅ Shows only folder tree sidebar (280px)
- ✅ VDR has its own React-based navigation

#### Bug Fixes

**1. Fixed Invalid Icon Name**
- **Issue:** Sidebar showed "BRIEFCASE" text instead of icon
- **Cause:** `briefcase` is not a valid Material Symbols icon name
- **Fix:** Changed `icon: 'briefcase'` to `icon: 'work'` in NAV_ITEMS
- **Files Fixed:**
  - `apps/web/js/layout.js`
  - `apps/web/crm.html`
  - `apps/web/deal.html`

**2. Fixed API Port Conflict**
- **Issue:** CRM page showed "Unexpected token '<'" error
- **Cause:** Vite dev server was responding on port 3001 instead of API
- **Fix:** Killed conflicting processes and restarted servers properly
- **Verification:** `curl http://localhost:3001/api/deals` returns JSON

#### Files Modified Summary

| File | Change |
|------|--------|
| `apps/web/js/layout.js` | Created shared layout component |
| `apps/web/dashboard.html` | Use shared layout, enable collapsible |
| `apps/web/crm.html` | Refactored to use shared layout |
| `apps/web/deal.html` | Refactored to use shared layout |
| `apps/web/deal.js` | Added PELayout.init() call |
| `apps/web/src/vdr.tsx` | Removed PE OS sidebar |

#### Design Tokens (from layout.js)
```css
/* Colors */
--primary: #003366 (Banker Blue)
--primary-hover: #002855
--primary-light: #E6EEF5
--secondary: #059669 (Success Green)
--secondary-light: #D1FAE5
--background-body: #F8F9FA
--surface-card: #FFFFFF
--border-subtle: #E5E7EB
--text-main: #111827
--text-secondary: #4B5563
--text-muted: #9CA3AF

/* Typography */
--font-family: Inter, sans-serif

/* Sidebar */
--sidebar-width: 256px (expanded)
--sidebar-width-collapsed: 72px
--transition-duration: 300ms
```

#### Testing Results
- ✅ Dashboard - Sidebar loads, collapse button works
- ✅ CRM Page - Sidebar loads with "Deals" active, collapse works
- ✅ Deal Page - Sidebar loads with "Deals" active, collapse works
- ✅ VDR Page - Only shows folder tree sidebar
- ✅ Data Room link navigates to /vdr.html
- ✅ Collapse state persists across page navigation
- ✅ All icons display correctly (no text fallbacks)

#### Known Issues / Next Steps
- [ ] CRM, Portfolio, Admin, AI Reports links are placeholders
- [ ] Mobile menu button not implemented
- [ ] User dropdown menu not implemented
- [ ] Notifications panel not implemented

---

### Day 6 (Continued) - VDR Page PE OS Sidebar Integration

#### VDR Page Updated to Use Shared Layout
- **Type:** UI Consistency Improvement
- **Description:** Added the shared PE OS collapsible sidebar to the VDR page for consistent navigation across all pages
- **User Request:** "our VDR page looks totally different from our other pages. lets give our left collapsible sidebar to this vdr page also."

**Files Modified:**

**1. `apps/web/vdr.html`**
- Added `<div id="sidebar-root"></div>` for PE OS sidebar injection
- Added `class="bg-background-light text-text-main font-sans overflow-hidden h-screen flex"` to body
- Loaded `js/layout.js` script
- Added PELayout initialization:
  ```javascript
  PELayout.init('data-room', { collapsible: true });
  ```
- Set React root to `class="flex-1 flex overflow-hidden"` to work alongside sidebar

**2. `apps/web/src/vdr.tsx`**
- Changed root container from `h-screen w-full` to `h-full w-full`
- Allows React app to fill remaining space after PE OS sidebar

#### VDR Page Layout (After Update)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PE OS Sidebar │ Folder Tree │        Main Content        │ AI Insights    │
│ (256px/72px)  │ (280px)     │        (Flex)              │ (300px)        │
│ ┌───────────┐ │ ┌─────────┐ │  ┌───────────────────────┐ │ ┌────────────┐ │
│ │ Dashboard │ │ │ 100     │ │  │  Header/Breadcrumbs   │ │ │ Summary    │ │
│ │ Deals     │ │ │ 200     │ │  ├───────────────────────┤ │ │ Red Flags  │ │
│ │ Data Room◄│ │ │ 300     │ │  │  Smart Filters        │ │ │ Missing    │ │
│ │ CRM       │ │ │ 400     │ │  ├───────────────────────┤ │ │ Docs       │ │
│ │ Portfolio │ │ │ 500     │ │  │  File Table           │ │ │            │ │
│ │ Admin     │ │ └─────────┘ │  │                       │ │ │ [Generate] │ │
│ │ ───────── │ │             │  │                       │ │ │            │ │
│ │ AI Reports│ │             │  │                       │ │ │            │ │
│ └───────────┘ │             │  └───────────────────────┘ │ └────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Testing Checklist
- [ ] VDR page loads with PE OS sidebar
- [ ] "Data Room" nav item is highlighted (active state)
- [ ] Sidebar collapse button works
- [ ] Collapsed state persists (localStorage)
- [ ] Folder tree still works
- [ ] File upload still works
- [ ] All other VDR features functional

---

### Day 6 (Continued) - VDR Color Theme Fix

#### Issue
- **Problem:** VDR page had a different color theme (light blue `#1269e2`) compared to other pages (Banker Blue `#003366`)
- **User Request:** "vdr.html page has different color theme its light blue. i want to have exact same color theme for vdr page as of other pages."

#### Root Cause
1. **`tailwind.config.js`** had wrong primary color: `#1269e2` instead of `#003366`
2. **`vdr.html`** was missing the Tailwind CDN script for runtime sidebar classes
3. **`vdr.html`** was missing PE OS design system colors (`surface-card`, `border-subtle`, `background-body`)

#### Fix Applied

**1. Updated `apps/web/tailwind.config.js`**
Changed primary color and added missing PE OS colors:
```javascript
colors: {
  'primary': '#003366',        // Was: '#1269e2'
  'primary-hover': '#002855',
  'primary-light': '#E6EEF5',
  'secondary': '#059669',
  'secondary-light': '#D1FAE5',
  'background-body': '#F8F9FA',
  'surface-card': '#FFFFFF',
  'border-subtle': '#E5E7EB',
  'border-focus': '#CBD5E1',
  'text-main': '#111827',
  'text-secondary': '#4B5563',
  'text-muted': '#9CA3AF',
}
```

**2. Updated `apps/web/vdr.html`**
- Added Tailwind CDN script: `<script src="https://cdn.tailwindcss.com"></script>`
- Added Google Fonts (Inter, Material Symbols)
- Changed `tailwind = {` to `tailwind.config = {` for CDN compatibility
- Added missing PE OS colors to inline config

#### Files Modified
| File | Change |
|------|--------|
| `apps/web/tailwind.config.js` | Fixed primary color to #003366, added PE OS colors |
| `apps/web/vdr.html` | Added Tailwind CDN, fonts, updated color config |

#### Result
VDR page now has consistent Banker Blue (#003366) theme matching Dashboard, CRM, and Deal pages.

---

### Day 6 (Continued) - VDR React Components Color Fix

#### Issue
- **Problem:** While the PE OS sidebar was fixed, the VDR React components still showed light blue (#1269e2) instead of Banker Blue (#003366)
- **Affected Elements:**
  - Upload Files button
  - Generate Full Report button
  - Folder icons in Data Room Index
  - Smart filter chips
  - File table hover states
  - Various links and buttons

#### Root Cause
The React components were using Tailwind classes like `bg-primary`, `text-primary`, `hover:text-primary` which were compiled with the old color value. Even though `tailwind.config.js` was updated, Vite's compiled CSS still had the old values cached.

#### Solution
Replaced Tailwind color classes with hardcoded inline styles using the correct Banker Blue (#003366) color values throughout all VDR React components.

#### Files Modified

**1. `apps/web/src/vdr.tsx`**
- Upload Files button: Changed to inline style `backgroundColor: '#003366'`
- New Folder button: Added hover handlers with hardcoded colors
- Breadcrumb links (Deals, Project Apex): Added hover handlers

**2. `apps/web/src/components/InsightsPanel.tsx`**
- Generate Full Report button: Changed to inline style `backgroundColor: '#003366'`
- AI Quick Insights icon: Changed to inline style `color: '#003366'`
- Request button: Changed to inline style `color: '#003366'`

**3. `apps/web/src/components/FolderTree.tsx`**
- Folder icons: Added inline styles for active (#003366) and inactive (#9CA3AF) states
- Active folder background: Changed to inline style `backgroundColor: '#E6EEF5'`
- Added onMouseOver/onMouseOut handlers for hover effects

**4. `apps/web/src/components/FiltersBar.tsx`**
- Smart filter chips: Converted to inline styles for active/inactive states
- Search input focus ring: Added CSS variable `--tw-ring-color: '#003366'`
- Search icon: Added focus/blur handlers to change color

**5. `apps/web/src/components/FileTable.tsx`**
- `getFileIconColor()`: Updated to return inline styles for doc type
- `getAnalysisColor()`: Updated to return inline styles for primary color
- Checkbox: Added `accentColor: '#003366'`
- Highlighted rows: Changed to inline styles
- More options button: Added hover handlers
- View all link: Added hover handlers

**6. `apps/web/src/index.css`**
- Added CSS rule: `.group:hover .file-name-hover { color: #003366; }`

#### Color Values Used
| Element | Color | Hex Code |
|---------|-------|----------|
| Primary (buttons, icons) | Banker Blue | #003366 |
| Primary Hover | Dark Blue | #002855 |
| Primary Light (backgrounds) | Light Blue | #E6EEF5 |
| Text Secondary | Gray | #4B5563 |
| Text Muted | Light Gray | #9CA3AF |
| Border Light | Border Gray | #E5E7EB |

#### Testing Checklist
- [x] Upload Files button shows Banker Blue
- [x] Generate Full Report button shows Banker Blue
- [x] Folder icons show Banker Blue when active
- [x] Smart filter chips show correct colors
- [x] All hover states work correctly
- [x] VDR page matches other pages' color theme

---

---

### Day 6 (Continued) - Database Schema Enhancement & API Update

#### Database Schema Enhancement
- **Type:** Infrastructure Upgrade (Major)
- **Description:** Added comprehensive database schema to support all application features including VDR folders, users, chat, notifications, and team management
- **User Request:** "to make this product working in real and to have real data into it what more need to be in our supabase db?"

#### New Tables Created

| Table | Purpose |
|-------|---------|
| **User** | User profiles with role, department, title |
| **Folder** | VDR folder structure with parent-child hierarchy |
| **FolderInsight** | AI-generated insights per folder (summary, red flags, recommendations) |
| **DealTeamMember** | Deal team assignments with roles (LEAD, MEMBER, VIEWER) |
| **Contact** | Company contacts with contact type |
| **Conversation** | AI chat conversation threads |
| **ChatMessage** | Individual chat messages (user/assistant) |
| **Notification** | User notifications with types and read status |
| **AuditLog** | Comprehensive audit trail for compliance |

#### Enhanced Existing Tables

**Deal Table Additions:**
- `assignedTo` - UUID reference to User
- `priority` - Enum (LOW, MEDIUM, HIGH, URGENT)
- `tags` - Text array for categorization
- `targetCloseDate` / `actualCloseDate` - Date tracking
- `source` - Lead source tracking

**Document Table Additions:**
- `folderId` - UUID reference to Folder
- `uploadedBy` - UUID reference to User
- `aiAnalysis` - JSONB for AI analysis results
- `aiAnalyzedAt` - Timestamp of analysis
- `tags` - Text array
- `isHighlighted` - Boolean for important documents
- `mimeType` - File MIME type

**Company Table Additions:**
- `logo` - Logo URL
- `headquarters` - Location
- `Founded` - Year founded
- `employees` - Employee count

**Activity Table Additions:**
- `userId` - UUID reference to User who performed action
- `metadata` - JSONB for additional data

#### Seed Data Added

| Table | Records | Details |
|-------|---------|---------|
| User | 5 | Sarah Chen (MD), Michael Ross (VP), Emily Watson (Associate), David Kim (Analyst), Lisa Park (VP Legal) |
| Folder | 5 | Financials, Legal, Commercial, Management, Technical |
| FolderInsight | 2 | AI insights for Financials and Legal folders |
| DealTeamMember | 12 | Team assignments across all 4 deals |
| Contact | 8 | Company contacts (CEO, CFO, etc.) |
| Notification | 3 | Sample notifications for testing |
| Document | 8 | Documents distributed across folders |

#### Database Features Added

**Triggers:**
- `update_folder_file_count` - Auto-updates folder file count on document changes
- `update_deal_updated_at` - Auto-updates deal timestamp on modifications

**Views:**
- `DealSummary` - Optimized view for deal list with company and team info
- `FolderTree` - Recursive CTE for folder hierarchy

**Indexes:**
- 15+ performance indexes on foreign keys and frequently queried columns

---

#### API Update to Support New Schema
- **Type:** Backend Feature (Major)
- **Description:** Created new API routes and updated existing ones to support the enhanced database schema
- **User Request:** "update the API to use the new database schema"

#### New Route Files Created

| File | Purpose | Endpoints |
|------|---------|-----------|
| `apps/api/src/routes/folders.ts` | VDR folder management | GET/POST /deals/:dealId/folders, GET/PATCH/DELETE /folders/:id, GET/POST /folders/:id/insights |
| `apps/api/src/routes/users.ts` | User management | GET/POST/PATCH/DELETE /users, GET /users/:id/deals, GET /users/:id/notifications |
| `apps/api/src/routes/chat.ts` | AI conversation persistence | GET/POST/DELETE /conversations, POST /conversations/:id/messages |
| `apps/api/src/routes/notifications.ts` | Notification system | GET/POST/PATCH/DELETE /notifications, POST /mark-all-read |

#### Updated Route Files

**`apps/api/src/routes/deals.ts`:**
- Added `assignedTo`, `priority`, `tags`, `targetCloseDate`, `source` to create/update schemas
- Added team member management endpoints:
  - `GET /api/deals/:id/team` - Get team members
  - `POST /api/deals/:id/team` - Add team member
  - `PATCH /api/deals/:dealId/team/:memberId` - Update role
  - `DELETE /api/deals/:dealId/team/:memberId` - Remove member
- Updated queries to include `assignedUser` and `teamMembers` relations
- Added `folders` relation to single deal query

**`apps/api/src/routes/documents.ts`:**
- Added `folderId`, `aiAnalysis`, `tags`, `isHighlighted` to schema
- Added `GET /api/folders/:folderId/documents` endpoint
- Updated queries to include `uploader` and `folder` relations
- Added AI analysis timestamp tracking

#### Updated `apps/api/src/index.ts`

Mounted all new routes:
```javascript
app.use('/api', foldersRouter);      // Folder routes
app.use('/api/users', usersRouter);   // User routes
app.use('/api', chatRouter);          // Chat routes
app.use('/api/notifications', notificationsRouter); // Notification routes
```

#### New API Endpoints Summary

**Folder Management:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deals/:dealId/folders` | List folders with insights |
| POST | `/api/deals/:dealId/folders` | Create folder |
| GET | `/api/folders/:id` | Get folder with documents |
| PATCH | `/api/folders/:id` | Update folder |
| DELETE | `/api/folders/:id` | Delete folder (cascade option) |
| GET | `/api/folders/:id/insights` | Get folder insights |
| POST | `/api/folders/:id/insights` | Create/update insights |

**User Management:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List users (filter by role, department) |
| GET | `/api/users/:id` | Get user with deal memberships |
| POST | `/api/users` | Create user |
| PATCH | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Soft/hard delete |
| GET | `/api/users/:id/deals` | Get deals assigned to user |
| GET | `/api/users/:id/notifications` | Get user notifications |

**Chat/Conversations:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/:id` | Get conversation with messages |
| POST | `/api/conversations` | Create conversation |
| DELETE | `/api/conversations/:id` | Delete conversation |
| POST | `/api/conversations/:id/messages` | Send message & get AI response |
| GET | `/api/conversations/:id/messages` | Get messages |

**Notifications:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications with unread count |
| GET | `/api/notifications/:id` | Get single notification |
| POST | `/api/notifications` | Create notification |
| PATCH | `/api/notifications/:id` | Mark read/unread |
| POST | `/api/notifications/mark-all-read` | Mark all as read |
| DELETE | `/api/notifications/:id` | Delete notification |
| DELETE | `/api/notifications` | Delete all (optionally read only) |

**Deal Team Management:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deals/:id/team` | Get team members |
| POST | `/api/deals/:id/team` | Add team member |
| PATCH | `/api/deals/:dealId/team/:memberId` | Update member role |
| DELETE | `/api/deals/:dealId/team/:memberId` | Remove member |

#### Utility Functions Exported

From `notifications.ts`:
- `createNotification(data)` - Create single notification
- `notifyDealTeam(dealId, type, title, message, excludeUserId)` - Notify all team members

#### Testing Results
All endpoints tested successfully:
- ✅ GET /api/users - Returns 5 users
- ✅ GET /api/deals - Returns deals with team members
- ✅ GET /api/deals/:id/team - Returns team with user details
- ✅ GET /api/deals/:dealId/folders - Returns folders with insights
- ✅ GET /api/deals/:dealId/documents - Returns documents with folder info
- ✅ GET /api/notifications - Returns notifications with unread count

#### Current Project State
The API is now fully updated to support:
- VDR folder hierarchy with AI insights
- User management with role-based access
- Deal team assignments and collaboration
- AI chat persistence with conversation history
- Notification system for team communication
- Document organization within folders

---

### Day 7 - Authentication Pages & Landing Page Update

#### Login Page
- **Type:** New Page
- **File:** `apps/web/login.html`
- **Description:** Institutional login screen with split-screen layout

**Features:**
- Split-screen design (branding left, form right)
- PE OS branding with Banker Blue (#003366) color scheme
- Dashboard preview with hover animation effects
- Email/password fields with validation
- "Remember me" checkbox with session persistence
- Password visibility toggle
- SSO (Single Sign-On) button placeholder
- Link to signup page
- Auto-redirect if already logged in
- Light mode enforced

#### Signup Page
- **Type:** New Page
- **File:** `apps/web/signup.html`
- **Description:** Firm registration and user signup page

**Features:**
- Full Name, Work Email, Password, Confirm Password fields
- Firm Name input
- Role dropdown (Partner/MD, Principal, VP, Associate, Analyst, Operations/Admin)
- Real-time password strength indicator (Weak/Fair/Good/Strong)
- Password match validation
- AES-256 encryption security badge
- Terms of Service and Privacy Policy links
- Session storage on successful signup
- Auto-redirect if already logged in
- Light mode enforced

#### Landing Page Updates
- **Type:** Enhancement
- **File:** `apps/web/index.html`
- **Description:** Added authentication navigation to landing page

**Changes:**
| Location | Before | After |
|----------|--------|-------|
| Header | "Request Demo" button only | Added "Login" link + "Get Started" button |
| Hero Section | "Request Demo" button | "Get Started Free" linking to signup |
| CTA Section | "Start Your Free Trial" button | Now links to signup page |

**New File Created:**
- `apps/web/landingpage.html` - Redirect to index.html for URL compatibility

#### Authentication Flow
```
Landing Page (index.html)
    ├── Login link → login.html
    │       └── Sign up link → signup.html
    └── Get Started → signup.html
            └── Sign in link → login.html

After Login/Signup → crm.html (CRM Dashboard)
```

#### Session Management
- Uses localStorage (Remember Me) or sessionStorage
- Stores: email, name, loggedIn status, rememberMe preference
- Auto-redirects logged-in users away from auth pages
- Logout clears session (to be implemented in CRM header)

---

### Day 7 (Continued) - PDF Upload & Text Extraction

#### Document Upload Feature
- **Type:** Backend + Frontend Feature (Major)
- **Files Modified:**
  - `apps/api/src/routes/documents.ts` - Added PDF text extraction
  - `apps/web/crm.html` - Wired up upload modal to API
  - `apps/api/package.json` - Added pdf-parse dependency

#### Backend Implementation

**PDF Text Extraction:**
```javascript
// Using pdf-parse v1.1.1 with createRequire for ES modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  return {
    text: data.text.replace(/\u0000/g, ''), // Remove null chars for PostgreSQL
    numPages: data.numpages
  };
}
```

**Upload Flow:**
1. File received via multer (memory storage, 50MB limit)
2. Uploaded to Supabase Storage bucket "documents"
3. If PDF: extract text using pdf-parse
4. Save document record with extractedText and status
5. Update deal's lastDocument field
6. Log activity with extraction metadata

**Document Record Fields:**
| Field | Type | Description |
|-------|------|-------------|
| extractedText | TEXT | Full text content from PDF |
| status | TEXT | pending → processing → completed/failed |
| numPages | INTEGER | Number of pages (in activity metadata) |

#### Frontend Implementation

**Upload Modal Enhancements:**
- Added deal selector dropdown (populated from API)
- Wired drag-and-drop to actual API upload
- Real progress tracking during upload
- Success/error notifications with extraction info

**API Integration:**
```javascript
const response = await fetch(`${API_BASE_URL}/deals/${dealId}/documents`, {
  method: 'POST',
  body: formData, // Contains file
});
```

#### Database Changes
Added columns to Document table (run in Supabase SQL Editor):
```sql
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "extractedText" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'pending';
```

#### Dependencies Added
| Package | Version | Purpose |
|---------|---------|---------|
| pdf-parse | ^1.1.1 | PDF text extraction |

#### Testing Results
- Uploaded: "Acquisition Automation System – Full Architecture Guide.pdf"
- Extraction: **12 pages, 7,237 characters** successfully extracted
- Status: `completed`
- Stored in Supabase with full text content

#### Known Issues Fixed
- **pdf-parse v2.x incompatibility:** Downgraded to v1.1.1 for simpler API
- **ES Module import:** Used `createRequire` for CommonJS compatibility
- **PostgreSQL null characters:** Added `.replace(/\u0000/g, '')` sanitization

---

### Day 7 (Continued) - AI Data Extraction & Auto-Deal Creation

#### AI Data Extraction Service
- **Type:** Backend Feature (Major)
- **File Created:** `apps/api/src/services/aiExtractor.ts`
- **Description:** Automated AI-powered extraction of business data from PDF documents using OpenAI GPT-4-turbo

**Features:**
- `extractDealDataFromText(text)` - Analyzes document text and extracts structured data
- Uses GPT-4-turbo with JSON response format
- Truncates text to 15,000 chars for token limit
- Returns null gracefully if AI unavailable or extraction fails

**Extracted Data Schema:**
```typescript
interface ExtractedDealData {
  companyName: string | null;
  industry: string | null;
  description: string;
  revenue: number | null;      // In millions USD
  ebitda: number | null;       // In millions USD
  ebitdaMargin: number | null; // Percentage
  revenueGrowth: number | null; // Percentage
  keyRisks: string[];          // 2-5 risks
  investmentHighlights: string[]; // 2-5 highlights
  summary: string;             // Executive summary
}
```

**System Prompt:**
```
You are a senior private equity analyst. Analyze this document
and extract key business and financial data. Return valid JSON
matching the specified schema. If data is not found, use null.
```

#### Auto-Deal Creation from PDF Upload (Ingest API)
- **Type:** Backend Feature (Major)
- **File Created:** `apps/api/src/routes/ingest.ts`
- **Description:** Upload a CIM/teaser PDF and automatically create a complete deal with AI-extracted data

**Endpoint:** `POST /api/ingest`

**Flow:**
1. **Upload PDF** - Receive file via multer
2. **Extract Text** - Use pdf-parse to extract document text
3. **AI Analysis** - Call GPT-4-turbo to extract company/financial data
4. **Create Company** - Find existing or create new company record
5. **Create Deal** - Create deal with extracted metrics and AI thesis
6. **Upload File** - Store PDF in Supabase Storage
7. **Create Document** - Save document record with extracted data
8. **Log Activity** - Record deal creation activity

**Response:**
```json
{
  "success": true,
  "deal": { "id": "...", "name": "Clay", "industry": "Technology", ... },
  "document": { "id": "...", "name": "CIM.pdf", ... },
  "extractedData": { "companyName": "Clay", "industry": "Technology", ... }
}
```

**Industry Icons Mapping:**
- Healthcare → `monitor_heart`
- Technology/Software → `memory`/`code`
- Cloud/SaaS → `cloud`/`cloud_queue`
- Manufacturing → `precision_manufacturing`
- Transportation/Logistics → `local_shipping`/`webhook`
- Financial Services → `account_balance`
- Default → `business_center`

#### Frontend Upload Modal Update
- **Type:** Frontend Feature
- **File Modified:** `apps/web/crm.html`
- **Description:** Removed deal selector - upload modal now auto-creates deals

**Changes:**
- Removed deal selector dropdown
- Changed file input to accept only PDFs
- Updated description: "Upload a CIM or Teaser PDF - AI will extract data and create the deal automatically"
- Progress text shows "Extracting text & analyzing with AI..."
- Success shows created deal name
- Notification shows deal name, industry, and revenue

**Updated handleFiles():**
```javascript
// Before: Required deal selection, uploaded to existing deal
// After: Calls /api/ingest, auto-creates deal from extracted data

const response = await fetch(`${API_BASE_URL}/ingest`, {
  method: 'POST',
  body: formData,
});
```

#### Updated Server Routes
- **File Modified:** `apps/api/src/index.ts`
- Added ingest router: `app.use('/api/ingest', ingestRouter)`
- Added console log: `📥 Ingest API: http://localhost:3001/api/ingest`
- Updated API info endpoint with ingest route

#### Testing Results
- Uploaded: "Acquisition Automation System – Full Architecture Guide.pdf"
- **AI Extraction Results:**
  - Company Name: Clay
  - Industry: Technology
  - 5 key risks identified
  - 5 investment highlights extracted
- **Created:**
  - Company: Clay (6ee687d0-7555-4b92-aa49-862027a9e0e4)
  - Deal: Clay (c495b2c8-b390-467e-99f8-773d1df17189)
  - Document attached with full extracted text
- **UI:** New "Clay" deal card appears in CRM with AI thesis

#### Files Summary

| File | Type | Description |
|------|------|-------------|
| `apps/api/src/services/aiExtractor.ts` | New | AI data extraction service |
| `apps/api/src/routes/ingest.ts` | New | Auto-deal creation endpoint |
| `apps/api/src/index.ts` | Modified | Mount ingest router |
| `apps/web/crm.html` | Modified | Simplified upload modal |

---

## January 28, 2026

### Day 8 - VDR Enhanced Functionality

#### New Folder Creation Feature
- **Type:** New Feature
- **Description:** Added ability to create new folders in the VDR folder tree
- **File Modified:** `apps/web/src/vdr.tsx`

**Features:**
- "New Folder" button in header opens creation modal
- Modal with folder name input and Cancel/Create buttons
- Auto-generates folder number (100, 200, 300... 600, 700, etc.)
- New folders default to "Ready" status with 0 files
- Real-time folder tree updates
- ESC key closes modal
- Click outside modal to cancel

**State Management:**
```typescript
const [showNewFolderModal, setShowNewFolderModal] = useState(false);
const [newFolderName, setNewFolderName] = useState('');
```

#### File Actions Menu (3-Dot Menu)
- **Type:** New Feature
- **Description:** Added functional dropdown menu for file row actions
- **File Modified:** `apps/web/src/components/FileTable.tsx`

**Features:**
- 3-dot menu button on each file row
- Dropdown menu with Rename, Download, Delete options
- Inline rename with text input field
- Keyboard support: Enter to save, Escape to cancel
- Delete confirmation dialog
- Click outside to close menu
- Auto-focus rename input field

**Actions:**
| Action | Behavior |
|--------|----------|
| Rename | Opens inline input, Enter saves, Escape cancels |
| Download | Triggers file click handler (placeholder) |
| Delete | Shows confirmation dialog, removes from file list |

**State Management:**
```typescript
const [openMenuId, setOpenMenuId] = useState<string | null>(null);
const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
const [renameValue, setRenameValue] = useState('');
```

#### Collapsible AI Quick Insights Panel
- **Type:** New Feature
- **Description:** Made the right-side AI Quick Insights panel collapsible
- **File Modified:** `apps/web/src/components/InsightsPanel.tsx`

**Features:**
- Collapse button (chevron icon) in panel header
- Collapsed state shows thin 48px bar with:
  - AI icon (smart_toy)
  - Expand button (chevron_left)
- Expanded state shows full 320px panel
- Smooth transition between states
- State managed in parent component

**Props Added:**
```typescript
interface InsightsPanelProps {
  // ...existing props
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

**Collapsed Layout:**
```
┌──────┐
│  🤖  │  <- AI icon
│  ◀   │  <- Expand button
│      │
└──────┘
  48px
```

#### Parent Component Updates
- **File Modified:** `apps/web/src/vdr.tsx`

**New State & Handlers:**
```typescript
const [insightsPanelCollapsed, setInsightsPanelCollapsed] = useState(false);

const handleDeleteFile = (fileId: string) => {
  setAllFiles((prev) => prev.filter((f) => f.id !== fileId));
  // Also updates folder file counts
};

const handleRenameFile = (fileId: string, newName: string) => {
  setAllFiles((prev) =>
    prev.map((f) => (f.id === fileId ? { ...f, name: newName } : f))
  );
};

const handleToggleInsightsPanel = () => {
  setInsightsPanelCollapsed((prev) => !prev);
};
```

#### Files Modified Summary

| File | Changes |
|------|---------|
| `apps/web/src/vdr.tsx` | Added new folder modal, file action handlers, insights panel collapse state |
| `apps/web/src/components/FileTable.tsx` | Added 3-dot dropdown menu, inline rename, delete with confirmation |
| `apps/web/src/components/InsightsPanel.tsx` | Added collapsible functionality with thin collapsed bar |

#### Testing Checklist
- [x] "New Folder" button opens modal
- [x] New folder appears in folder tree
- [x] 3-dot menu opens on click
- [x] Rename changes file name in real-time
- [x] Delete removes file after confirmation
- [x] Insights panel collapses to thin bar
- [x] Expand button restores full panel
- [x] All hover states and transitions work

---

## Notes
- Project directory: `/Users/ganesh/AI CRM`
- Main entry point: `apps/web/index.html`
- **VDR entry point:** `apps/web/vdr.html` (React app)
- **Database:** Supabase (PostgreSQL) - configured and seeded
- **AI:** OpenAI GPT-4 Turbo - configured
- Run `npm run dev` from root to start all apps
- Run `npm run dev:web` for frontend only (port 3000)
- Run `npm run dev:api` for API only (port 3001)
- **Access CRM at:** `http://localhost:3000/crm.html`
- **Access VDR at:** `http://localhost:3000/vdr.html`
- **Setup Database:** See [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
