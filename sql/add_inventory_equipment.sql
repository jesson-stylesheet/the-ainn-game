-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Items & Equipment Schema
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Create the new ENUMs for items
CREATE TYPE item_category AS ENUM (
    'questItem',
    'consumables',
    'meleeWeapon',
    'magicWeapon',
    'rangeWeapon',
    'shield',
    'lightHeadGear',
    'heavyHeadGear',
    'lightBodyArmor',
    'heavyBodyArmor',
    'lightLegGear',
    'heavyLegGear',
    'lightFootGear',
    'heavyFootGear'
);

CREATE TYPE equipment_slot AS ENUM (
    'headwear',
    'bodyArmor',
    'legwear',
    'footwear',
    'righthand',
    'lefthand'
);

-- 2. Create the items table
CREATE TABLE items (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    category item_category NOT NULL,
    rarity FLOAT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    owner_patron_id UUID REFERENCES patrons(id) ON DELETE CASCADE,
    equipped_slot equipment_slot,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Modify quests to include item_category
ALTER TABLE quests ADD COLUMN item_category item_category;

-- If both owner_patron_id and equipped_slot are NULL, the item is in the Inn's inventory.
-- If owner_patron_id is set but equipped_slot is NULL, the item is in the Patron's backpack.
-- If both are set, the item is worn by the patron.

-- 3. Add an equipment JSONB column to patrons to cache the active equipment layout
-- (This is optional but makes it easier to fetch the patron's current layout without a join,
-- however to maintain a strict source of truth, we will rely on joining or fetching from items table).
-- For this design, we will rely purely on the items table, as requested.

-- Create an index to quickly lookup a patron's items
CREATE INDEX items_owner_patron_id_idx ON items(owner_patron_id);

-- Optional RLS (if used elsewhere)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for items" ON items FOR ALL USING (true);
