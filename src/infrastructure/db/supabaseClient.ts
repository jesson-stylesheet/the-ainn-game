/**
 * ═══════════════════════════════════════════════════════════════════════
 * THE AINN ENGINE — Supabase Client
 * ═══════════════════════════════════════════════════════════════════════
 * Single Supabase client instance. Environment variables loaded from .env.
 *
 * KEY REQUIREMENT — RLS bypass:
 *   The headless engine never calls supabase.auth.signIn(), so auth.uid()
 *   is always NULL against the hardened RLS policies from security_hardening.sql.
 *   SUPABASE_SERVICE_ROLE_KEY MUST be set in .env — the Service Role Key
 *   bypasses RLS entirely, giving the engine full read/write access.
 *   If only PUBLIC_SUPABASE_ANON_KEY is present, all game DB queries
 *   will be silently blocked by RLS (empty results / permission denied).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config(); // Load .env

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
// Service Role Key bypasses RLS — REQUIRED for the headless engine.
// Falls back to Anon Key for read-only / non-RLS scenarios only.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
    console.error('❌ [SupabaseClient] PUBLIC_SUPABASE_URL is not set in .env — DB features will be disabled.');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️  [SupabaseClient] SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to anon key.');
    console.warn('   RLS policies (security_hardening.sql) will block all inn-scoped queries.');
    console.warn('   Set SUPABASE_SERVICE_ROLE_KEY in .env to enable full DB access.');
}

import fetch from 'node-fetch';

const url = SUPABASE_URL || '';
const key = SUPABASE_KEY || '';

export const supabase: SupabaseClient = createClient(url, key, {
    global: {
        fetch: fetch as any,
    },
});
