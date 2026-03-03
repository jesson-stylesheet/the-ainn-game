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

import fetch from 'node-fetch';

const url = SUPABASE_URL || '';
const key = SUPABASE_KEY || '';

export const supabase: SupabaseClient = createClient(url, key, {
    global: {
        fetch: fetch as any,
    },
});
