-- ============================================================
-- Promo grants: per-grant expiry, paid-first spending, grandfathering.
-- Safe to re-run. Apply in one transaction during a quiet window.
--
-- Rules implemented:
--   * Paid coin lots never expire.
--   * Free promo coins expire 30 days after EACH grant (including the starter
--     grant). Promo coins are tracked per grant in promo_grants.
--     30 days is implemented as exactly 720 hours (no daylight saving dependence).
--     30 days is implemented as exactly 720 hours (no daylight saving dependence).
--     30 days is implemented as exactly 720 hours (no daylight saving dependence).
--     profiles.promo_balance stays as the DERIVED total = sum of
--     coins_remaining of grants that are not swept (swept_at IS NULL).
--     Invariant stays coin_balance = promo_balance + sum(coin_lots.coins_remaining).
--   * SPEND ORDER CHANGED: paid lots first (oldest purchase first,
--     ORDER BY purchased_at, id), THEN promo grants, soonest-expiring first
--     (ORDER BY expires_at, id). Spending ignores grants with
--     expires_at <= NOW() or swept_at IS NOT NULL even if not yet swept.
--   * Grandfather rule: existing promo_balance at migration time becomes one
--     promo grant with source 'grandfather' and a fresh 30-day expiry.
--   * This migration is not applied anywhere yet.
--
-- Rollback: drop promo_expirations and promo_grants, drop column
-- coin_spend_allocations.promo_grant_id and profiles.starter_granted_at,
-- and restore spend_coins / award_coins / wallet_consistency_report from
-- migration f (coin_balance is never changed by this migration).
-- ============================================================

BEGIN;

-- ============================================================
-- 1. profiles: starter_granted_at column
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS starter_granted_at TIMESTAMPTZ;

-- ============================================================
-- 2. promo_grants: one row per promo grant
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_grants (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  coins_granted      INTEGER NOT NULL CHECK (coins_granted > 0),
  coins_remaining    INTEGER NOT NULL CHECK (coins_remaining >= 0 AND coins_remaining <= coins_granted),
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('award','starter','grandfather')),
  reason             TEXT,
  coin_transaction_id UUID REFERENCES coin_transactions(id) ON DELETE SET NULL,
  swept_at           TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at = granted_at + INTERVAL '720 hours')
);

CREATE INDEX IF NOT EXISTS idx_promo_grants_user_expires
  ON promo_grants(user_id, expires_at, id)
  WHERE swept_at IS NULL AND coins_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_promo_grants_expires
  ON promo_grants(expires_at)
  WHERE swept_at IS NULL;

ALTER TABLE promo_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promo_grants FROM anon, authenticated;

-- ============================================================
-- 3. promo_expirations: append-only sweep records
-- ============================================================
CREATE TABLE IF NOT EXISTS promo_expirations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grant_id      UUID NOT NULL REFERENCES promo_grants(id) ON DELETE RESTRICT,
  user_id       UUID,
  coins_expired INTEGER NOT NULL CHECK (coins_expired > 0),
  expires_at    TIMESTAMPTZ NOT NULL,
  swept_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grant_id)
);

CREATE OR REPLACE FUNCTION promo_expirations_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'promo_expirations is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS promo_expirations_no_update ON promo_expirations;
CREATE TRIGGER promo_expirations_no_update
  BEFORE UPDATE OR DELETE ON promo_expirations
  FOR EACH ROW EXECUTE FUNCTION promo_expirations_append_only();

ALTER TABLE promo_expirations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON promo_expirations FROM anon, authenticated;

-- ============================================================
-- 4. coin_spend_allocations: promo_grant_id column + constraint
-- ============================================================
ALTER TABLE coin_spend_allocations
  ADD COLUMN IF NOT EXISTS promo_grant_id UUID REFERENCES promo_grants(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_coin_spend_allocations_promo_grant
  ON coin_spend_allocations(promo_grant_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'coin_spend_allocations_paid_no_grant'
       AND conrelid = 'coin_spend_allocations'::regclass
  ) THEN
    ALTER TABLE coin_spend_allocations
      ADD CONSTRAINT coin_spend_allocations_paid_no_grant
      CHECK (source <> 'paid' OR promo_grant_id IS NULL);
  END IF;
END;
$$;

-- ============================================================
-- 5. create_promo_grant: internal helper
-- ============================================================
CREATE OR REPLACE FUNCTION create_promo_grant(
  p_user_id          UUID,
  p_amount           INTEGER,
  p_source           TEXT,
  p_reason           TEXT,
  p_game_id          UUID,
  p_idempotency_key  TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_tx_id   UUID;
BEGIN
  SELECT coin_balance INTO v_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF v_balance::BIGINT + p_amount > 2000000000 THEN
    RAISE EXCEPTION 'balance_limit';
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance + p_amount,
         promo_balance = promo_balance + p_amount,
         updated_at = NOW()
   WHERE id = p_user_id
   RETURNING coin_balance INTO v_balance;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'award', p_amount, v_balance, p_reason, p_game_id, p_idempotency_key)
  RETURNING id INTO v_tx_id;

  INSERT INTO promo_grants
    (user_id, coins_granted, coins_remaining, granted_at, expires_at,
     source, reason, coin_transaction_id)
  VALUES
    (p_user_id, p_amount, p_amount, NOW(), NOW() + INTERVAL '720 hours',
     p_source, p_reason, v_tx_id);

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION create_promo_grant(UUID, INTEGER, TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. award_coins: free promo coins via create_promo_grant
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

  v_balance := create_promo_grant(p_user_id, p_amount, 'award', p_reason, p_game_id, p_idempotency_key);

  RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION award_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================
-- 7. grant_starter_coins
-- ============================================================
CREATE OR REPLACE FUNCTION grant_starter_coins(
  p_user_id UUID,
  p_amount  INTEGER DEFAULT 3
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starter_granted_at TIMESTAMPTZ;
  v_balance            INTEGER;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_ids'; END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  SELECT starter_granted_at INTO v_starter_granted_at
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF v_starter_granted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_granted');
  END IF;

  v_balance := create_promo_grant(p_user_id, p_amount, 'starter', 'Starter coins', NULL, NULL);

  UPDATE profiles
     SET starter_granted_at = NOW()
   WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'granted',
    'balance', v_balance,
    'amount', p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION grant_starter_coins(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_starter_coins(UUID, INTEGER) TO service_role;

-- ============================================================
-- 8. spend_coins: paid lots first, then promo grants
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
  v_paid_avail    BIGINT;
  v_promo_avail   BIGINT;
  v_need          INTEGER;
  v_tx_id         UUID;
  v_lot           coin_lots%ROWTYPE;
  v_grant         promo_grants%ROWTYPE;
  v_take          INTEGER;
  v_offset        INTEGER;
  v_value         BIGINT;
  v_promo_used    INTEGER := 0;
  v_new_balance   INTEGER;
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

  SELECT COALESCE(SUM(coins_remaining), 0) INTO v_paid_avail
    FROM coin_lots
   WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(coins_remaining), 0) INTO v_promo_avail
    FROM promo_grants
   WHERE user_id = p_user_id
     AND swept_at IS NULL
     AND expires_at > NOW();

  IF v_paid_avail + v_promo_avail < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient', 'balance', v_paid_avail + v_promo_avail);
  END IF;

  v_need := p_amount;
  v_new_balance := v_balance - p_amount;

  INSERT INTO coin_transactions
    (user_id, type, amount, balance_after, description, game_id, idempotency_key)
  VALUES
    (p_user_id, 'spend', -p_amount, v_new_balance, p_reason, p_game_id, p_idempotency_key)
  RETURNING id INTO v_tx_id;

  -- Consume paid lots oldest first
  FOR v_lot IN
    SELECT * FROM coin_lots
     WHERE user_id = p_user_id AND coins_remaining > 0
     ORDER BY purchased_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_need = 0;
    v_take := LEAST(v_lot.coins_remaining, v_need);
    v_offset := v_lot.coins_total - v_lot.coins_remaining - v_lot.coins_voided;
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

  -- Consume promo grants soonest-expiring first
  IF v_need > 0 THEN
    FOR v_grant IN
      SELECT * FROM promo_grants
       WHERE user_id = p_user_id
         AND swept_at IS NULL
         AND expires_at > NOW()
         AND coins_remaining > 0
       ORDER BY expires_at ASC, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_need = 0;
      v_take := LEAST(v_grant.coins_remaining, v_need);

      INSERT INTO coin_spend_allocations
        (coin_transaction_id, user_id, game_id, source, coins, promo_grant_id)
      VALUES
        (v_tx_id, p_user_id, p_game_id, 'promo', v_take, v_grant.id);

      UPDATE promo_grants
         SET coins_remaining = coins_remaining - v_take
       WHERE id = v_grant.id;

      v_promo_used := v_promo_used + v_take;
      v_need := v_need - v_take;
    END LOOP;
  END IF;

  IF v_need > 0 THEN
    RAISE EXCEPTION 'wallet_inconsistent';
  END IF;

  UPDATE profiles
     SET coin_balance = coin_balance - p_amount,
         promo_balance = promo_balance - v_promo_used,
         updated_at = NOW()
   WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'balance', v_new_balance,
    'promo_spent', v_promo_used,
    'paid_spent', p_amount - v_promo_used
  );
END;
$$;

REVOKE ALL ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_coins(UUID, UUID, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================================
-- 9. expire_promo_coins: sweep expired grants
-- ============================================================
CREATE OR REPLACE FUNCTION expire_promo_coins(
  p_now TIMESTAMPTZ DEFAULT NOW()
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u            UUID;
  g            promo_grants%ROWTYPE;
  v_total      INTEGER;
  v_users      INTEGER := 0;
  v_grants     INTEGER := 0;
  v_all_coins  BIGINT := 0;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
      FROM promo_grants
     WHERE swept_at IS NULL
       AND expires_at <= p_now
       AND user_id IS NOT NULL
     ORDER BY user_id
  LOOP
    -- Lock profile first
    PERFORM 1 FROM profiles WHERE id = u FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_total := 0;

    FOR g IN
      SELECT * FROM promo_grants
       WHERE user_id = u
         AND swept_at IS NULL
         AND expires_at <= p_now
       ORDER BY expires_at, id
       FOR UPDATE
    LOOP
      IF g.coins_remaining > 0 THEN
        INSERT INTO promo_expirations
          (grant_id, user_id, coins_expired, expires_at, swept_at)
        VALUES
          (g.id, u, g.coins_remaining, g.expires_at, p_now);

        v_total := v_total + g.coins_remaining;
        v_grants := v_grants + 1;
      END IF;

      UPDATE promo_grants
         SET coins_remaining = 0,
             swept_at = p_now
       WHERE id = g.id;
    END LOOP;

    IF v_total > 0 THEN
      UPDATE profiles
         SET coin_balance = coin_balance - v_total,
             promo_balance = promo_balance - v_total,
             updated_at = NOW()
       WHERE id = u;

      v_all_coins := v_all_coins + v_total;
      v_users := v_users + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'users_swept', v_users,
    'grants_swept', v_grants,
    'coins_expired', v_all_coins
  );
END;
$$;

REVOKE ALL ON FUNCTION expire_promo_coins(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION expire_promo_coins(TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 10. wallet_consistency_report
-- ============================================================
DROP FUNCTION IF EXISTS wallet_consistency_report();

CREATE OR REPLACE FUNCTION wallet_consistency_report()
RETURNS TABLE(
  user_id        UUID,
  coin_balance   INTEGER,
  promo_balance  INTEGER,
  lots_remaining BIGINT,
  grants_remaining BIGINT
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
         COALESCE((SELECT SUM(l.coins_remaining) FROM coin_lots l WHERE l.user_id = p.id), 0) AS lots_remaining,
         COALESCE((SELECT SUM(g.coins_remaining) FROM promo_grants g WHERE g.user_id = p.id AND g.swept_at IS NULL), 0) AS grants_remaining
    FROM profiles p
   WHERE p.coin_balance <> p.promo_balance
           + COALESCE((SELECT SUM(l.coins_remaining) FROM coin_lots l WHERE l.user_id = p.id), 0)
      OR p.promo_balance <> COALESCE((SELECT SUM(g.coins_remaining) FROM promo_grants g WHERE g.user_id = p.id AND g.swept_at IS NULL), 0);
END;
$$;

REVOKE ALL ON FUNCTION wallet_consistency_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wallet_consistency_report() TO service_role;

-- ============================================================
-- 11. One-time grandfather backfill
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wallet_migration_state WHERE name = 'promo_grants_backfill_v1') THEN
    RETURN;
  END IF;

  LOCK TABLE profiles, promo_grants IN EXCLUSIVE MODE;

  INSERT INTO promo_grants
    (user_id, coins_granted, coins_remaining, granted_at, expires_at,
     source, reason)
  SELECT p.id,
         p.promo_balance,
         p.promo_balance,
         NOW(),
         NOW() + INTERVAL '720 hours',
         'grandfather',
         'Grandfathered promo balance'
    FROM profiles p
   WHERE p.promo_balance > 0;

  INSERT INTO wallet_migration_state (name) VALUES ('promo_grants_backfill_v1');
END;
$$;

COMMIT;
