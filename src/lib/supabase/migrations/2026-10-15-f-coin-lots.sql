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
     WHERE conname = 'coin_spend_allocations_source_check'
       AND conrelid = 'coin_spend_allocations'::regclass
  ) THEN
    ALTER TABLE coin_spend_allocations
      ADD CONSTRAINT coin_spend_allocations_source_check CHECK (
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

  v_void := LEAST(p_void_coins, v_lot.coins_remaining);
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
             GREATEST(l.gross_cents - COALESCE(SUM(d.amount_cents), 0), 0) AS net_cents
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
               coin_value_slice(a.coins_total, ln.net_cents, a.coins_offset, a.coins)
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
  v_lot_id        UUID;
  v_lot_user_id   UUID;
  v_lot_remaining INTEGER;
  v_take          INTEGER;
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

  -- Split each existing balance: paid_remaining = LEAST(coin_balance, total
  -- coins credited by that user's coin_purchase revenue_events);
  -- promo_balance = coin_balance - paid_remaining.
  WITH totals AS (
    SELECT re.user_id,
           SUM(re.coins_credited)::BIGINT AS total_credited
      FROM revenue_events re
     WHERE re.event_type = 'coin_purchase'
       AND re.user_id IS NOT NULL
     GROUP BY re.user_id
  ),
  updated AS (
    UPDATE profiles p
       SET promo_balance = GREATEST(p.coin_balance - LEAST(p.coin_balance::BIGINT, t.total_credited)::INTEGER, 0)
      FROM totals t
     WHERE t.user_id = p.id
       AND p.coin_balance > LEAST(p.coin_balance::BIGINT, t.total_credited)::INTEGER
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_profile_count FROM updated;

  -- Remove coins_credited - paid_remaining from each user's lots oldest first,
  -- so remaining lots = paid_remaining.
  FOR v_lot_id, v_lot_user_id, v_lot_remaining IN
    SELECT l.id,
           l.user_id,
           l.coins_remaining
      FROM coin_lots l
      JOIN profiles p ON p.id = l.user_id
     WHERE l.coins_remaining > 0
       AND p.promo_balance > 0
     ORDER BY l.user_id, l.purchased_at ASC, l.id ASC
     FOR UPDATE OF l
  LOOP
    SELECT LEAST(v_lot_remaining, p.promo_balance) INTO v_take
      FROM profiles p WHERE p.id = v_lot_user_id;

    IF v_take > 0 THEN
      UPDATE coin_lots
         SET coins_remaining = coins_remaining - v_take
       WHERE id = v_lot_id;

      UPDATE profiles
         SET promo_balance = promo_balance - v_take
       WHERE id = v_lot_user_id;
    END IF;
  END LOOP;

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
