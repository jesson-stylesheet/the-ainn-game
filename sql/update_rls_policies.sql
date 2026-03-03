-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Global RLS Permissive Policies
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patrons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lore_chronicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inn_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quest_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_mobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.codex_recipe_materials ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies to avoid conflicts
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Permissive All" ON public.%I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Public Full Access" ON public.%I', t);
    END LOOP;
END $$;

-- 3. Create permissive policies for full CRUD access (Anon & Authenticated)
-- Note: In a production app, these would be strictly filtered by inn_id/world_id.
-- For the alpha prototype, we grant global access.

CREATE POLICY "Public Full Access" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.worlds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.inns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.patrons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.quests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.lore_chronicle FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.inn_state FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.quest_resolutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.event_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_mobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_factions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Full Access" ON public.codex_recipe_materials FOR ALL USING (true) WITH CHECK (true);
