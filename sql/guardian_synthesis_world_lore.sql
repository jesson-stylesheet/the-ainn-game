-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Guardian Synthesis World Lore
-- ═══════════════════════════════════════════════════════════════════════
-- Adds world_id directly to lore_chronicle so the Guardian's synthesis
-- can wipe and replace lore at the world level (across all inns), making
-- the synthesis the single canonical seed for the next Guardian cycle.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add world_id column (nullable first to allow backfill)
ALTER TABLE public.lore_chronicle
    ADD COLUMN IF NOT EXISTS world_id UUID REFERENCES worlds(id) ON DELETE CASCADE;

-- 2. Backfill world_id from the inn relationship
UPDATE public.lore_chronicle lc
    SET world_id = i.world_id
    FROM public.inns i
    WHERE i.id = lc.inn_id
      AND lc.world_id IS NULL;

-- 3. Make world_id required going forward
ALTER TABLE public.lore_chronicle
    ALTER COLUMN world_id SET NOT NULL;

-- 4. Index for fast world-scoped deletes (Guardian synthesis wipe)
CREATE INDEX IF NOT EXISTS idx_lore_chronicle_world_id
    ON public.lore_chronicle (world_id);
