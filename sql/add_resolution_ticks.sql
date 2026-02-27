-- Add resolution_ticks to quests table
ALTER TABLE public.quests
ADD COLUMN IF NOT EXISTS resolution_ticks INTEGER NOT NULL DEFAULT 20;
