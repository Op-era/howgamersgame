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
