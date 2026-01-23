# AI-Native Deal CRM

A modern, AI-powered CRM system for Private Equity firms to manage deal flow, track opportunities, and analyze investments with artificial intelligence.

> **⚡ Quick Start**: New to this project? Follow the [5-minute Quick Start Guide](QUICKSTART.md) to get up and running with Supabase!

## 📚 Documentation

| Guide | Description | Time |
|-------|-------------|------|
| [QUICKSTART.md](QUICKSTART.md) | Get started in 5 minutes | ⚡ 5 min |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Complete Supabase setup guide | 📖 15 min |
| [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) | Step-by-step setup checklist | ✅ 20 min |
| [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) | SQLite to Supabase migration | 🔄 Reference |
| [Architecture Diagram](docs/supabase-architecture.md) | System architecture | 🏗️ Reference |

## 🚀 Features

- **Deal Pipeline Management** - Track deals across all stages (Initial Review → Due Diligence → IOI → Closing)
- **AI-Powered Insights** - Automated analysis and thesis generation for each deal
- **Document Intelligence** - Upload and process CIMs, teasers, and financial documents
- **Real-time Dashboard** - Live metrics and KPIs for your portfolio
- **Company Database** - Centralized repository of all companies and their deals
- **Activity Tracking** - Comprehensive audit log of all deal activities

## 📁 Project Structure

```
ai-crm/
├── apps/
│   ├── web/                    # Frontend application
│   │   ├── index.html          # Landing page
│   │   ├── pricing.html        # Pricing page
│   │   ├── dashboard.html      # Dashboard (static)
│   │   ├── crm.html            # CRM page (static)
│   │   ├── crm-dynamic.html    # CRM page (dynamic - connects to API)
│   │   └── deal.html           # Deal intelligence page
│   └── api/                    # Backend API server
│       ├── src/
│       │   ├── index.ts        # Express server
│       │   ├── db.ts           # Prisma client
│       │   └── routes/
│       │       ├── deals.ts    # Deals API
│       │       └── companies.ts # Companies API
│       ├── prisma/
│       │   ├── schema.prisma   # Database schema
│       │   ├── seed.ts         # Seed data
│       │   └── dev.db          # SQLite database
│       └── package.json
├── packages/
│   ├── shared/                 # Shared types
│   └── ui/                     # UI components
├── PROGRESS.md                 # Detailed progress log
└── README.md                   # This file
```

## 🛠️ Tech Stack

**Frontend:**
- HTML5 + Vanilla JavaScript
- Tailwind CSS
- Material Symbols Icons
- Manrope Font

**Backend:**
- Node.js + Express
- TypeScript
- Prisma ORM (v5)
- Supabase (PostgreSQL)
- Zod (validation)

**Infrastructure:**
- Turborepo (monorepo)
- npm workspaces
- tsx (TypeScript runner)

## 📦 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd "AI CRM"
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase database:

   **Option A: Quick Setup (for existing Supabase project)**
   - Copy your Supabase credentials
   - Update `apps/api/.env` with your `DATABASE_URL` and `DIRECT_URL`
   - See `.env.example` for the format

   **Option B: First Time Setup**
   - Follow the complete guide: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
   - This includes creating a Supabase project and getting credentials

4. Run database migrations:
```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

## 🚀 Running the Application

### Start Everything (Recommended)
```bash
npm run dev
```

### Start Frontend Only
```bash
npm run dev:web
```

### Start API Only
```bash
npm run dev:api
```

The application will be available at:
- **Frontend:** http://localhost:5173 (or check terminal output)
- **API:** http://localhost:3001
- **API Health:** http://localhost:3001/health

## 🎯 Quick Start Guide

1. **View Static Pages:**
   - Landing page: Open `apps/web/index.html`
   - CRM: Open `apps/web/crm.html`
   - Dashboard: Open `apps/web/dashboard.html`

2. **View Dynamic CRM with Real Data:**
   - Start the API: `cd apps/api && npm run dev`
   - Open `apps/web/crm-dynamic.html` in your browser
   - The page will fetch deals from the API

3. **Test API Endpoints:**
```bash
# Health check
curl http://localhost:3001/health

# Get all deals
curl http://localhost:3001/api/deals

# Get single deal
curl http://localhost:3001/api/deals/:id

# Get all companies
curl http://localhost:3001/api/companies
```

## 📊 API Documentation

### Deals Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deals` | Get all deals (supports filters: stage, status, industry) |
| GET | `/api/deals/:id` | Get single deal with related data |
| POST | `/api/deals` | Create new deal |
| PATCH | `/api/deals/:id` | Update deal |
| DELETE | `/api/deals/:id` | Delete deal |
| GET | `/api/deals/stats/summary` | Get deal statistics |

### Companies Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies` | Get all companies |
| GET | `/api/companies/:id` | Get single company with deals |
| POST | `/api/companies` | Create new company |
| PATCH | `/api/companies/:id` | Update company |
| DELETE | `/api/companies/:id` | Delete company |

### Example Request

**Create a new deal:**
```bash
curl -X POST http://localhost:3001/api/deals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Deal",
    "companyName": "Acme Corp",
    "industry": "SaaS",
    "stage": "INITIAL_REVIEW",
    "revenue": 100,
    "ebitda": 20,
    "irrProjected": 25.5,
    "mom": 3.2
  }'
```

## 📝 Database Schema

### Deal
- Financial metrics: IRR, MoM, EBITDA, Revenue
- Stage tracking: Initial Review → Closing
- AI-generated thesis
- Related documents and activities

### Company
- Company information
- Industry classification
- Website and description
- Multiple deals per company

### Document
- File metadata
- AI-extracted data
- Confidence scores
- Linked to deals

### Activity
- Audit trail
- Stage changes
- Document uploads
- User actions

## 🎨 Design System

**Colors:**
- Primary (Banker Blue): `#1a3b5d`
- Primary Hover: `#132c45`
- Background: `#f8fafc`
- Text Main: `#0f172a`
- Text Muted: `#64748b`

**Typography:**
- Font Family: Manrope
- Weights: 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold)

## 🔧 Development

### Add New API Route

1. Create route file in `apps/api/src/routes/`
2. Import and register in `apps/api/src/index.ts`
3. Add validation with Zod

### Update Database Schema

1. Edit `apps/api/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <migration-name>`
3. Run `npx prisma generate`
4. Update seed data if needed

### Add New Frontend Page

1. Create HTML file in `apps/web/`
2. Use Tailwind CSS classes
3. Follow existing design system
4. Link to API if needed

## 📈 Seed Data

The database comes pre-seeded with:
- 4 Sample companies (Apex Logistics, MediCare Plus, Nebula Systems, Titan Freight)
- 4 Deals with full financial metrics
- 4 Documents
- 2 Activity logs

To reset and reseed (Supabase):
```bash
cd apps/api
npx prisma migrate reset
npx tsx prisma/seed.ts
```

**Note**: `prisma migrate reset` will drop all tables and recreate them. Use with caution in production.

## 🚧 Roadmap

- [ ] Convert to React/Next.js
- [ ] Add authentication (Auth0/Clerk)
- [ ] Implement file upload with S3
- [ ] Add AI document processing
- [ ] Build analytics dashboard
- [ ] Add real-time updates (WebSockets)
- [ ] Migrate to PostgreSQL
- [ ] Deploy to production
- [ ] Mobile app

## 📄 License

Private and confidential.

## 👥 Team

Built for Private Equity professionals.

---

**Last Updated:** January 23, 2026
