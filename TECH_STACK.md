# PE OS - Complete Tech Stack

## Project Architecture

### Monorepo Structure
```
ai-crm/
├── apps/
│   ├── web/              # Frontend application
│   └── api/              # Backend API server
├── packages/
│   ├── shared/           # Shared types & utilities
│   └── ui/               # UI component library
├── package.json          # Root workspace config
└── turbo.json            # Build orchestration
```

**Monorepo Tool:** Turborepo v2.0.0
**Package Manager:** npm v10.0.0 with workspaces
**Node Version:** >=18.0.0

---

## Frontend Stack (`apps/web/`)

### Core Framework
- **React:** v18.3.0
- **React DOM:** v18.3.0
- **TypeScript:** v5.3.0

### Build Tool & Dev Server
- **Vite:** v5.0.0 (fast HMR, optimized builds)
- **@vitejs/plugin-react:** v4.2.0

### Routing
- **React Router DOM:** v6.20.0

### Styling
- **Tailwind CSS:** v3.4.0 (utility-first CSS)
- **PostCSS:** v8.4.32
- **Autoprefixer:** v10.4.16

### Type Definitions
- **@types/react:** v18.3.0
- **@types/react-dom:** v18.3.0

### Current State
- ✅ 5 complete HTML pages (index, pricing, dashboard, crm, deal)
- ⚠️ **Not yet converted to React components**
- ✅ Responsive design with Tailwind
- ✅ Dark mode support (on landing page)

---

## Backend Stack (`apps/api/`)

### Core Framework
- **Express.js:** v4.18.2 (Node.js web framework)
- **TypeScript:** v5.3.0
- **Node.js:** ESM modules (type: "module")

### Development
- **tsx:** v4.6.0 (TypeScript runner with watch mode)
- **dotenv:** v16.3.1 (environment variables)

### Middleware
- **CORS:** v2.8.5 (cross-origin resource sharing)

### Validation
- **Zod:** v3.22.4 (TypeScript-first schema validation)

### Type Definitions
- **@types/express:** v4.17.21
- **@types/cors:** v2.8.17
- **@types/node:** v20.10.0

### Current State
- ✅ Basic Express server setup
- ❌ **No API endpoints implemented**
- ❌ **No database connection**
- ❌ **No authentication**

---

## Shared Packages

### UI Component Library (`packages/ui/`)

#### Styling Utilities
- **class-variance-authority (CVA):** v0.7.0 (component variants)
- **clsx:** v2.0.0 (conditional classnames)
- **tailwind-merge:** v2.1.0 (merge Tailwind classes)

#### CSS Processing
- **Tailwind CSS:** v3.4.0
- **PostCSS:** v8.4.32
- **postcss-cli:** v11.0.0
- **Autoprefixer:** v10.4.16

#### Build
- **TypeScript:** v5.3.0
- **React:** v18.3.0 (peer dependency)

**Exports:**
- `@ai-crm/ui` - Component library
- `@ai-crm/ui/styles.css` - Styles

---

### Shared Types & Utils (`packages/shared/`)

#### Core
- **TypeScript:** v5.3.0
- ESM modules

#### Current Types
```typescript
// User, Deal, Contact types
// Utility functions
```

**Exports:**
- `@ai-crm/shared` - Types and utilities

---

## Scripts

### Root Level
```bash
npm run dev          # Run all apps with Turborepo
npm run build        # Build all apps
npm run lint         # Lint all apps
npm run clean        # Clean all dist folders

npm run dev:web      # Run frontend only
npm run dev:api      # Run backend only
```

### App Level
```bash
# Frontend (apps/web)
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview production build

# Backend (apps/api)
npm run dev          # tsx watch mode
npm run build        # Compile TypeScript
npm run start        # Run compiled JS
```

---

## NOT Yet Implemented (Future Stack)

### Database Layer
**Planned:**
- PostgreSQL or MongoDB
- Prisma ORM (type-safe database client)
- Database migrations

**Considerations:**
- PostgreSQL: Structured financial data, complex queries
- MongoDB: Flexible document storage
- Need: Multi-tenancy isolation for PE firms

---

### Authentication
**Planned Options:**
- Auth0 (enterprise SSO)
- Clerk (modern auth UI)
- NextAuth.js (self-hosted)
- Supabase Auth

**Requirements:**
- Role-based access (analyst, associate, partner, admin)
- SSO for enterprise clients
- MFA for security compliance

---

### File Storage
**Planned:**
- AWS S3 or similar (CIMs, teasers, Excel models)
- Signed URLs for secure access
- Virus scanning (ClamAV)
- Metadata storage (file name, size, upload date)

---

### AI/ML Stack
**Planned:**

#### LLM APIs
- OpenAI GPT-4o (document extraction, thesis generation)
- Anthropic Claude (alternative for financial analysis)

#### Document Processing
- **PDF Parsing:**
  - pdf-parse or pdf.js
  - GPT-4o Vision API (for tables/charts)
  - Camelot or Tabula (table extraction)
- **Excel Parsing:**
  - xlsx or exceljs

#### Vector Database (RAG System)
**Options:**
- Pinecone (managed, easy)
- Weaviate (open-source, self-hosted)
- Qdrant (Rust-based, fast)
- pgvector (PostgreSQL extension)

#### Embeddings
- OpenAI text-embedding-3-large
- Cohere embeddings (alternative)

#### RAG Libraries
- LangChain or LlamaIndex
- Custom implementation

---

### Real-time & WebSockets
**Planned:**
- Socket.io or native WebSockets
- Server-Sent Events (SSE)
- Use case: Live document processing status

---

### Background Jobs
**Planned:**
- BullMQ (Redis-based queue)
- Use case: AI document processing (30-60 sec jobs)

---

### Monitoring & Logging
**Planned:**
- Sentry (error tracking)
- LogRocket or Datadog (session replay)
- Winston or Pino (structured logging)

---

### Testing (Not Set Up Yet)
**Planned:**
- **Unit Tests:** Vitest (Vite-native)
- **E2E Tests:** Playwright or Cypress
- **API Tests:** Supertest

---

### Deployment (Not Configured)
**Planned:**
- **Frontend:** Vercel or Netlify
- **Backend:** Railway, Render, or AWS ECS
- **Database:** Supabase, PlanetScale, or RDS
- **CDN:** Cloudflare

---

## Design System

### Typography
- **Primary Font:** Inter (dashboard)
- **Secondary Font:** Manrope (CRM/deals)
- **Code Font:** Noto Sans

### Color Palette

#### Landing/Pricing Pages
- Primary: `#1269e2` (Blue)
- Background: `#f8fafc` (Slate 50)
- Border: `#e2e8f0` (Slate 200)

#### Dashboard
- Primary: `#003366` (Banker Blue)
- Secondary: `#059669` (Emerald Green)
- Background: `#F8F9FA` (Light Gray)

#### CRM/Deals
- Primary: `#1e293b` (Slate 800 - Deep Navy)
- Primary Hover: `#0f172a` (Slate 900)
- Background: `#f8fafc` (Slate 50)
- Text Main: `#0f172a` (Slate 900)
- Text Muted: `#64748b` (Slate 500)

### UI Components
- Cards with shadows and hover effects
- Badges for stages/statuses
- Glass panels (deal page)
- Material Symbols icons
- Custom scrollbar styling

---

## Dependencies Summary

### Production Dependencies
```json
{
  // Frontend
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "react-router-dom": "^6.20.0",

  // Backend
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "zod": "^3.22.4",

  // UI Library
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.0.0",
  "tailwind-merge": "^2.1.0"
}
```

### Dev Dependencies
```json
{
  // Build Tools
  "vite": "^5.0.0",
  "turbo": "^2.0.0",
  "typescript": "^5.3.0",
  "tsx": "^4.6.0",

  // CSS Processing
  "tailwindcss": "^3.4.0",
  "postcss": "^8.4.32",
  "autoprefixer": "^10.4.16",

  // Type Definitions
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@types/express": "^4.17.21",
  "@types/node": "^20.10.0"
}
```

---

## Key Technical Decisions Needed

### 1. Database Choice
- [ ] PostgreSQL (structured data, complex queries)
- [ ] MongoDB (flexible documents)
- [ ] Hybrid (Postgres + MongoDB)

### 2. Vector DB for RAG
- [ ] Pinecone (managed, $70+/mo)
- [ ] Weaviate (self-hosted, complex)
- [ ] Qdrant (fast, Rust-based)
- [ ] pgvector (PostgreSQL extension, cost-effective)

### 3. Authentication Provider
- [ ] Auth0 (enterprise, expensive)
- [ ] Clerk (modern, $25/mo)
- [ ] Supabase Auth (open-source, cheap)
- [ ] Custom with Passport.js

### 4. LLM Provider
- [ ] OpenAI (GPT-4o, industry standard)
- [ ] Anthropic (Claude, better for long docs)
- [ ] Both (use cases: GPT for extraction, Claude for analysis)

### 5. File Storage
- [ ] AWS S3 (standard, cheap)
- [ ] Cloudflare R2 (S3-compatible, cheaper egress)
- [ ] Supabase Storage (integrated with auth)

---

## Next Steps

### Phase 1: Foundation
1. Set up PostgreSQL + Prisma
2. Implement authentication
3. Convert HTML to React components
4. Create API endpoints (CRUD for deals)

### Phase 2: AI Integration
5. Document upload + S3 storage
6. PDF/Excel parsing
7. GPT-4o integration for data extraction
8. Investment thesis generation

### Phase 3: RAG System
9. Vector DB setup
10. Document chunking + embeddings
11. Chat interface with citations
12. Context management

---

## Performance Targets

- **Frontend Load Time:** < 2s (Lighthouse 90+)
- **API Response Time:** < 200ms (95th percentile)
- **Document Processing:** < 60s (AI ingestion)
- **Chat Response:** < 3s (RAG query)

---

## Security Requirements

- [ ] HTTPS everywhere (TLS 1.3)
- [ ] JWT tokens with short expiry
- [ ] Rate limiting on API
- [ ] Input validation (Zod schemas)
- [ ] SQL injection prevention (Prisma ORM)
- [ ] XSS protection (React escaping)
- [ ] File upload virus scanning
- [ ] Data encryption at rest (AES-256)
- [ ] Multi-tenancy isolation (row-level security)
- [ ] Audit logs for compliance (SOC2)

---

## Cost Estimates (Future)

### Monthly Operating Costs (@ 50 users)
- **Hosting:** $200-300 (Vercel + Railway)
- **Database:** $50-100 (PlanetScale or RDS)
- **Vector DB:** $70-200 (Pinecone or self-hosted)
- **LLM API:** $500-1000 (GPT-4o usage)
- **Auth:** $25-100 (Clerk or Auth0)
- **Storage:** $20-50 (S3)
- **Monitoring:** $50 (Sentry)

**Total:** ~$915-1,700/month

**Revenue (50 firms @ $30K avg):** $125K/month
**Gross Margin:** ~98%

---

## Tech Stack Diagram

```
┌─────────────────────────────────────────────────────────┐
│                       Frontend                          │
│  React + TypeScript + Vite + Tailwind + React Router   │
│                    (apps/web/)                          │
└────────────────────┬────────────────────────────────────┘
                     │ REST API
┌────────────────────▼────────────────────────────────────┐
│                      Backend API                        │
│        Express + TypeScript + Zod + CORS                │
│                    (apps/api/)                          │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┘
   │          │          │          │          │
   ▼          ▼          ▼          ▼          ▼
┌──────┐  ┌────────┐ ┌─────────┐ ┌───────┐ ┌──────────┐
│ Postgres│ S3     │ │Vector DB│ │GPT-4o │ │ Auth0/   │
│ Prisma│ │Storage │ │(Pinecone)│ API   │ │  Clerk   │
└──────┘  └────────┘ └─────────┘ └───────┘ └──────────┘
```

---

This is the complete tech stack overview for PE OS as of January 22, 2026.
