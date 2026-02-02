# Supabase Setup Guide

This guide will help you set up Supabase as the database for your AI CRM.

## Prerequisites

- A Supabase account (sign up at [supabase.com](https://supabase.com))
- Node.js and npm installed
- Project dependencies installed (`npm install`)

## Step 1: Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in the details:
   - **Project Name**: `AI CRM` (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest region to your users
   - **Pricing Plan**: Free tier is sufficient for development
4. Click "Create new project"
5. Wait for the project to be provisioned (~2 minutes)

## Step 2: Get Your Database Credentials

1. In your Supabase project dashboard, go to **Settings** > **Database**
2. Scroll down to **Connection String** section
3. You'll need two URLs:

### Connection Pooling URL (for API)
- Select **"Connection Pooling"** mode
- Use port **6543**
- Copy the URI, it looks like:
  ```
  postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
  ```

### Direct Connection URL (for migrations)
- Select **"Session Mode"** or **"Direct Connection"**
- Use port **5432**
- Copy the URI, it looks like:
  ```
  postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
  ```

**IMPORTANT**: Replace `[YOUR-PASSWORD]` in both URLs with the actual database password you created in Step 1.

## Step 3: Get Your API Keys (Optional)

If you want to use Supabase's additional features (auth, storage, etc.):

1. Go to **Settings** > **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: Long JWT token

## Step 4: Configure Environment Variables

1. Open `/Users/ganesh/AI CRM/apps/api/.env`
2. Replace the placeholder values with your actual credentials:

```env
# Connection pooling URL (from Step 2)
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"

# Direct connection URL (from Step 2)
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"

# Optional: Supabase API credentials (from Step 3)
SUPABASE_URL="https://xxxxx.supabase.co"
SUPABASE_ANON_KEY="your-anon-key-here"

PORT=3001
NODE_ENV=development
```

## Step 5: Run Database Migrations

Now that your credentials are configured, run the migrations to create the database schema:

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init
```

This will:
- Generate the Prisma client
- Create all tables (Company, Deal, Document, Activity)
- Create enums (DealStage, DealStatus, DocumentType, ActivityType)
- Add indexes for performance

## Step 6: Seed the Database

Populate your database with sample data:

```bash
npx tsx prisma/seed.ts
```

This will create:
- 4 sample companies
- 4 deals with financial metrics
- 4 documents
- 2 activity logs

## Step 7: Verify the Setup

1. Start the API server:
   ```bash
   npm run dev
   ```

2. Test the health endpoint:
   ```bash
   curl http://localhost:3001/health
   ```

   You should see:
   ```json
   {
     "status": "ok",
     "timestamp": "2026-01-24T...",
     "database": "connected"
   }
   ```

3. Test the deals endpoint:
   ```bash
   curl http://localhost:3001/api/deals
   ```

   You should see the 4 seeded deals in JSON format.

## Step 8: View Your Data in Supabase

1. Go to your Supabase project dashboard
2. Click on **Table Editor** in the left sidebar
3. You should see your tables: `Company`, `Deal`, `Document`, `Activity`
4. Click on any table to view the seeded data

## Troubleshooting

### Error: "Can't reach database server"
- Check that your `DATABASE_URL` and `DIRECT_URL` are correct
- Verify you replaced `[YOUR-PASSWORD]` with your actual password
- Make sure there are no spaces or special characters that need escaping

### Error: "Authentication failed"
- Double-check your database password
- Try resetting your database password in Supabase Settings > Database

### Error: "Migration failed"
- Make sure you're using `DIRECT_URL` (port 5432) for migrations
- Check that the `directUrl` field is set in `schema.prisma`

### Connection Pooling vs Direct Connection
- **Connection Pooling (port 6543)**: Use for API requests - handles many concurrent connections
- **Direct Connection (port 5432)**: Use for migrations and administrative tasks

## Security Best Practices

1. **Never commit `.env` file to git**
   - The `.env` file is already in `.gitignore`
   - Use `.env.example` to document required variables

2. **Use Row Level Security (RLS)**
   - Go to Supabase > Authentication > Policies
   - Enable RLS on tables when you add authentication

3. **Rotate credentials regularly**
   - Reset your database password periodically
   - Update the `.env` file when you do

4. **Use environment-specific projects**
   - Create separate Supabase projects for development, staging, and production
   - Never use production credentials in development

## Next Steps

Now that Supabase is set up, you can:

1. **Add authentication**: Use Supabase Auth for user management
2. **Enable storage**: Upload CIMs and documents to Supabase Storage
3. **Use real-time**: Subscribe to database changes with Supabase Realtime
4. **Add API security**: Implement Row Level Security policies
5. **Monitor usage**: Check Supabase dashboard for usage metrics

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Prisma with Supabase](https://www.prisma.io/docs/guides/database/supabase)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)

---

**Need help?** Check the [Supabase Discord](https://discord.supabase.com) or [Prisma Discord](https://pris.ly/discord)
