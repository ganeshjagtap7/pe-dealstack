# Quick Start Guide - AI CRM with Supabase

Get your AI CRM up and running in 5 minutes.

## ⚡ Prerequisites

- Node.js 18+ installed
- A Supabase account ([sign up free](https://supabase.com))

## 🚀 Setup Steps

### 1. Clone and Install

```bash
git clone <repository-url>
cd "AI CRM"
npm install
```

### 2. Create Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **"New Project"**
3. Enter:
   - Name: `AI CRM`
   - Password: (create a strong password - **save this!**)
   - Region: (choose closest to you)
4. Click **"Create new project"**
5. Wait ~2 minutes for provisioning

### 3. Get Database Credentials

1. In Supabase dashboard: **Settings** > **Database**
2. Scroll to **Connection String**
3. Copy both URLs:

   **Connection Pooling** (port 6543):
   ```
   postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

   **Direct Connection** (port 5432):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```

### 4. Configure Environment

1. Open `apps/api/.env`
2. Replace placeholder values:

```env
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"
PORT=3001
NODE_ENV=development
```

**Important**: Replace `[YOUR-PASSWORD]` with your actual database password!

### 5. Initialize Database

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
npx tsx prisma/seed.ts
```

This will:
- ✅ Generate Prisma client
- ✅ Create all tables in Supabase
- ✅ Seed with 4 sample companies and deals

### 6. Start the Application

From the root directory:

```bash
cd ..  # Back to root if you're in apps/api
npm run dev
```

This starts both:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001

### 7. Verify It Works

**Test API**:
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","database":"connected"}

curl http://localhost:3001/api/deals
# Should return: Array of 4 deals
```

**Test Frontend**:
1. Open http://localhost:5173/crm-dynamic.html
2. You should see 4 deals loaded from Supabase

**View in Supabase**:
1. Go to Supabase Dashboard > **Table Editor**
2. Click on `Deal` table
3. You should see 4 deals with all data

## ✅ You're Ready!

Your AI CRM is now running with Supabase. You have:

- ✅ PostgreSQL database in the cloud
- ✅ REST API with CRUD operations
- ✅ Frontend connected to real data
- ✅ Sample data to explore

## 📚 Next Steps

### Explore the Application

- **Landing Page**: http://localhost:5173/index.html
- **CRM Dashboard**: http://localhost:5173/crm-dynamic.html
- **Deal Intelligence**: http://localhost:5173/deal.html
- **VDR (Virtual Data Room)**: http://localhost:5173/vdr.html

### API Endpoints

Try these commands:

```bash
# Get all deals
curl http://localhost:3001/api/deals

# Get single deal
curl http://localhost:3001/api/deals/<deal-id>

# Get all companies
curl http://localhost:3001/api/companies

# Get deal statistics
curl http://localhost:3001/api/deals/stats/summary

# Create a new deal
curl -X POST http://localhost:3001/api/deals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Deal",
    "companyName": "Acme Corp",
    "industry": "SaaS",
    "stage": "INITIAL_REVIEW",
    "revenue": 50,
    "ebitda": 10,
    "irrProjected": 22.5,
    "mom": 2.8
  }'
```

### Learn More

- **Full Setup Guide**: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- **Migration Guide**: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- **API Documentation**: See [README.md](README.md#-api-documentation)
- **Tech Stack**: [TECH_STACK.md](TECH_STACK.md)

## 🐛 Troubleshooting

### "Can't reach database server"
- ✅ Check your `DATABASE_URL` is correct
- ✅ Verify you replaced `[YOUR-PASSWORD]` with actual password
- ✅ Ensure Supabase project is active (check dashboard)

### "Migration failed"
- ✅ Use `DIRECT_URL` (port 5432) for migrations
- ✅ Make sure you ran `npx prisma generate` first

### "Module not found: @prisma/client"
- ✅ Run: `cd apps/api && npx prisma generate`

### Frontend shows "Failed to fetch deals"
- ✅ Check API is running: `curl http://localhost:3001/health`
- ✅ Check browser console for CORS errors
- ✅ Verify data exists: `curl http://localhost:3001/api/deals`

## 💡 Pro Tips

### Use Supabase Dashboard

The Supabase dashboard is incredibly powerful:
- **Table Editor**: View and edit data visually
- **SQL Editor**: Run custom queries
- **Logs**: Debug API calls and errors
- **Database**: Monitor connections and performance

### Connection Pooling

- **Port 6543** (pooler): Use for API requests - handles many connections
- **Port 5432** (direct): Use for migrations and admin tasks

### Development Workflow

```bash
# Make schema changes
vim apps/api/prisma/schema.prisma

# Create migration
cd apps/api
npx prisma migrate dev --name your_change_name

# Regenerate client
npx prisma generate

# Restart API
npm run dev:api
```

## 🎯 Common Tasks

### Add New Field to Deal

1. Edit `apps/api/prisma/schema.prisma`:
   ```prisma
   model Deal {
     // ... existing fields
     newField String? // Add this
   }
   ```

2. Create migration:
   ```bash
   cd apps/api
   npx prisma migrate dev --name add_new_field
   ```

3. Update seed data (optional):
   ```typescript
   // apps/api/prisma/seed.ts
   await prisma.deal.create({
     data: {
       // ... existing fields
       newField: "value",
     }
   })
   ```

### View Logs in Real-time

```bash
# API logs
cd apps/api
npm run dev

# Supabase logs
# Go to Supabase Dashboard > Logs > Postgres Logs
```

### Reset Database

```bash
cd apps/api
npx prisma migrate reset  # ⚠️ Deletes all data!
npx tsx prisma/seed.ts    # Re-seed sample data
```

## 🤝 Need Help?

- **Documentation**: Check [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed info
- **Supabase Discord**: [discord.supabase.com](https://discord.supabase.com)
- **Prisma Discord**: [pris.ly/discord](https://pris.ly/discord)
- **GitHub Issues**: Open an issue in this repo

---

**Happy Building! 🚀**
