import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Use service role key for backend (bypasses RLS — Express middleware handles authorization).
// Falls back to anon key for local dev if service role key not configured.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[SECURITY] SUPABASE_SERVICE_ROLE_KEY not set — using anon key. RLS will apply to backend queries.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
