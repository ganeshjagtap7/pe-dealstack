# Supabase Setup Checklist

Use this checklist to set up Supabase for your AI CRM. Check off each item as you complete it.

---

## Pre-Setup

- [ ] Node.js 18+ installed (`node --version`)
- [ ] Dependencies installed (`npm install`)
- [ ] Have a Supabase account ([sign up](https://supabase.com))

---

## Part 1: Create Supabase Project (5 min)

- [ ] Go to [app.supabase.com](https://app.supabase.com)
- [ ] Click **"New Project"** button
- [ ] Fill in project details:
  - [ ] Project Name: `AI CRM` (or your choice)
  - [ ] Database Password: Create strong password
  - [ ] **IMPORTANT**: Save password in secure location
  - [ ] Region: Select closest region
  - [ ] Plan: Free tier is fine for development
- [ ] Click **"Create new project"**
- [ ] Wait for provisioning (~2 minutes)
- [ ] Project shows "Healthy" status in dashboard

---

## Part 2: Get Database Credentials (3 min)

- [ ] In Supabase dashboard, go to **Settings** (gear icon)
- [ ] Click **Database** in left sidebar
- [ ] Scroll down to **Connection String** section

### Get Connection Pooling URL (for API)
- [ ] Select **"Connection Pooling"** mode from dropdown
- [ ] Ensure port shows **6543**
- [ ] Copy the URI (looks like: `postgresql://postgres.xxxxx:[YOUR-PASSWORD]@...pooler.supabase.com:6543/postgres`)
- [ ] Replace `[YOUR-PASSWORD]` with your actual database password
- [ ] Save this as your `DATABASE_URL`

### Get Direct Connection URL (for migrations)
- [ ] Select **"Session Mode"** or **"Direct Connection"** from dropdown
- [ ] Ensure port shows **5432**
- [ ] Copy the URI (looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`)
- [ ] Replace `[YOUR-PASSWORD]` with your actual database password
- [ ] Save this as your `DIRECT_URL`

---

## Part 3: Configure Environment Variables (2 min)

- [ ] Open file: `apps/api/.env`
- [ ] Update `DATABASE_URL` with connection pooling URL (port 6543)
- [ ] Update `DIRECT_URL` with direct connection URL (port 5432)
- [ ] Verify you replaced `[YOUR-PASSWORD]` placeholder with actual password
- [ ] Verify you replaced `[YOUR-PROJECT-REF]` with your project reference
- [ ] Save the file
- [ ] Confirm `.env` is in `.gitignore` (already done)

Example `.env`:
```env
DATABASE_URL="postgresql://postgres.abcdefgh:[MY-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[MY-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres"
PORT=3001
NODE_ENV=development
```

---

## Part 4: Initialize Database (3 min)

Run these commands from `apps/api` directory:

- [ ] Open terminal
- [ ] Navigate to API directory: `cd apps/api`
- [ ] Generate Prisma client: `npx prisma generate`
  - [ ] Output shows "Generated Prisma Client"
  - [ ] No errors displayed
- [ ] Create migration: `npx prisma migrate dev --name init`
  - [ ] Prompts for migration name (already provided: "init")
  - [ ] Output shows migration created successfully
  - [ ] Shows tables created: Company, Deal, Document, Activity
  - [ ] Shows enums created: DealStage, DealStatus, DocumentType, ActivityType
- [ ] Seed database: `npx tsx prisma/seed.ts`
  - [ ] Output shows "Seeding database..."
  - [ ] Output shows "✅ Database seeded successfully!"
  - [ ] Shows count: 4 companies, 4 deals, 4 documents, 2 activities

---

## Part 5: Verify Supabase Setup (2 min)

### Check Tables in Supabase Dashboard
- [ ] Go to Supabase Dashboard
- [ ] Click **"Table Editor"** in left sidebar
- [ ] Verify tables exist:
  - [ ] `Company` table visible
  - [ ] `Deal` table visible
  - [ ] `Document` table visible
  - [ ] `Activity` table visible
- [ ] Click on `Deal` table
- [ ] Verify 4 deals are shown:
  - [ ] Apex Logistics (DUE_DILIGENCE)
  - [ ] MediCare Plus (INITIAL_REVIEW)
  - [ ] Nebula Systems (IOI_SUBMITTED)
  - [ ] Titan Freight (PASSED)

### Check Data
- [ ] Click on `Company` table
- [ ] Verify 4 companies are shown
- [ ] Click on `Document` table
- [ ] Verify 4 documents are shown
- [ ] Click on `Activity` table
- [ ] Verify 2 activities are shown

---

## Part 6: Test API Connection (3 min)

### Start the API Server
- [ ] Open terminal in project root
- [ ] Start API: `npm run dev:api`
- [ ] Server starts without errors
- [ ] Output shows: `🚀 API server running at http://localhost:3001`

### Test Health Endpoint
- [ ] Open new terminal window
- [ ] Test health: `curl http://localhost:3001/health`
- [ ] Response shows:
  ```json
  {
    "status": "ok",
    "timestamp": "...",
    "database": "connected"
  }
  ```
- [ ] `database` field shows `"connected"` (not "disconnected")

### Test Deals Endpoint
- [ ] Test deals: `curl http://localhost:3001/api/deals`
- [ ] Response is JSON array
- [ ] Array contains 4 deals
- [ ] Each deal has:
  - [ ] `id` field
  - [ ] `name` field
  - [ ] `stage` field (e.g., "DUE_DILIGENCE")
  - [ ] `company` object with company data
  - [ ] Financial metrics (irrProjected, mom, ebitda, revenue)

### Test Companies Endpoint
- [ ] Test companies: `curl http://localhost:3001/api/companies`
- [ ] Response is JSON array
- [ ] Array contains 4 companies
- [ ] Each company includes `deals` array

---

## Part 7: Test Frontend (2 min)

### Start Frontend Server
- [ ] In new terminal, navigate to project root
- [ ] Start frontend: `npm run dev:web`
- [ ] Frontend starts without errors
- [ ] Note the port (usually 5173)

### Test Dynamic CRM Page
- [ ] Open browser
- [ ] Go to: `http://localhost:5173/crm-dynamic.html`
- [ ] Page loads without errors
- [ ] Header shows "4 Active Opportunities" (or 3 if Titan is passed)
- [ ] 4 deal cards are displayed:
  - [ ] Apex Logistics card
  - [ ] MediCare Plus card
  - [ ] Nebula Systems card
  - [ ] Titan Freight card
- [ ] Each card shows:
  - [ ] Company name
  - [ ] Industry
  - [ ] Stage badge
  - [ ] IRR percentage
  - [ ] MoM multiple
  - [ ] EBITDA and Revenue
  - [ ] AI thesis text
- [ ] No console errors in browser DevTools

---

## Part 8: Test CRUD Operations (Optional, 5 min)

### Create a New Deal
- [ ] Test create deal:
  ```bash
  curl -X POST http://localhost:3001/api/deals \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Deal",
      "companyName": "Test Company",
      "industry": "Technology",
      "stage": "INITIAL_REVIEW",
      "revenue": 25,
      "ebitda": 5,
      "irrProjected": 20,
      "mom": 2.5
    }'
  ```
- [ ] Response status is 201 (Created)
- [ ] Response contains new deal object with ID
- [ ] Copy the deal ID for next steps

### Get Single Deal
- [ ] Test get deal: `curl http://localhost:3001/api/deals/[DEAL-ID]`
- [ ] Response contains the deal you just created
- [ ] Includes company object
- [ ] Includes empty documents array
- [ ] Includes activities array with "Deal Created" activity

### Update Deal
- [ ] Test update:
  ```bash
  curl -X PATCH http://localhost:3001/api/deals/[DEAL-ID] \
    -H "Content-Type: application/json" \
    -d '{"stage": "DUE_DILIGENCE"}'
  ```
- [ ] Response shows updated stage
- [ ] Activity logged for stage change

### Verify in Supabase
- [ ] Go to Supabase Dashboard > Table Editor > Deal
- [ ] Refresh the table view
- [ ] New "Test Deal" appears in list
- [ ] Click on deal to see details
- [ ] Stage shows as updated

### Delete Deal (Cleanup)
- [ ] Test delete: `curl -X DELETE http://localhost:3001/api/deals/[DEAL-ID]`
- [ ] Response status is 204 (No Content)
- [ ] Verify in Supabase that deal is deleted
- [ ] Associated activities also deleted (cascade)

---

## Part 9: Explore Supabase Features (Optional, 10 min)

### SQL Editor
- [ ] Go to Supabase Dashboard
- [ ] Click **"SQL Editor"** in left sidebar
- [ ] Try running a query:
  ```sql
  SELECT d.name, d.stage, c.name as company_name
  FROM "Deal" d
  JOIN "Company" c ON d."companyId" = c.id
  WHERE d.status = 'ACTIVE'
  ORDER BY d."updatedAt" DESC;
  ```
- [ ] Results show active deals with company names

### Table Editor Features
- [ ] Click **"Table Editor"** > `Deal` table
- [ ] Click **"Insert row"** button
- [ ] Try adding a deal via UI
- [ ] Notice enum dropdowns for stage, status
- [ ] Cancel or save the test row

### Database Settings
- [ ] Go to **Settings** > **Database**
- [ ] Review connection details
- [ ] Check database version (PostgreSQL 15+)
- [ ] Review connection limits

### Logs
- [ ] Click **"Logs"** in left sidebar
- [ ] Select **"Postgres Logs"**
- [ ] See recent database queries
- [ ] Helpful for debugging

---

## Part 10: Production Preparation (Optional)

### Enable Row Level Security (when adding auth)
- [ ] Go to **Authentication** > **Policies**
- [ ] Review RLS documentation
- [ ] Plan access control policies

### Set Up Backups
- [ ] Go to **Settings** > **Database**
- [ ] Scroll to **Backup** section
- [ ] Daily backups enabled by default (Free tier: 7 days retention)
- [ ] Note backup schedule

### Review Usage
- [ ] Go to **Settings** > **Billing**
- [ ] Review current usage
- [ ] Check free tier limits (500 MB database, 2 GB bandwidth)
- [ ] Set up billing alerts if needed

---

## ✅ Setup Complete!

If you've checked all the boxes above, your Supabase migration is complete!

### What You Have Now

✅ Cloud-hosted PostgreSQL database
✅ Connection pooling for performance
✅ Type-safe enums and JSON fields
✅ Automatic daily backups
✅ Web dashboard for data management
✅ API connected and working
✅ Frontend displaying real data
✅ Sample data loaded

### Next Steps

Choose what to build next:
- [ ] Add user authentication (Supabase Auth)
- [ ] Implement file upload (Supabase Storage)
- [ ] Add real-time updates (Supabase Realtime)
- [ ] Create deal creation form
- [ ] Build analytics dashboard
- [ ] Add document AI processing
- [ ] Deploy to production

---

## Troubleshooting

If you encountered any issues, check:

- [ ] Review [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed instructions
- [ ] Check [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for troubleshooting tips
- [ ] Verify `.env` file has correct credentials
- [ ] Ensure Supabase project is "Healthy" in dashboard
- [ ] Check that all dependencies are installed (`npm install`)
- [ ] Verify Prisma client is generated (`npx prisma generate`)
- [ ] Look at API server logs for errors
- [ ] Check browser console for frontend errors
- [ ] Review Supabase Postgres logs for database errors

---

## Support

- **Documentation**: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- **Quick Start**: [QUICKSTART.md](QUICKSTART.md)
- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Supabase Discord**: [discord.supabase.com](https://discord.supabase.com)

---

**Congratulations on completing your Supabase setup! 🎉**
