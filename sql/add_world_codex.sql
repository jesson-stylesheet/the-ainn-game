-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — World Codex Relational Schema
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Codex Mobs
CREATE TABLE codex_mobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    danger_level INT NOT NULL DEFAULT 1,
    habitat TEXT NOT NULL,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Codex Items
-- Note: 'category' maps strictly to the TypeScript ItemCategory enum 
-- (questItem, consumables, meleeWeapon, etc.)
CREATE TABLE codex_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR NOT NULL,
    rarity INT NOT NULL DEFAULT 0,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Codex Characters
-- Distinguishes between ambient story characters and actual Patrons in the DB
CREATE TABLE codex_characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    character_type VARCHAR NOT NULL CHECK (character_type IN ('patron', 'story_npc')),
    patron_id UUID REFERENCES patrons(id) ON DELETE SET NULL,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Codex Factions
CREATE TABLE codex_factions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    alignment VARCHAR NOT NULL,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Codex Recipes
-- References what specific item this recipe crafts
CREATE TABLE codex_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    crafted_item_id UUID REFERENCES codex_items(id) ON DELETE CASCADE,
    description TEXT,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Codex Recipe Materials Junction Table
-- Links a recipe to multiple required materials and their quantities
CREATE TABLE codex_recipe_materials (
    recipe_id UUID REFERENCES codex_recipes(id) ON DELETE CASCADE,
    material_item_id UUID REFERENCES codex_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1,
    PRIMARY KEY (recipe_id, material_item_id)
);

-- Enable RLS for all tables
ALTER TABLE codex_mobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_factions ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_recipe_materials ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for the engine
CREATE POLICY "Allow public select on codex_mobs" ON codex_mobs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_mobs" ON codex_mobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_mobs" ON codex_mobs FOR UPDATE USING (true);

CREATE POLICY "Allow public select on codex_items" ON codex_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_items" ON codex_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_items" ON codex_items FOR UPDATE USING (true);

CREATE POLICY "Allow public select on codex_characters" ON codex_characters FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_characters" ON codex_characters FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_characters" ON codex_characters FOR UPDATE USING (true);

CREATE POLICY "Allow public select on codex_factions" ON codex_factions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_factions" ON codex_factions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_factions" ON codex_factions FOR UPDATE USING (true);

CREATE POLICY "Allow public select on codex_recipes" ON codex_recipes FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_recipes" ON codex_recipes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_recipes" ON codex_recipes FOR UPDATE USING (true);

CREATE POLICY "Allow public select on codex_recipe_materials" ON codex_recipe_materials FOR SELECT USING (true);
CREATE POLICY "Allow public insert on codex_recipe_materials" ON codex_recipe_materials FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on codex_recipe_materials" ON codex_recipe_materials FOR UPDATE USING (true);
