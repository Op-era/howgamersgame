-- Sequential behaviour of spend_coins() / award_coins(). Scratch DB only.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'p1@test.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'p2@test.invalid');
INSERT INTO games (id, slug, title, game_url) VALUES
  ('99999999-9999-4999-8999-999999999999', 'g1', 'G1', 'https://g1.test'),
  ('88888888-8888-4888-8888-888888888888', 'g2', 'G2', 'https://g2.test');
UPDATE profiles SET coin_balance = 100 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $$
DECLARE
  u1 uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  u2 uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  g1 uuid := '99999999-9999-4999-8999-999999999999';
  g2 uuid := '88888888-8888-4888-8888-888888888888';
  r jsonb;
BEGIN
  -- spend: ok, ledger row has game + negative amount
  r := spend_coins(u1, g1, 30, 'upgrade', 'k-spend-1');
  ASSERT r->>'status' = 'ok' AND (r->>'balance')::int = 70, 'spend 1: ' || r;
  ASSERT (SELECT amount FROM coin_transactions WHERE idempotency_key = 'k-spend-1' AND game_id = g1 AND type = 'spend') = -30, 'ledger row';
  -- replay: same key, same args => same answer, no second deduction
  r := spend_coins(u1, g1, 30, 'upgrade', 'k-spend-1');
  ASSERT r->>'status' = 'replayed' AND (r->>'balance')::int = 70, 'replay: ' || r;
  ASSERT (SELECT coin_balance FROM profiles WHERE id = u1) = 70, 'replay changed balance';
  -- same key, different amount or user => conflict, nothing changes
  BEGIN PERFORM spend_coins(u1, g1, 31, 'x', 'k-spend-1'); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'idempotency_key_conflict', SQLERRM; END;
  BEGIN PERFORM spend_coins(u2, g1, 30, 'x', 'k-spend-1'); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM IN ('idempotency_key_conflict'), SQLERRM; END;
  -- same key from another game is a different operation
  r := spend_coins(u1, g2, 10, 'other game', 'k-spend-1');
  ASSERT r->>'status' = 'ok' AND (r->>'balance')::int = 60, 'other game same key: ' || r;
  -- insufficient: no change, no ledger row
  r := spend_coins(u1, g1, 61, 'too much', 'k-big');
  ASSERT r->>'status' = 'insufficient' AND (r->>'balance')::int = 60, 'insufficient: ' || r;
  ASSERT NOT EXISTS (SELECT 1 FROM coin_transactions WHERE idempotency_key = 'k-big'), 'ledger row for failed spend';
  -- exact balance is allowed, goes to 0, never below
  r := spend_coins(u1, g1, 60, 'all in', NULL);
  ASSERT r->>'status' = 'ok' AND (r->>'balance')::int = 0, 'spend all: ' || r;
  r := spend_coins(u1, g1, 1, 'broke', NULL);
  ASSERT r->>'status' = 'insufficient', 'broke: ' || r;
  -- validation
  BEGIN PERFORM spend_coins(u1, g1, 0, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_amount'; END;
  BEGIN PERFORM spend_coins(u1, g1, -5, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_amount'; END;
  BEGIN PERFORM spend_coins(u1, g1, NULL, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_amount'; END;
  BEGIN PERFORM spend_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', g1, 5, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'user_not_found'; END;
  BEGIN PERFORM spend_coins(u1, NULL, 5, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'missing_ids'; END;

  -- award
  r := award_coins(u1, g1, 50, 'daily', 'k-award-1');
  ASSERT r->>'status' = 'ok' AND (r->>'balance')::int = 50, 'award: ' || r;
  r := award_coins(u1, g1, 50, 'daily', 'k-award-1');
  ASSERT r->>'status' = 'replayed' AND (r->>'balance')::int = 50, 'award replay: ' || r;
  ASSERT (SELECT coin_balance FROM profiles WHERE id = u1) = 50, 'award replay changed balance';
  -- an award key and a spend key never collide
  r := spend_coins(u1, g1, 5, 'x', 'k-award-1');
  ASSERT r->>'status' = 'ok', 'spend with award key: ' || r;
  BEGIN PERFORM award_coins(u1, g1, 51, 'x', 'k-award-1'); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'idempotency_key_conflict'; END;
  -- caps
  BEGIN PERFORM award_coins(u1, g1, 10001, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_amount'; END;
  r := award_coins(u1, g1, 10000, 'max', NULL);
  ASSERT r->>'status' = 'ok', 'max award';
  BEGIN PERFORM award_coins(u1, g1, 0, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_amount'; END;
  BEGIN PERFORM award_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', g1, 5, 'x', NULL); ASSERT false; EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'user_not_found'; END;
  -- awards do not count as purchases
  ASSERT (SELECT total_coins_purchased FROM profiles WHERE id = u1) = 0, 'award counted as purchased';
  -- ledger balances: sum of ledger amounts + opening 100 = balance
  ASSERT (SELECT coin_balance FROM profiles WHERE id = u1) = 100 + (SELECT sum(amount) FROM coin_transactions WHERE user_id = u1), 'ledger does not balance';
END $$;

-- players cannot call the functions, even for themselves
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM award_coins('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', 5000, 'self award', NULL);
  RAISE EXCEPTION 'authenticated could award coins';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
DO $$ BEGIN
  PERFORM spend_coins('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '99999999-9999-4999-8999-999999999999', 1, 'x', NULL);
  RAISE EXCEPTION 'authenticated could spend coins';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM award_coins('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', 5000, 'self award', NULL);
  RAISE EXCEPTION 'anon could award coins';
EXCEPTION WHEN insufficient_privilege THEN NULL; END $$;
RESET ROLE;
-- service role can
SET LOCAL ROLE service_role;
SELECT (award_coins('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '99999999-9999-4999-8999-999999999999', 7, 'ok', NULL))->>'status' AS service_role_award;
RESET ROLE;
ROLLBACK;
\echo PASS: spend and award sequential checks
