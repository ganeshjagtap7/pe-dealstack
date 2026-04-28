# Supabase Migration Instructions

## How to Run the Financial Statement Migration

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **"New Query"**

### Step 2: Run the Migration
1. Copy the contents of `apps/api/financial-statement-migration.sql`
2. Paste it into the SQL Editor
3. Click **"Run"** or press `Cmd+Enter` (Mac) / `Ctrl+Enter` (Windows)

### Step 3: Verify the Migration
Run this query to verify the columns were added:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'FinancialStatement'
  AND column_name IN ('isActive', 'mergeStatus')
ORDER BY column_name;
```

Expected output:
```
column_name  | data_type | is_nullable
-------------+-----------+-------------
isActive     | boolean   | YES
mergeStatus  | text      | YES
```

### Step 4: Verify Indexes
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'FinancialStatement'
  AND indexname LIKE '%is_active%';
```

### What This Migration Does:
- Creates `FinancialStatement` table if it doesn't exist
- Adds `isActive` column (boolean, default true) for multi-document conflict resolution
- Adds `mergeStatus` column (text, default 'auto') with check constraint
- Creates indexes for performance
- Sets up auto-update trigger for `updatedAt` timestamp

### If You Get Errors:
1. **"relation already exists"** - Table already exists, migration will skip table creation
2. **"column already exists"** - Columns already added, you can ignore
3. **"permission denied"** - Ensure you have admin privileges on Supabase

### Rollback (if needed):
```sql
DROP TABLE IF EXISTS "FinancialStatement" CASCADE;
```
