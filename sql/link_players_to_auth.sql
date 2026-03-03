-- ═══════════════════════════════════════════════════════════════════════
-- THE AINN ENGINE — Link Players to Auth Users
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Add user_id column to players
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enforce 1-to-1 relationship (One auth user = One player profile)
ALTER TABLE public.players 
ADD CONSTRAINT players_user_id_key UNIQUE (user_id);

-- 3. Update RLS Policies for players
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow public select on players" ON players;
DROP POLICY IF EXISTS "Allow public insert on players" ON players;
DROP POLICY IF EXISTS "Allow public update on players" ON players;

-- Create new secure policies
-- Anyone can view player profiles
CREATE POLICY "Allow public select on players" ON players FOR SELECT USING (true);

-- Users can only insert their own player profile
CREATE POLICY "Users can insert their own player" ON players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own player profile
CREATE POLICY "Users can update their own player" ON players FOR UPDATE USING (auth.uid() = user_id);
