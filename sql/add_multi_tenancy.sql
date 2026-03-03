-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Multi-Tenancy & Worlds
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Create Players Table
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Worlds Table
CREATE TABLE IF NOT EXISTS worlds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Inns Table (Replaces inn_state)
CREATE TABLE IF NOT EXISTS inns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reputation INT NOT NULL DEFAULT 0,
    gold INT NOT NULL DEFAULT 0,
    copper INT NOT NULL DEFAULT 0,
    current_tick INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: In production these IDs would not be hardcoded. 
-- For the local TUI tester, we define a default hierarchy.
INSERT INTO players (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'game_tester_001') ON CONFLICT DO NOTHING;
INSERT INTO worlds (id, name) VALUES ('00000000-0000-0000-0000-000000000002', 'default_world') ON CONFLICT DO NOTHING;
INSERT INTO inns (id, world_id, player_id, name, reputation, gold, copper, current_tick)
VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'The Default Inn', 0, 0, 0, 0)
ON CONFLICT DO NOTHING;

-- Map old inn_state data to the new default inn if inn_state exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'inn_state') THEN
        UPDATE inns i
        SET 
          reputation = s.reputation,
          gold = s.gold,
          copper = s.copper,
          current_tick = s.current_tick
        FROM inn_state s
        WHERE s.id = 1 AND i.id = '00000000-0000-0000-0000-000000000003';
    END IF;
END $$;


-- 4. Scope the Tavern Game State Tables to `inn_id`
-- Patrons
ALTER TABLE patrons ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE patrons SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE patrons ALTER COLUMN inn_id SET NOT NULL;

-- Quests
ALTER TABLE quests ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE quests SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE quests ALTER COLUMN inn_id SET NOT NULL;

-- Items (Inventory)
ALTER TABLE items ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE items SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE items ALTER COLUMN inn_id SET NOT NULL;

-- Quest Resolutions
ALTER TABLE quest_resolutions ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE quest_resolutions SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE quest_resolutions ALTER COLUMN inn_id SET NOT NULL;

-- Lore Chronicle
ALTER TABLE lore_chronicle ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE lore_chronicle SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE lore_chronicle ALTER COLUMN inn_id SET NOT NULL;

-- Event Log
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS inn_id UUID REFERENCES inns(id) ON DELETE CASCADE;
UPDATE event_log SET inn_id = '00000000-0000-0000-0000-000000000003' WHERE inn_id IS NULL;
ALTER TABLE event_log ALTER COLUMN inn_id SET NOT NULL;


-- 5. Scope the World Codex Tables to `world_id`
-- Codex Mobs
ALTER TABLE codex_mobs ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
UPDATE codex_mobs SET world_id = '00000000-0000-0000-0000-000000000002' WHERE world_id IS NULL;
ALTER TABLE codex_mobs ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE codex_mobs DROP CONSTRAINT IF EXISTS codex_mobs_name_key;
ALTER TABLE codex_mobs ADD CONSTRAINT codex_mobs_name_world_key UNIQUE (name, world_id);

-- Codex Items
ALTER TABLE codex_items ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
UPDATE codex_items SET world_id = '00000000-0000-0000-0000-000000000002' WHERE world_id IS NULL;
ALTER TABLE codex_items ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE codex_items DROP CONSTRAINT IF EXISTS codex_items_name_key;
ALTER TABLE codex_items ADD CONSTRAINT codex_items_name_world_key UNIQUE (name, world_id);

-- Codex Characters
ALTER TABLE codex_characters ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
UPDATE codex_characters SET world_id = '00000000-0000-0000-0000-000000000002' WHERE world_id IS NULL;
ALTER TABLE codex_characters ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE codex_characters DROP CONSTRAINT IF EXISTS codex_characters_name_key;
ALTER TABLE codex_characters ADD CONSTRAINT codex_characters_name_world_key UNIQUE (name, world_id);

-- Codex Factions
ALTER TABLE codex_factions ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
UPDATE codex_factions SET world_id = '00000000-0000-0000-0000-000000000002' WHERE world_id IS NULL;
ALTER TABLE codex_factions ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE codex_factions DROP CONSTRAINT IF EXISTS codex_factions_name_key;
ALTER TABLE codex_factions ADD CONSTRAINT codex_factions_name_world_key UNIQUE (name, world_id);

-- Codex Recipes
ALTER TABLE codex_recipes ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;
UPDATE codex_recipes SET world_id = '00000000-0000-0000-0000-000000000002' WHERE world_id IS NULL;
ALTER TABLE codex_recipes ALTER COLUMN world_id SET NOT NULL;
ALTER TABLE codex_recipes DROP CONSTRAINT IF EXISTS codex_recipes_name_key;
ALTER TABLE codex_recipes ADD CONSTRAINT codex_recipes_name_world_key UNIQUE (name, world_id);

-- 6. Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE inns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on players" ON players FOR SELECT USING (true);
CREATE POLICY "Allow public insert on players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on players" ON players FOR UPDATE USING (true);

CREATE POLICY "Allow public select on worlds" ON worlds FOR SELECT USING (true);
CREATE POLICY "Allow public insert on worlds" ON worlds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on worlds" ON worlds FOR UPDATE USING (true);

CREATE POLICY "Allow public select on inns" ON inns FOR SELECT USING (true);
CREATE POLICY "Allow public insert on inns" ON inns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on inns" ON inns FOR UPDATE USING (true);


-- 7. Update RPCs for Multi-Tenancy

-- tick_game_clock
CREATE OR REPLACE FUNCTION tick_game_clock(p_inn_id UUID, ticks_to_add INT DEFAULT 1)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  new_tick INT;
BEGIN
  UPDATE inns
  SET current_tick = current_tick + ticks_to_add
  WHERE id = p_inn_id
  RETURNING current_tick INTO new_tick;
  
  RETURN new_tick;
END;
$$;

-- get_inn_dashboard
CREATE OR REPLACE FUNCTION get_inn_dashboard(p_inn_id UUID)
RETURNS JSON LANGUAGE plpgsql AS $$
DECLARE
  dashboard JSON;
BEGIN
  SELECT row_to_json(i.*) INTO dashboard
  FROM inns i
  WHERE id = p_inn_id;
  
  RETURN dashboard;
END;
$$;

-- assign_patron_to_quest
CREATE OR REPLACE FUNCTION assign_patron_to_quest(p_patron_id UUID, p_quest_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  UPDATE quests 
  SET assigned_patron_id = p_patron_id, status = 'ACCEPTED'
  WHERE id = p_quest_id;
  
  UPDATE patrons
  SET state = 'ON_QUEST'
  WHERE id = p_patron_id;

  RETURN TRUE;
END;
$$;

-- log_event
CREATE OR REPLACE FUNCTION log_event(
    p_inn_id UUID,
    p_event_type TEXT,
    p_subject_id UUID,
    p_subject_type TEXT,
    p_payload JSONB,
    p_game_tick INT
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO event_log (inn_id, event_type, subject_id, subject_type, payload, game_tick)
  VALUES (p_inn_id, p_event_type, p_subject_id, p_subject_type, p_payload, p_game_tick);
END;
$$;

-- transfer_gold
CREATE OR REPLACE FUNCTION transfer_gold(
    p_inn_id UUID,
    p_patron_id UUID,
    p_gold INT,
    p_copper INT
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- Deduct from/Add to Inn
  UPDATE inns
  SET gold = gold - p_gold, copper = copper - p_copper
  WHERE id = p_inn_id;
  
  -- Add to/Deduct from Patron
  UPDATE patrons
  SET gold = gold + p_gold, copper = copper + p_copper
  WHERE id = p_patron_id;
END;
$$;
