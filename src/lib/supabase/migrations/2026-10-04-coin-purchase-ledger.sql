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
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
  p_description        TEXT
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
     stripe_payment_intent_id, coin_transaction_id)
  VALUES
    ('coin_purchase', p_user_id, p_package_id, p_gross_cents, p_currency, p_coins,
     COALESCE(p_bonus_coins, 0), p_event_id, p_session_id,
     p_payment_intent_id, v_tx_id);

  RETURN jsonb_build_object('status', 'credited', 'balance_after', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION credit_coin_purchase(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT)
  TO service_role;
