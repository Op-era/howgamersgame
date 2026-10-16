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

-- ── 2026-10-06-d-developer-portal.sql ──
-- Developer portal migration (2026-10-06)
-- Adds developers table and game review workflow columns.

CREATE TABLE IF NOT EXISTS developers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  studio_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS developer_id UUID REFERENCES developers(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (review_status IN ('pending','approved','rejected'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_games_developer_id ON games(developer_id);
CREATE INDEX IF NOT EXISTS idx_games_review_status ON games(review_status);

-- ── 2026-10-06-e-games-columns.sql ──
-- Fill in missing games table columns (live table was created minimal).
-- Also creates game_api_keys if missing.

ALTER TABLE games ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS cover_art_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS cartridge_label_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'external';
ALTER TABLE games ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live';
ALTER TABLE games ADD COLUMN IF NOT EXISTS revenue_share_pct NUMERIC NOT NULL DEFAULT 30.0;

-- Backfill title from name where title is null
UPDATE games SET title = name WHERE title IS NULL AND name IS NOT NULL;

CREATE TABLE IF NOT EXISTS game_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_api_keys_game_id ON game_api_keys(game_id);
CREATE INDEX IF NOT EXISTS idx_game_api_keys_hash ON game_api_keys(key_hash);

-- ── 2026-10-15-f-coin-lots.sql ──
-- ============================================================
-- Coin lots: free-first spending, paid-coin valuation, developer earnings.
-- Safe to re-run. Apply in one transaction during a quiet window; app code
-- needs no change (function signatures unchanged).
--
-- Rules implemented:
--   * Free promotional coins are spent first, then paid coins oldest-first.
--   * Each paid coin is valued at gross_cents / coins_credited (bonus included).
--   * Net Paid Coin Value = gross paid value minus taxes, processing fees,
--     refunds or chargebacks only. Free promotional coins pay developers nothing.
--   * Every spend is recorded against the exact lots it consumed.
--
-- Backfill assumption: before this migration there was no promo/paid split,
-- so each existing balance is split by replaying the free-first rule in
-- aggregate: paid_remaining = LEAST(coin_balance, total coins credited by that
-- user's coin_purchase revenue_events); promo_balance = coin_balance - paid_remaining.
-- Spends made BEFORE this migration have no allocation rows (their lot
-- attribution is unknown), so developer earnings for pre-migration spends
-- cannot be computed from lots.
--
-- Rollback note: restore functions from migrations a and c, drop new tables;
-- coin_balance is untouched so reverting is safe.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. profiles: promo_balance column + wallet trigger update
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS promo_balance INTEGER NOT NULL DEFAULT 0 CHECK (promo_balance >= 0);

-- Replace protect_wallet_columns() to also guard promo_balance.
CREATE OR REPLACE FUNCTION protect_wallet_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.coin_balance <> 0 OR NEW.total_coins_purchased <> 0 OR NEW.promo_balance <> 0 THEN
        RAISE EXCEPTION 'wallet columns can only be set by the server';
      END IF;
    ELSIF NEW.coin_balance IS DISTINCT FROM OLD.coin_balance
       OR NEW.total_coins_purchased IS DISTINCT FROM OLD.total_coins_purchased
       OR NEW.promo_balance IS DISTINCT FROM OLD.promo_balance THEN
      RAISE EXCEPTION 'wallet columns can only be changed by the server';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_protect_wallet ON profiles;
CREATE TRIGGER profiles_protect_wallet
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_wallet_columns();

-- ============================================================
-- 2. coin_lots: one lot per paid purchase
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_lots (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revenue_event_id UUID NOT NULL UNIQUE REFERENCES revenue_events(id) ON DELETE RESTRICT,
  coins_total     INTEGER NOT NULL CHECK (coins_total > 0),
  coins_remaining INTEGER NOT NULL CHECK (coins_remaining >= 0 AND coins_remaining <= coins_total),
  gross_cents     INTEGER NOT NULL CHECK (gross_cents >= 0),
  currency        TEXT NOT NULL,
  purchased_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_lots_user_purchased_remaining
  ON coin_lots(user_id, purchased_at, id)
  WHERE coins_remaining > 0;

-- ============================================================
-- 3. coin_spend_allocations: append-only spend attribution
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_spend_allocations (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_transaction_id UUID NOT NULL REFERENCES coin_transactions(id) ON DELETE RESTRICT,
  user_id            UUID NOT NULL,
  game_id            UUID NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  source             TEXT NOT NULL CHECK (source IN ('promo','paid')),
  lot_id             UUID REFERENCES coin_lots(id) ON DELETE RESTRICT,
  coins              INTEGER NOT NULL CHECK (coins > 0),
  coins_offset       INTEGER,
  value_cents        BIGINT NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_spend_allocations_game_created
  ON coin_spend_allocations(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_coin_spend_allocations_lot
  ON coin_spend_allocations(lot_id);
CREATE INDEX IF NOT EXISTS idx_coin_spend_allocations_tx
  ON coin_spend_allocations(coin_transaction_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'coin_spend_allocations_source_shape'
       AND conrelid = 'coin_spend_allocations'::regclass
  ) THEN
    ALTER TABLE coin_spend_allocations
      ADD CONSTRAINT coin_spend_allocations_source_shape CHECK (
        (source = 'promo' AND lot_id IS NULL AND coins_offset IS NULL AND value_cents = 0)
        OR
        (source = 'paid' AND lot_id IS NOT NULL AND coins_offset IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION coin_spend_allocations_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'coin_spend_allocations is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coin_spend_allocations_no_update ON coin_spend_allocations;
CREATE TRIGGER coin_spend_allocations_no_update
  BEFORE UPDATE OR DELETE ON coin_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION coin_spend_allocations_append_only();

-- ============================================================
-- 4. purchase_deductions: append-only net-value adjustments
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_deductions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  revenue_event_id UUID NOT NULL REFERENCES revenue_events(id) ON DELETE RESTRICT,
  kind            TEXT NOT NULL CHECK (kind IN ('tax','processing_fee','refund','chargeback')),
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  external_ref    TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, external_ref)
);

CREATE OR REPLACE FUNCTION purchase_deductions_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'purchase_deductions is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchase_deductions_no_update ON purchase_deductions;
CREATE TRIGGER purchase_deductions_no_update
  BEFORE UPDATE OR DELETE ON purchase_deductions
  FOR EACH ROW EXECUTE FUNCTION purchase_deductions_append_only();

-- ============================================================
-- 5. wallet_migration_state
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_migration_state (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 6. Access control for new tables
-- ============================================================
ALTER TABLE coin_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_spend_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_migration_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON coin_lots FROM anon, authenticated;
REVOKE ALL ON coin_spend_allocations FROM anon, authenticated;
REVOKE ALL ON purchase_deductions FROM anon, authenticated;
REVOKE ALL ON wallet_migration_state FROM anon, authenticated;

-- ============================================================
-- 7. Pure helper: cumulative-floor coin value slicing
-- ============================================================
CREATE OR REPLACE FUNCTION coin_value_slice(
  p_coins_total INTEGER,
  p_gross_cents INTEGER,
  p_offset      INTEGER,
  p_take        INTEGER
) RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_coins_total IS NULL OR p_coins_total <= 0 THEN
    RAISE EXCEPTION 'invalid_slice';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'invalid_slice';
  END IF;
  IF p_take IS NULL OR p_take < 0 THEN
    RAISE EXCEPTION 'invalid_slice';
  END IF;
  IF p_offset + p_take > p_coins_total THEN
    RAISE EXCEPTION 'invalid_slice';
  END IF;

  RETURN FLOOR(((p_offset + p_take)::numeric * p_gross_cents) / p_coins_total)
       - FLOOR((p_offset::numeric * p_gross_cents) / p_coins_total);
END;
$$;

REVOKE ALL ON FUNCTION coin_value_slice(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION coin_value_slice(INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- 8. credit_coin_purchase: also create the coin lot
-- ============================================================
DROP FUNCTION IF EXISTS credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ);

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
  v_rev_id  UUID;
  v_rev_created_at TIMESTAMPTZ;
BEGIN
  IF p_coins IS NULL OR p_coins <= 0 THEN
    RAISE EXCEPTION 'invalid_coins';
  END IF;
  IF p_session_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'missing_ids';
  END IF;
  IF p_gross_cents IS NULL OR p_gross_cents < 0 THEN
    RAISE EXCEPTION 'invalid_gross';
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
     p_payment_intent_id, v_tx_id, p_terms_version, p_terms_accepted_at)
  RETURNING id, created_at INTO v_rev_id, v_rev_created_at;

  INSERT INTO coin_lots
    (user_id, revenue_event_id, coins_total, coins_remaining,
     gross_cents, currency, purchased_at)
  VALUES
    (p_user_id, v_rev_id, p_coins, p_coins,
     p_gross_cents, p_currency, v_rev_created_at);

  RETURN jsonb_build_object('status', 'credited', 'balance_after', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

-- ============================================================
-- 9. spend_coins: free-first, lot attribution
-- ============================================================
DROP FUNCTION IF EXISTS spend_coins(UUID, UUID, INTEGER, TEXT, TEXT);

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
  v_balance       INTEGER;
  v_promo_balance INTEGER;
  v_existing      coin_transactions%ROWTYPE;
  v_promo_use     INTEGER;
  v_need          INTEGER;
  v_tx_id         UUID;
  v_lot           coin_lots%ROWTYPE;
  v_take          INTEGER;
  v_offset        INTEGER;
  v_value         BIGINT;
  v_promo_spent   BIGINT;
  v_paid_spent    BIGINT;
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL THEN RAISE EXCEPTION 'missing_ids'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  -- Row lock: every wallet operation for this player is serialized from here
  SELECT coin_balance, promo_balance INTO v_balance, v_promo_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM coin_transactions
     WHERE game_id = p_game_id AND type = 'spend' AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.user_id IS DISTINCT FROM p_user_id OR v_existing.amount <> -p_amount THEN
        RAISE EXCEPTION 'idempotency_key_conflict';
      END IF;
      SELECT COALESCE(SUM(coins) FILTER (WHERE source = 'promo'), 0),
             COALESCE(SUM(coins) FILTER (WHERE source = 'paid'), 0)
        INTO v_promo_spent, v_paid_spent
        FROM coin_spend_allocations
       WHERE coin_transaction_id = v_existing.id;
      RETURN jsonb_build_object(
        'status', 'replayed',
        'balance', v_existing.balance_after,
        'promo_spent', v_promo_spent,
        'paid_spent', v_paid_spent
      );
    END IF;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient', 'balance', v_balance);
  END IF;

  v_promo_use := LEAST(v_promo_balance, p_amount);
  v_need := p_amount - v_promo_use;

  UPDATE profiles
     SET coin_balance = coin_balance - p_amount,
         promo_balance = promo_balance - v_promo_use,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'spend', -p_amount, v_balance, p_reason, p_game_id, p_idempotency_key)
  RETURNING id INTO v_tx_id;

  IF v_promo_use > 0 THEN
    INSERT INTO coin_spend_allocations
      (coin_transaction_id, user_id, game_id, source, coins)
    VALUES
      (v_tx_id, p_user_id, p_game_id, 'promo', v_promo_use);
  END IF;

  -- Consume paid lots oldest first
  FOR v_lot IN
    SELECT * FROM coin_lots
     WHERE user_id = p_user_id AND coins_remaining > 0
     ORDER BY purchased_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_need = 0;
    v_take := LEAST(v_lot.coins_remaining, v_need);
    v_offset := v_lot.coins_total - v_lot.coins_remaining;
    v_value := coin_value_slice(v_lot.coins_total, v_lot.gross_cents, v_offset, v_take);

    INSERT INTO coin_spend_allocations
      (coin_transaction_id, user_id, game_id, source, lot_id, coins, coins_offset, value_cents)
    VALUES
      (v_tx_id, p_user_id, p_game_id, 'paid', v_lot.id, v_take, v_offset, v_value);

    UPDATE coin_lots
       SET coins_remaining = coins_remaining - v_take
     WHERE id = v_lot.id;

    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'wallet_inconsistent';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'balance', v_balance,
    'promo_spent', v_promo_use,
    'paid_spent', p_amount - v_promo_use
  );
END;
$$;

REVOKE ALL ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================
-- 10. award_coins: free promo coins
-- ============================================================
DROP FUNCTION IF EXISTS award_coins(UUID, UUID, INTEGER, TEXT, TEXT);

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
     SET coin_balance = coin_balance + p_amount,
         promo_balance = promo_balance + p_amount,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'award', p_amount, v_balance, p_reason, p_game_id, p_idempotency_key);

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================
-- 11. record_purchase_deduction
-- ============================================================
CREATE OR REPLACE FUNCTION record_purchase_deduction(
  p_revenue_event_id UUID,
  p_kind             TEXT,
  p_amount_cents     INTEGER,
  p_external_ref     TEXT,
  p_void_coins       INTEGER DEFAULT 0,
  p_note             TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot        coin_lots%ROWTYPE;
  v_existing   purchase_deductions%ROWTYPE;
  v_total_ded  BIGINT;
  v_void       INTEGER;
  v_balance    INTEGER;
  v_tx_id      UUID;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('tax','processing_fee','refund','chargeback') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  IF p_external_ref IS NULL OR p_external_ref = '' THEN
    RAISE EXCEPTION 'missing_ref';
  END IF;
  IF p_void_coins IS NULL OR p_void_coins < 0 THEN
    RAISE EXCEPTION 'invalid_void_coins';
  END IF;
  IF p_void_coins > 0 AND p_kind NOT IN ('refund','chargeback') THEN
    RAISE EXCEPTION 'invalid_void_coins';
  END IF;

  SELECT * INTO v_lot FROM coin_lots WHERE revenue_event_id = p_revenue_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lot_not_found';
  END IF;

  -- Lock profile first (if lot has a user), then the lot
  IF v_lot.user_id IS NOT NULL THEN
    PERFORM 1 FROM profiles WHERE id = v_lot.user_id FOR UPDATE;
  END IF;
  SELECT * INTO v_lot FROM coin_lots WHERE id = v_lot.id FOR UPDATE;

  -- Idempotency by (kind, external_ref)
  SELECT * INTO v_existing FROM purchase_deductions
   WHERE kind = p_kind AND external_ref = p_external_ref;
  IF FOUND THEN
    IF v_existing.revenue_event_id IS DISTINCT FROM p_revenue_event_id
       OR v_existing.amount_cents <> p_amount_cents THEN
      RAISE EXCEPTION 'deduction_conflict';
    END IF;
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_ded
    FROM purchase_deductions
   WHERE revenue_event_id = p_revenue_event_id;

  IF v_total_ded + p_amount_cents > v_lot.gross_cents THEN
    RAISE EXCEPTION 'deduction_exceeds_gross';
  END IF;

  INSERT INTO purchase_deductions
    (revenue_event_id, kind, amount_cents, external_ref, note)
  VALUES
    (p_revenue_event_id, p_kind, p_amount_cents, p_external_ref, p_note);

  v_void := CASE WHEN v_lot.user_id IS NULL THEN 0 ELSE LEAST(p_void_coins, v_lot.coins_remaining) END;
  IF v_void > 0 THEN
    UPDATE coin_lots
       SET coins_remaining = coins_remaining - v_void
     WHERE id = v_lot.id;

    UPDATE profiles
       SET coin_balance = coin_balance - v_void,
           updated_at = NOW()
     WHERE id = v_lot.user_id
     RETURNING coin_balance INTO v_balance;

    INSERT INTO coin_transactions
      (user_id, type, amount, balance_after, description)
    VALUES
      (v_lot.user_id, 'refund', -v_void, v_balance,
       'Voided coins from purchase refund/chargeback')
    RETURNING id INTO v_tx_id;
  END IF;

  RETURN jsonb_build_object('status', 'recorded', 'voided_coins', v_void);
END;
$$;

REVOKE ALL ON FUNCTION record_purchase_deduction(UUID, TEXT, INTEGER, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_purchase_deduction(UUID, TEXT, INTEGER, TEXT, INTEGER, TEXT) TO service_role;

-- ============================================================
-- 12. developer_earnings: point-in-time report
-- ============================================================
CREATE OR REPLACE FUNCTION developer_earnings(
  p_game_id    UUID DEFAULT NULL,
  p_from       TIMESTAMPTZ DEFAULT NULL,
  p_to         TIMESTAMPTZ DEFAULT NULL,
  p_share_bps  INTEGER DEFAULT 6500
) RETURNS TABLE(
  game_id                  UUID,
  paid_coins_spent         BIGINT,
  promo_coins_spent        BIGINT,
  gross_paid_value_cents   BIGINT,
  net_paid_value_cents     BIGINT,
  developer_share_cents    BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game  UUID;
  v_paid  BIGINT;
  v_promo BIGINT;
  v_gross BIGINT;
  v_net   BIGINT;
  v_share BIGINT;
BEGIN
  IF p_share_bps IS NULL OR p_share_bps < 0 OR p_share_bps > 10000 THEN
    RAISE EXCEPTION 'invalid_share_bps';
  END IF;

  FOR v_game, v_paid, v_promo, v_gross, v_net IN
    WITH allocs AS (
      SELECT a.game_id,
             a.source,
             a.coins,
             a.value_cents,
             a.lot_id,
             a.coins_offset,
             l.coins_total,
             l.gross_cents,
             l.revenue_event_id
        FROM coin_spend_allocations a
        LEFT JOIN coin_lots l ON l.id = a.lot_id
       WHERE (p_game_id IS NULL OR a.game_id = p_game_id)
         AND (p_from IS NULL OR a.created_at >= p_from)
         AND (p_to IS NULL OR a.created_at < p_to)
    ),
    lot_nets AS (
      SELECT l.id,
             GREATEST(l.gross_cents - COALESCE(SUM(d.amount_cents), 0), 0)::INTEGER AS net_cents
        FROM coin_lots l
        LEFT JOIN purchase_deductions d ON d.revenue_event_id = l.revenue_event_id
       GROUP BY l.id, l.gross_cents
    )
    SELECT a.game_id,
           COALESCE(SUM(a.coins) FILTER (WHERE a.source = 'paid'), 0) AS paid_coins,
           COALESCE(SUM(a.coins) FILTER (WHERE a.source = 'promo'), 0) AS promo_coins,
           COALESCE(SUM(a.value_cents) FILTER (WHERE a.source = 'paid'), 0) AS gross_value,
           COALESCE(SUM(
             CASE WHEN a.source = 'paid' THEN
               coin_value_slice(a.coins_total, ln.net_cents::INTEGER, a.coins_offset, a.coins)
             ELSE 0 END
           ), 0) AS net_value
      FROM allocs a
      LEFT JOIN lot_nets ln ON ln.id = a.lot_id
     GROUP BY a.game_id
  LOOP
    game_id := v_game;
    paid_coins_spent := v_paid;
    promo_coins_spent := v_promo;
    gross_paid_value_cents := v_gross;
    net_paid_value_cents := v_net;
    developer_share_cents := FLOOR(v_net * p_share_bps / 10000);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION developer_earnings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION developer_earnings(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;

-- ============================================================
-- 13. wallet_consistency_report
-- ============================================================
CREATE OR REPLACE FUNCTION wallet_consistency_report()
RETURNS TABLE(
  user_id        UUID,
  coin_balance   INTEGER,
  promo_balance  INTEGER,
  lots_remaining BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id,
         p.coin_balance,
         p.promo_balance,
         COALESCE(SUM(l.coins_remaining), 0) AS lots_remaining
    FROM profiles p
    LEFT JOIN coin_lots l ON l.user_id = p.id
   GROUP BY p.id, p.coin_balance, p.promo_balance
  HAVING p.coin_balance <> p.promo_balance + COALESCE(SUM(l.coins_remaining), 0);
END;
$$;

REVOKE ALL ON FUNCTION wallet_consistency_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet_consistency_report() TO service_role;

-- ============================================================
-- 14. One-time backfill
-- ============================================================
DO $$
DECLARE
  v_lot_count     INTEGER := 0;
  v_profile_count INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_migration_state WHERE name = 'coin_lots_backfill_v1') THEN
    RETURN;
  END IF;

  LOCK TABLE profiles, revenue_events, coin_lots IN EXCLUSIVE MODE;

  -- Create lots for every coin_purchase revenue event with coins_credited > 0.
  -- Lots whose revenue event user_id IS NULL get coins_remaining 0.
  WITH new_lots AS (
    INSERT INTO coin_lots
      (user_id, revenue_event_id, coins_total, coins_remaining,
       gross_cents, currency, purchased_at)
    SELECT re.user_id,
           re.id,
           re.coins_credited,
           CASE WHEN re.user_id IS NULL THEN 0 ELSE re.coins_credited END,
           re.gross_cents,
           re.currency,
           re.created_at
      FROM revenue_events re
     WHERE re.event_type = 'coin_purchase'
       AND re.coins_credited > 0
    ON CONFLICT (revenue_event_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_lot_count FROM new_lots;

  -- Fix lots: to_remove = credited - LEAST(balance, credited) is taken from
  -- the user's lots oldest first.
  WITH per_user AS (
    SELECT l.user_id,
           SUM(l.coins_total)::BIGINT AS credited
      FROM coin_lots l
     WHERE l.user_id IS NOT NULL
     GROUP BY l.user_id
  ),
  plan AS (
    SELECT l.id,
           l.coins_total,
           GREATEST(0, LEAST(l.coins_total::BIGINT,
             (pu.credited - LEAST(p.coin_balance::BIGINT, pu.credited))
             - COALESCE(SUM(l.coins_total) OVER (
                 PARTITION BY l.user_id
                 ORDER BY l.purchased_at, l.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
               ), 0)))::INTEGER AS consumed
      FROM coin_lots l
      JOIN per_user pu ON pu.user_id = l.user_id
      JOIN profiles p ON p.id = l.user_id
  )
  UPDATE coin_lots c
     SET coins_remaining = pl.coins_total - pl.consumed
    FROM plan pl
   WHERE pl.id = c.id;

  UPDATE coin_lots
     SET coins_remaining = 0
   WHERE user_id IS NULL;

  -- Set promo_balance for ALL profiles (including users with no purchases).
  UPDATE profiles p
     SET promo_balance = p.coin_balance - COALESCE(
           (SELECT SUM(l.coins_remaining) FROM coin_lots l WHERE l.user_id = p.id),
           0
         );
  GET DIAGNOSTICS v_profile_count = ROW_COUNT;

  INSERT INTO wallet_migration_state (name) VALUES ('coin_lots_backfill_v1');

  RAISE NOTICE 'coin_lots backfill: created % lots, set promo_balance for % profiles', v_lot_count, v_profile_count;
END;
$$;

-- ============================================================
-- 15. Invariant constraint (after backfill)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_promo_le_balance'
       AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_promo_le_balance CHECK (promo_balance <= coin_balance);
  END IF;
END;
$$;

COMMIT;
