-- ========================================================
-- PE OS - FINAL DATABASE FIX SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR TO RESOLVE 500 ERRORS
-- ========================================================

-- 1. Ensure Organization table exists
CREATE TABLE IF NOT EXISTS public."Organization" (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);

-- 2. Ensure User table exists and has correct columns
CREATE TABLE IF NOT EXISTS public."User" (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    "authId" text UNIQUE,
    email text UNIQUE,
    name text,
    "organizationId" uuid REFERENCES public."Organization"(id),
    role text DEFAULT 'ANALYST',
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);

-- 3. Add missing columns to User if they were missed
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='name') THEN
        ALTER TABLE public."User" ADD COLUMN "name" text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='isActive') THEN
        ALTER TABLE public."User" ADD COLUMN "isActive" boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='organizationId') THEN
        ALTER TABLE public."User" ADD COLUMN "organizationId" uuid REFERENCES public."Organization"(id);
    END IF;
END $$;

-- 4. Ensure Deal table has AI extraction columns
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Deal' AND column_name='extractionConfidence') THEN
        ALTER TABLE public."Deal" ADD COLUMN "extractionConfidence" integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Deal' AND column_name='needsReview') THEN
        ALTER TABLE public."Deal" ADD COLUMN "needsReview" boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Deal' AND column_name='reviewReasons') THEN
        ALTER TABLE public."Deal" ADD COLUMN "reviewReasons" jsonb DEFAULT '[]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Deal' AND column_name='aiRisks') THEN
        ALTER TABLE public."Deal" ADD COLUMN "aiRisks" jsonb DEFAULT '{}';
    END IF;
END $$;

-- 5. Ensure Document table has extraction columns
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Document' AND column_name='extractedText') THEN
        ALTER TABLE public."Document" ADD COLUMN "extractedText" text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Document' AND column_name='folderId') THEN
        ALTER TABLE public."Document" ADD COLUMN "folderId" uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Document' AND column_name='extractedData') THEN
        ALTER TABLE public."Document" ADD COLUMN "extractedData" jsonb DEFAULT '{}';
    END IF;
END $$;

-- 6. Create a default Organization if none exists
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM public."Organization" WHERE slug = 'default-org') THEN
        INSERT INTO public."Organization" (id, name, slug)
        VALUES ('00000000-0000-0000-0000-000000000000', 'Default Organization', 'default-org')
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 7. Disable RLS temporarily for initial testing or set permissive policies
ALTER TABLE public."Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Company" ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN 
    -- Organization policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'org_all_access') THEN
        CREATE POLICY "org_all_access" ON public."Organization" FOR ALL USING (true);
    END IF;
    -- User policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_all_access') THEN
        CREATE POLICY "user_all_access" ON public."User" FOR ALL USING (true);
    END IF;
    -- Deal policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'deal_all_access') THEN
        CREATE POLICY "deal_all_access" ON public."Deal" FOR ALL USING (true);
    END IF;
    -- Document policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'document_all_access') THEN
        CREATE POLICY "document_all_access" ON public."Document" FOR ALL USING (true);
    END IF;
    -- Company policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_all_access') THEN
        CREATE POLICY "company_all_access" ON public."Company" FOR ALL USING (true);
    END IF;
END $$;

-- 8. FORCE SCHEMA CACHE RELOAD
NOTIFY pgrst, 'reload schema';
