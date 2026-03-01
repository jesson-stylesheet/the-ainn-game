-- Migration: Add crafting mechanics
-- Adds consumed items to quests, and created by to items.

ALTER TABLE quests
ADD COLUMN IF NOT EXISTS consumed_items JSONB DEFAULT NULL;

ALTER TABLE items
ADD COLUMN IF NOT EXISTS crafted_by_patron_id UUID REFERENCES patrons(id) ON DELETE SET NULL;
