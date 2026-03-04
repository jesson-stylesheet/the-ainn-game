-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Fix: Missing RLS INSERT Policies (Post-Hardening)
-- ═══════════════════════════════════════════════════════════════════════
-- BUG #2 FIX: security_hardening.sql nuked all "Public Full Access"
-- and "Allow public..." RLS policies and replaced them with strict
-- auth.uid()-based SELECT/UPDATE policies. However it NEVER added
-- INSERT policies for `worlds` or `inns`, making it impossible to
-- create new worlds or inns even with a valid auth session.
--
-- Additionally, the headless game server (TUI / Express) never calls
-- supabase.auth.signIn() — it relies on SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS entirely). If only PUBLIC_SUPABASE_ANON_KEY is
-- present, ALL game queries are blocked.
--
-- This migration adds the missing INSERT policies.
-- REQUIREMENT: SUPABASE_SERVICE_ROLE_KEY must be set in .env for the
-- headless engine. The anon key path is intentionally NOT supported
-- for server-side engine use (it cannot bypass RLS).
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Allow authenticated users to create new worlds
DROP POLICY IF EXISTS "Users can create worlds" ON public.worlds;
CREATE POLICY "Users can create worlds"
    ON public.worlds
    FOR INSERT
    WITH CHECK (true);   -- Any authenticated session may create a world

-- 2. Allow authenticated users to create inns in any world
DROP POLICY IF EXISTS "Users can create inns" ON public.inns;
CREATE POLICY "Users can create inns"
    ON public.inns
    FOR INSERT
    WITH CHECK (
        -- The inn must belong to this user's player profile
        player_id IN (
            SELECT id FROM public.players WHERE user_id = auth.uid()
        )
    );

-- 3. Allow authenticated users to delete their own inns
DROP POLICY IF EXISTS "Users can delete their own inns" ON public.inns;
CREATE POLICY "Users can delete their own inns"
    ON public.inns
    FOR DELETE
    USING (
        player_id IN (
            SELECT id FROM public.players WHERE user_id = auth.uid()
        )
    );

-- NOTE: The game server MUST use SUPABASE_SERVICE_ROLE_KEY (set in .env)
-- to bypass RLS. The anon key will be denied by auth.uid() = NULL on all
-- inn-scoped tables (patrons, quests, items, lore_chronicle, etc.).
-- Verify your .env contains:
--   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
--   PUBLIC_SUPABASE_URL=<your-project-url>
