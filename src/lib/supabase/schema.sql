-- ============================================================
-- howgamersgame.online — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- ── Profiles (extends auth.users) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  coin_balance INTEGER NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  total_coins_purchased INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Games ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  cover_art_url TEXT,           -- 800×600 art used on TV + pulled-out cartridge face
  cartridge_label_url TEXT,     -- 200×120 thumbnail shown in rack slot
  game_url TEXT NOT NULL,       -- iframe src: Supabase Storage URL or external URL
  game_type TEXT NOT NULL DEFAULT 'external'
    CHECK (game_type IN ('supabase', 'external')),
  storage_path TEXT,            -- relative path inside the "games" Storage bucket
                                -- e.g. "my-game/index.html" (only set when game_type='supabase')
  genre TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Supabase Storage buckets (run separately in Storage UI or SQL) ─────────────
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- Bucket: "games"       (public) — stores uploaded game files
-- Bucket: "game-assets" (public) — stores cover art, labels, blank cartridge image
--
-- Example Storage paths:
--   game-assets/covers/{slug}.png       — 800×600 cover art
--   game-assets/labels/{slug}.png       — 200×120 label
--   game-assets/cartridges/blank.png    — blank cartridge 3D image (platform-wide)
--   game-assets/cartridges/tv-off.png   — TV off state
--   game-assets/cartridges/console.png  — console unit image
--   games/{slug}/index.html             — entry point for Supabase-hosted game
--   games/{slug}/**                     — all other game files

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active games" ON games
  FOR SELECT USING (is_active = TRUE);

-- ── Game API Keys (for games to call the coin API) ────────────────────────────
CREATE TABLE IF NOT EXISTS game_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  key_prefix TEXT NOT NULL,     -- first 8 chars, shown in dashboard
  key_hash TEXT UNIQUE NOT NULL, -- SHA-256 of full key
  name TEXT NOT NULL DEFAULT 'Default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Coin Packages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_packages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  coins INTEGER NOT NULL,
  bonus_coins INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Seed the coin packages
INSERT INTO coin_packages (name, price_cents, coins, bonus_coins, sort_order) VALUES
  ('Player',   500,    550,    50,   1),
  ('Gamer',   1000,   1200,   200,   2),
  ('Pro',     2000,   2500,   500,   3),
  ('Elite',   4000,   5200,  1200,   4),
  ('Legend', 10000,  14000,  4000,   5)
ON CONFLICT DO NOTHING;

-- ── Coin Transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'award', 'refund')),
  amount INTEGER NOT NULL,          -- positive = gain, negative = spend
  balance_after INTEGER NOT NULL,
  description TEXT,
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_created_at ON coin_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_sort_order ON games(sort_order);
CREATE INDEX IF NOT EXISTS idx_games_is_active ON games(is_active);

-- ── Timestamp trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
