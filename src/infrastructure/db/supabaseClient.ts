/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Supabase Client
 * ═══════════════════════════════════════════════════════════════════════
 * Single Supabase client instance. Environment variables loaded from .env.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config(); // Load .env

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
// Use Service Role Key for the headless server to bypass RLS, fallback to Anon Key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
        'Missing Supabase credentials. Ensure PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY are set in .env'
    );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
