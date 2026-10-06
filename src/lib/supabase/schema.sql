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

-- ============================================================
-- BEGIN migrations 2026-10-04 (mirrors src/lib/supabase/migrations/*.sql, in order)
-- ============================================================

-- ── 2026-10-04-a-coin-purchase-ledger.sql ──
-- ============================================================
-- Coin purchase ledger + atomic, idempotent crediting
-- Run once in the Supabase SQL Editor (safe to re-run).
-- Mirrored in schema.sql.
-- ============================================================

-- 1. Processed Stripe webhook events (idempotency by event id)
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id             TEXT PRIMARY KEY,
  event_type           TEXT NOT NULL,
  checkout_session_id  TEXT,
  processed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;  -- no policies: service role only

-- 2. Wallet ledger: remember which Checkout Session funded each purchase row
ALTER TABLE coin_transactions
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_transactions_checkout_session
  ON coin_transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

-- 3. Revenue ledger (append-only). Only 'coin_purchase' rows are written today;
--    'refund' and 'chargeback' are reserved for the follow-up refund work.
CREATE TABLE IF NOT EXISTS revenue_events (
  id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type                  TEXT NOT NULL CHECK (event_type IN ('coin_purchase', 'refund', 'chargeback')),
  user_id                     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  package_id                  TEXT NOT NULL,
  gross_cents                 INTEGER NOT NULL CHECK (gross_cents >= 0),
  currency                    TEXT NOT NULL,
  coins_credited              INTEGER NOT NULL,   -- includes bonus coins (paid value of the lot)
  bonus_coins                 INTEGER NOT NULL DEFAULT 0,
  stripe_event_id             TEXT NOT NULL UNIQUE,
  stripe_checkout_session_id  TEXT NOT NULL,
  stripe_payment_intent_id    TEXT,
  coin_transaction_id         UUID REFERENCES coin_transactions(id) ON DELETE SET NULL,
  terms_version               TEXT,          -- coin purchase terms the buyer accepted before checkout
  terms_accepted_at           TIMESTAMPTZ,   -- server time of that acceptance
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- for databases where an earlier draft of this table already exists
ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_events_purchase_session
  ON revenue_events(stripe_checkout_session_id)
  WHERE event_type = 'coin_purchase';
CREATE INDEX IF NOT EXISTS idx_revenue_events_user_id ON revenue_events(user_id, created_at DESC);
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;  -- no policies: service role only

CREATE OR REPLACE FUNCTION revenue_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'revenue_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revenue_events_no_update ON revenue_events;
CREATE TRIGGER revenue_events_no_update
  BEFORE UPDATE OR DELETE ON revenue_events
  FOR EACH ROW EXECUTE FUNCTION revenue_events_append_only();

-- 4. Atomic crediting. One transaction: dedupe event, dedupe session, bump the
--    wallet with a single UPDATE (no read-modify-write), write both ledgers.
--    Returns {"status": "credited" | "duplicate_event" | "duplicate_session", "balance_after": n}
DROP FUNCTION IF EXISTS credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION credit_coin_purchase(
  p_event_id           TEXT,
  p_event_type         TEXT,
  p_session_id         TEXT,
  p_payment_intent_id  TEXT,
  p_user_id            UUID,
  p_package_id         TEXT,
  p_coins              INTEGER,
  p_bonus_coins        INTEGER,
  p_gross_cents        INTEGER,
  p_currency           TEXT,
  p_description        TEXT,
  p_terms_version      TEXT DEFAULT NULL,
  p_terms_accepted_at  TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_tx_id   UUID;
  v_rows    INTEGER;
BEGIN
  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'invalid_coins';
  END IF;
  IF p_session_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'missing_ids';
  END IF;

  -- Serialize everything that touches the same Checkout Session
  PERFORM pg_advisory_xact_lock(hashtext(p_session_id));

  INSERT INTO stripe_events (event_id, event_type, checkout_session_id)
  VALUES (p_event_id, p_event_type, p_session_id)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('status', 'duplicate_event');
  END IF;

  -- Same session already credited by a different event
  -- (e.g. checkout.session.completed AND async_payment_succeeded)
  IF EXISTS (SELECT 1 FROM coin_transactions WHERE stripe_checkout_session_id = p_session_id) THEN
    RETURN jsonb_build_object('status', 'duplicate_session');
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance + p_coins,
         total_coins_purchased = total_coins_purchased + p_coins,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description,
     stripe_payment_intent_id, stripe_checkout_session_id)
  VALUES
    (p_user_id, 'purchase', p_coins, v_balance, p_description,
     p_payment_intent_id, p_session_id)
  RETURNING id INTO v_tx_id;

  INSERT INTO revenue_events
    (event_type, user_id, package_id, gross_cents, currency, coins_credited,
     bonus_coins, stripe_event_id, stripe_checkout_session_id,
     stripe_payment_intent_id, coin_transaction_id, terms_version, terms_accepted_at)
  VALUES
    ('coin_purchase', p_user_id, p_package_id, p_gross_cents, p_currency, p_coins,
     COALESCE(p_bonus_coins, 0), p_event_id, p_session_id,
     p_payment_intent_id, v_tx_id, p_terms_version, p_terms_accepted_at);

  RETURN jsonb_build_object('status', 'credited', 'balance_after', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- ── 2026-10-04-b-wallet-protection.sql ──
-- ============================================================
-- Wallet protection (REQUIRED before taking real money). Safe to re-run.
--
-- Rule: players can never change their own coins, and nobody except the
-- server (service_role key, or SECURITY DEFINER functions such as
-- credit_coin_purchase / spend_coins / award_coins, or the SQL editor) can write
-- wallet or ledger data. Three layers, so one mistake cannot open a hole:
--   1. Privileges: anon and authenticated lose INSERT/DELETE on profiles and
--      can UPDATE only the three profile text columns; they lose all writes on
--      every ledger/config table.
--   2. RLS: turned on for the two tables that never had it
--      (game_api_keys, coin_packages).
--   3. Trigger: even if someone re-grants privileges later, a signed-in or
--      anonymous caller still cannot touch coin_balance / total_coins_purchased.
--
-- Background: before this, the "Users can update own profile" policy let any
-- signed-in user set their own coin_balance with the public anon key, and
-- game_api_keys had no RLS, so a player could read key hashes or insert a key
-- they knew and then call /api/coins/award for themselves.
-- ============================================================

-- 1a. profiles: players may only edit their display fields
REVOKE INSERT, DELETE, TRUNCATE ON profiles FROM anon, authenticated;
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (username, display_name, avatar_url) ON profiles TO authenticated;

-- 1b. ledger and config tables: read-only (or invisible) for players
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON coin_transactions FROM anon, authenticated;
REVOKE ALL ON revenue_events FROM anon, authenticated;
REVOKE ALL ON stripe_events FROM anon, authenticated;
REVOKE ALL ON game_api_keys FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON coin_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON games FROM anon, authenticated;

-- 2. RLS on tables that were exposed
ALTER TABLE game_api_keys ENABLE ROW LEVEL SECURITY;   -- no policies: service role only
ALTER TABLE coin_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view active coin packages" ON coin_packages;
CREATE POLICY "Anyone can view active coin packages" ON coin_packages
  FOR SELECT USING (is_active = TRUE);

-- 3. Trigger backstop. current_user is the role PostgREST switched to for the
--    request ('anon' / 'authenticated'); SECURITY DEFINER functions, the
--    service role and the SQL editor run as other roles and are unaffected.
--    (Replaces the earlier protect_wallet_columns trigger, which keyed off JWT claims.)
DROP TRIGGER IF EXISTS profiles_protect_wallet ON profiles;
DROP FUNCTION IF EXISTS protect_wallet_columns();

CREATE OR REPLACE FUNCTION protect_wallet_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.coin_balance <> 0 OR NEW.total_coins_purchased <> 0 THEN
        RAISE EXCEPTION 'wallet columns can only be set by the server';
      END IF;
    ELSIF NEW.coin_balance IS DISTINCT FROM OLD.coin_balance
       OR NEW.total_coins_purchased IS DISTINCT FROM OLD.total_coins_purchased THEN
      RAISE EXCEPTION 'wallet columns can only be changed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_protect_wallet
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_wallet_columns();

-- ── 2026-10-04-c-spend-award.sql ──
-- ============================================================
-- Atomic, idempotent spend and award (replaces the read-modify-write in
-- /api/coins/spend and /api/coins/award). Safe to re-run.
--
-- Each call is ONE transaction that: locks the player's profile row, replays the
-- stored result if the idempotency key was already used, checks the balance, changes
-- it with a single UPDATE, and writes the coin_transactions ledger row (with game_id).
-- Executable by service_role only; the API routes check the game API key first.
-- ============================================================

ALTER TABLE coin_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_coin_transactions_game_idem
  ON coin_transactions(game_id, type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Returns {"status": "ok" | "replayed" | "insufficient", "balance": n}
CREATE OR REPLACE FUNCTION spend_coins(
  p_user_id          UUID,
  p_game_id          UUID,
  p_amount           INTEGER,
  p_reason           TEXT,
  p_idempotency_key  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  INTEGER;
  v_existing coin_transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL THEN RAISE EXCEPTION 'missing_ids'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  -- Row lock: every wallet operation for this player is serialized from here
  SELECT coin_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM coin_transactions
     WHERE game_id = p_game_id AND type = 'spend' AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.user_id IS DISTINCT FROM p_user_id OR v_existing.amount <> -p_amount THEN
        RAISE EXCEPTION 'idempotency_key_conflict';
      END IF;
      RETURN jsonb_build_object('status', 'replayed', 'balance', v_existing.balance_after);
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient', 'balance', v_balance);
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance - p_amount, updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'spend', -p_amount, v_balance, p_reason, p_game_id, p_idempotency_key);

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

-- Returns {"status": "ok" | "replayed", "balance": n}. Max 10,000 per call (anti-exploit).
CREATE OR REPLACE FUNCTION award_coins(
  p_user_id          UUID,
  p_game_id          UUID,
  p_amount           INTEGER,
  p_reason           TEXT,
  p_idempotency_key  TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance  INTEGER;
  v_existing coin_transactions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL THEN RAISE EXCEPTION 'missing_ids'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT coin_balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM coin_transactions
     WHERE game_id = p_game_id AND type = 'award' AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.user_id IS DISTINCT FROM p_user_id OR v_existing.amount <> p_amount THEN
        RAISE EXCEPTION 'idempotency_key_conflict';
      END IF;
      RETURN jsonb_build_object('status', 'replayed', 'balance', v_existing.balance_after);
    END IF;
  END IF;

  IF v_balance::BIGINT + p_amount > 2000000000 THEN RAISE EXCEPTION 'balance_limit'; END IF;

  UPDATE profiles
     SET coin_balance = coin_balance + p_amount, updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'award', p_amount, v_balance, p_reason, p_game_id, p_idempotency_key);

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;
