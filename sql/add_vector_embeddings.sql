-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — World Codex pgvector RAG Schema
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Enable the pgvector extension natively in Supabase
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add Gemini 768-dimensional float embedding columns
ALTER TABLE codex_mobs ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE codex_items ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE codex_characters ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE codex_factions ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE codex_recipes ADD COLUMN IF NOT EXISTS embedding vector(768);


-- 3. HNSW Indexes for blazing-fast similarity searches
-- Note: Requires pgvector 0.5.0+. Uses cosine similarity (ip/l2/cosine available)
CREATE INDEX IF NOT EXISTS codex_mobs_embedding_idx ON codex_mobs USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS codex_items_embedding_idx ON codex_items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS codex_characters_embedding_idx ON codex_characters USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS codex_factions_embedding_idx ON codex_factions USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS codex_recipes_embedding_idx ON codex_recipes USING hnsw (embedding vector_cosine_ops);


-- 4. RPC Search Functions (Cosine Similarity)
-- These allow the frontend to pass a vector and return the top N closest semantic matches scope to a world.
-- The <-> operator computes Euclidean distance. <==> computes cosine distance. 
-- We return entities ordered by cosine similarity (1 - cosine distance).

CREATE OR REPLACE FUNCTION match_codex_mobs(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_world_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  danger_level INT,
  habitat TEXT,
  discovered_at TIMESTAMP WITH TIME ZONE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codex_mobs.id,
    codex_mobs.name,
    codex_mobs.description,
    codex_mobs.danger_level,
    codex_mobs.habitat,
    codex_mobs.discovered_at,
    1 - (codex_mobs.embedding <=> query_embedding) AS similarity
  FROM codex_mobs
  WHERE codex_mobs.world_id = p_world_id AND 1 - (codex_mobs.embedding <=> query_embedding) > match_threshold
  ORDER BY codex_mobs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION match_codex_items(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_world_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category VARCHAR,
  rarity INT,
  discovered_at TIMESTAMP WITH TIME ZONE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codex_items.id,
    codex_items.name,
    codex_items.description,
    codex_items.category,
    codex_items.rarity,
    codex_items.discovered_at,
    1 - (codex_items.embedding <=> query_embedding) AS similarity
  FROM codex_items
  WHERE codex_items.world_id = p_world_id AND 1 - (codex_items.embedding <=> query_embedding) > match_threshold
  ORDER BY codex_items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION match_codex_characters(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_world_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  character_type VARCHAR,
  patron_id UUID,
  discovered_at TIMESTAMP WITH TIME ZONE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codex_characters.id,
    codex_characters.name,
    codex_characters.description,
    codex_characters.character_type,
    codex_characters.patron_id,
    codex_characters.discovered_at,
    1 - (codex_characters.embedding <=> query_embedding) AS similarity
  FROM codex_characters
  WHERE codex_characters.world_id = p_world_id AND 1 - (codex_characters.embedding <=> query_embedding) > match_threshold
  ORDER BY codex_characters.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION match_codex_factions(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_world_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  alignment VARCHAR,
  discovered_at TIMESTAMP WITH TIME ZONE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codex_factions.id,
    codex_factions.name,
    codex_factions.description,
    codex_factions.alignment,
    codex_factions.discovered_at,
    1 - (codex_factions.embedding <=> query_embedding) AS similarity
  FROM codex_factions
  WHERE codex_factions.world_id = p_world_id AND 1 - (codex_factions.embedding <=> query_embedding) > match_threshold
  ORDER BY codex_factions.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


CREATE OR REPLACE FUNCTION match_codex_recipes(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_world_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  crafted_item_id UUID,
  discovered_at TIMESTAMP WITH TIME ZONE,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    codex_recipes.id,
    codex_recipes.name,
    codex_recipes.description,
    codex_recipes.crafted_item_id,
    codex_recipes.discovered_at,
    1 - (codex_recipes.embedding <=> query_embedding) AS similarity
  FROM codex_recipes
  WHERE codex_recipes.world_id = p_world_id AND 1 - (codex_recipes.embedding <=> query_embedding) > match_threshold
  ORDER BY codex_recipes.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
