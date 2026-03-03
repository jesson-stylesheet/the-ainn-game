-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Security Hardening
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Move Vector Extension to its own schema
-- Move it out of 'public' as recommended by Supabase Security Advisor.
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- 2. Secure Project Functions (Search Path Hardening)
-- Prevents search path hijacking by pinning it to 'public'.
ALTER FUNCTION public.tick_game_clock(UUID, INT) SET search_path = public;
ALTER FUNCTION public.get_inn_dashboard(UUID) SET search_path = public;
ALTER FUNCTION public.transfer_gold(UUID, UUID, INT, INT) SET search_path = public;
ALTER FUNCTION public.assign_patron_to_quest(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.log_event(UUID, TEXT, UUID, TEXT, JSONB, INT) SET search_path = public;
ALTER FUNCTION public.get_patron_loadout(UUID) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.match_codex_mobs(extensions.vector, FLOAT, INT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.match_codex_items(extensions.vector, FLOAT, INT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.match_codex_characters(extensions.vector, FLOAT, INT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.match_codex_factions(extensions.vector, FLOAT, INT, UUID) SET search_path = public, extensions;
ALTER FUNCTION public.match_codex_recipes(extensions.vector, FLOAT, INT, UUID) SET search_path = public, extensions;

-- 3. Strict Multi-Tenancy RLS Policies
-- Drop the overly permissive alpha policies.
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public Full Access" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_lore_all" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_patrons_all" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_quests_all" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public select on %I" ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public insert on %I" ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public update on %I" ON public.%I', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public delete on %I" ON public.%I', t, t);
    END LOOP;
END $$;

-- Help function to check if a user owns an inn
CREATE OR REPLACE FUNCTION public.is_inn_owner(p_inn_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.inns i
    JOIN public.players p ON i.player_id = p.id
    WHERE i.id = p_inn_id AND p.user_id = auth.uid()
  );
END;
$$ SET search_path = public;

-- Inn-Scoped Tables
-- (patrons, quests, items, lore_chronicle, event_log, quest_resolutions)
DO $$ 
DECLARE 
    tbl TEXT;
    inn_scoped_tables TEXT[] := ARRAY['patrons', 'quests', 'items', 'lore_chronicle', 'event_log', 'quest_resolutions'];
BEGIN
    FOREACH tbl IN ARRAY inn_scoped_tables LOOP
        EXECUTE format('CREATE POLICY "Users can only access their own inn data" ON public.%I FOR ALL USING (public.is_inn_owner(inn_id))', tbl);
    END LOOP;
END $$;

-- World-Scoped Tables (Codex)
-- Allow users to read the codex for worlds they have an inn in.
-- Restrict write/update to service_role or admin (not implementing admin yet, so engine only).
DO $$ 
DECLARE 
    tbl TEXT;
    world_scoped_tables TEXT[] := ARRAY['codex_mobs', 'codex_items', 'codex_characters', 'codex_factions', 'codex_recipes'];
BEGIN
    FOREACH tbl IN ARRAY world_scoped_tables LOOP
        EXECUTE format('CREATE POLICY "Users can read codex in their world" ON public.%I FOR SELECT USING (EXISTS (SELECT 1 FROM public.inns WHERE world_id = %I.world_id AND player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid())))', tbl, tbl);
    END LOOP;
END $$;

-- Inns Table
CREATE POLICY "Users can see their own inns" ON public.inns FOR SELECT USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));
CREATE POLICY "Users can update their own inns" ON public.inns FOR UPDATE USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));

-- Worlds Table
CREATE POLICY "Users can see worlds they are in" ON public.worlds FOR SELECT USING (id IN (SELECT world_id FROM public.inns WHERE player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid())));
