-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Add game_day to Lore Chronicle
-- ═══════════════════════════════════════════════════════════════════════

-- Add game_day column to lore_chronicle to track which day the lore or synthesis occurred.
ALTER TABLE public.lore_chronicle
    ADD COLUMN IF NOT EXISTS game_day INTEGER NOT NULL DEFAULT 0;

-- Optionally, create an index if we're going to be sorting/filtering by it frequently
CREATE INDEX IF NOT EXISTS idx_lore_chronicle_game_day
    ON public.lore_chronicle (game_day);
