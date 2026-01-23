# Migration Guide: SQLite to Supabase

This guide will help you migrate your AI CRM from SQLite to Supabase (PostgreSQL).

## What Changed

### Database Provider
- **Before**: SQLite (file-based, local database)
- **After**: Supabase PostgreSQL (cloud-hosted, production-ready)

### Schema Improvements
- **Enums**: Now using native PostgreSQL enums instead of strings
  - `DealStage`, `DealStatus`, `DocumentType`, `ActivityType`
- **JSON Types**: `extractedData` and `metadata` now use proper JSON columns
- **Indexes**: Added database indexes for better query performance
- **Connection Pooling**: Using pgBouncer for efficient connection management

## Prerequisites

Before starting the migration, ensure you have:

1. ✅ A Supabase account and project created
2. ✅ Your Supabase connection credentials ready
3. ✅ All dependencies installed (`npm install`)
4. ✅ A backup of your current SQLite database (if you have important data)

## Migration Steps

### Step 1: Update Environment Variables

1. Open `apps/api/.env`
2. Replace the SQLite connection string with your Supabase credentials:

```env
# OLD (SQLite)
DATABASE_URL="file:./prisma/dev.db"

# NEW (Supabase)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres"
```

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed instructions on getting these URLs.

### Step 2: Generate Prisma Client

Generate the new Prisma client for PostgreSQL:

```bash
cd apps/api
npx prisma generate
```

This creates TypeScript types that match the new schema with enums.

### Step 3: Create Database Schema

Run the migration to create all tables in Supabase:

```bash
npx prisma migrate dev --name init
```

This will:
- Create the `Company`, `Deal`, `Document`, and `Activity` tables
- Create all enums (`DealStage`, `DealStatus`, etc.)
- Add indexes for performance
- Set up foreign key relationships

### Step 4: Seed Sample Data

Populate your Supabase database with sample data:

```bash
npx tsx prisma/seed.ts
```

This creates the same 4 companies and deals you had before.

### Step 5: Verify Migration

1. **Check Supabase Dashboard**
   - Go to your Supabase project
   - Click "Table Editor"
   - Verify all tables and data are present

2. **Test API Health**
   ```bash
   # Start the API server
   npm run dev

   # In another terminal, test the health endpoint
   curl http://localhost:3001/health
   ```

   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-01-24T...",
     "database": "connected"
   }
   ```

3. **Test Deals Endpoint**
   ```bash
   curl http://localhost:3001/api/deals
   ```

   Should return all 4 seeded deals with company information.

### Step 6: Update Frontend (If Needed)

The frontend should work without changes, but verify:

1. Open [http://localhost:5173/crm-dynamic.html](http://localhost:5173/crm-dynamic.html)
2. Verify deals are loading from the API
3. Check that all metrics display correctly

## Code Changes Summary

### Prisma Schema (`schema.prisma`)

**Before (SQLite)**:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Deal {
  stage  String @default("INITIAL_REVIEW")
  status String @default("ACTIVE")
}

model Document {
  extractedData String? // Had to use String
}
```

**After (PostgreSQL)**:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum DealStage {
  INITIAL_REVIEW
  DUE_DILIGENCE
  // ...
}

model Deal {
  stage  DealStage  @default(INITIAL_REVIEW)
  status DealStatus @default(ACTIVE)

  @@index([stage])
  @@index([status])
}

model Document {
  extractedData Json? // Proper JSON type
}
```

### Routes (`deals.ts`, `companies.ts`)

No code changes needed! The routes automatically work with the new enum types thanks to Prisma's TypeScript generation.

## Data Migration (Optional)

If you have existing data in SQLite that you want to migrate:

### Option 1: Manual Export/Import

1. **Export from SQLite**:
   ```bash
   # Export companies
   sqlite3 apps/api/prisma/dev.db "SELECT * FROM Company;" -csv > companies.csv

   # Export deals
   sqlite3 apps/api/prisma/dev.db "SELECT * FROM Deal;" -csv > deals.csv
   ```

2. **Import to Supabase**:
   - Go to Supabase Dashboard > Table Editor
   - Select the table
   - Click "Insert" > "Import data from CSV"

### Option 2: Using Prisma

Create a migration script:

```typescript
// migrate-data.ts
import { PrismaClient as SQLiteClient } from '@prisma/client';
import { PrismaClient as PostgresClient } from '@prisma/client';

const sqlite = new SQLiteClient({
  datasources: { db: { url: 'file:./prisma/dev.db' } }
});

const postgres = new PostgresClient(); // Uses DATABASE_URL from .env

async function migrate() {
  // Get all data from SQLite
  const companies = await sqlite.company.findMany();
  const deals = await sqlite.deal.findMany();
  const documents = await sqlite.document.findMany();
  const activities = await sqlite.activity.findMany();

  // Insert into PostgreSQL
  for (const company of companies) {
    await postgres.company.create({ data: company });
  }

  // ... repeat for other models

  console.log('Migration complete!');
}

migrate().finally(async () => {
  await sqlite.$disconnect();
  await postgres.$disconnect();
});
```

## Rollback Plan

If you need to revert to SQLite:

1. **Restore `.env`**:
   ```env
   DATABASE_URL="file:./prisma/dev.db"
   ```

2. **Restore `schema.prisma`**:
   - Change `provider = "postgresql"` to `provider = "sqlite"`
   - Remove `directUrl` line
   - Replace enums with strings
   - Remove JSON types (use String)

3. **Regenerate Prisma client**:
   ```bash
   npx prisma generate
   ```

4. **Restart the server**:
   ```bash
   npm run dev
   ```

## Benefits of Supabase

Now that you're using Supabase, you get:

### Performance
- **Connection Pooling**: Handles thousands of concurrent connections
- **Database Indexes**: Faster queries on common lookups
- **CDN Distribution**: Low-latency worldwide

### Scalability
- **Auto-scaling**: Database grows with your data
- **Read Replicas**: Can add replicas for read-heavy workloads
- **Point-in-time Recovery**: Restore to any point in the last 7 days

### Developer Experience
- **Web Dashboard**: Visual table editor and SQL runner
- **Real-time Subscriptions**: Listen to database changes
- **Built-in Auth**: Add user authentication easily
- **Storage**: Upload and serve files (CIMs, documents)

### Production Ready
- **Daily Backups**: Automatic backups included
- **SSL Connections**: Encrypted database connections
- **Row Level Security**: Fine-grained access control
- **Monitoring**: Query performance and usage metrics

## Next Steps

Now that you're on Supabase:

1. **Enable Row Level Security**
   - Protect your data with access policies
   - Go to Supabase > Authentication > Policies

2. **Add Authentication**
   - Use Supabase Auth for user login
   - Implement role-based access (analysts, partners, admins)

3. **Set Up Storage**
   - Upload CIMs and documents to Supabase Storage
   - Update Document model to use storage URLs

4. **Add Real-time Features**
   - Subscribe to deal updates
   - Show live notifications when deals change

5. **Monitor Performance**
   - Check query performance in Supabase dashboard
   - Optimize slow queries with indexes

## Troubleshooting

### "Cannot find module '@prisma/client'"
Run: `npx prisma generate`

### "Type 'string' is not assignable to type 'DealStage'"
The code is trying to use string values instead of enum values. Update to:
```typescript
// Before
stage: "INITIAL_REVIEW"

// After
stage: "INITIAL_REVIEW" as DealStage
// Or simply
stage: "INITIAL_REVIEW" // TypeScript will infer the enum
```

### "Connection timed out"
- Check your Supabase project is running
- Verify DATABASE_URL is correct
- Try the direct connection URL instead of pooler

### "Migration failed: relation already exists"
The table already exists. Either:
- Drop all tables in Supabase dashboard
- Use `npx prisma migrate reset` (⚠️ deletes all data)
- Create a new Supabase project

## Support

- [Supabase Docs](https://supabase.com/docs)
- [Prisma Docs](https://www.prisma.io/docs)
- [GitHub Issues](https://github.com/your-repo/issues)

---

**Need help?** Check [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for detailed setup instructions.
