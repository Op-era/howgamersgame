-- Verifies credit_coin_purchase() and the wallet protection trigger.
-- Run against a scratch Postgres that has schema.sql + both 2026-10-04 migrations applied
-- (and Supabase's auth.users / auth.role() / roles stubbed). NEVER run against production.
-- Usage: psql -d scratch -v ON_ERROR_STOP=1 -f tests/sql/coin-purchase.sql
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'a@test.invalid');
SELECT id FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111' \gset

DO $$
DECLARE r jsonb; bal int; n int;
BEGIN
  -- 1. first delivery credits
  r := credit_coin_purchase('evt_1','checkout.session.completed','cs_1','pi_1','11111111-1111-1111-1111-111111111111','player',550,50,500,'usd','Purchased Player pack');
  ASSERT r->>'status' = 'credited' AND (r->>'balance_after')::int = 550, 'first credit: ' || r;
  -- 2. same event again: no double credit
  r := credit_coin_purchase('evt_1','checkout.session.completed','cs_1','pi_1','11111111-1111-1111-1111-111111111111','player',550,50,500,'usd','x');
  ASSERT r->>'status' = 'duplicate_event', 'dup event: ' || r;
  -- 3. different event, same session (completed + async_payment_succeeded)
  r := credit_coin_purchase('evt_2','checkout.session.async_payment_succeeded','cs_1','pi_1','11111111-1111-1111-1111-111111111111','player',550,50,500,'usd','x');
  ASSERT r->>'status' = 'duplicate_session', 'dup session: ' || r;
  SELECT coin_balance INTO bal FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  ASSERT bal = 550, 'balance after dups = ' || bal;
  SELECT total_coins_purchased INTO bal FROM profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  ASSERT bal = 550, 'total purchased = ' || bal;
  SELECT count(*) INTO n FROM coin_transactions WHERE user_id = '11111111-1111-1111-1111-111111111111';
  ASSERT n = 1, 'tx rows = ' || n;
  SELECT count(*) INTO n FROM revenue_events;
  ASSERT n = 1, 'revenue rows = ' || n;
  -- 4. a second, real purchase stacks
  r := credit_coin_purchase('evt_3','checkout.session.completed','cs_2','pi_2','11111111-1111-1111-1111-111111111111','gamer',1200,200,1000,'usd','Purchased Gamer pack');
  ASSERT (r->>'balance_after')::int = 1750, 'stack: ' || r;
  -- 5. unknown user rolls everything back, including the stripe_events row
  BEGIN
    PERFORM credit_coin_purchase('evt_4','checkout.session.completed','cs_3','pi_3','22222222-2222-2222-2222-222222222222','player',550,50,500,'usd','x');
    ASSERT false, 'should have raised';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'profile_not_found', 'wrong error: ' || SQLERRM;
  END;
  SELECT count(*) INTO n FROM stripe_events WHERE event_id = 'evt_4';
  ASSERT n = 0, 'failed attempt must not burn the event id';
  -- 6. bad coins
  BEGIN
    PERFORM credit_coin_purchase('evt_5','t','cs_5',NULL,'11111111-1111-1111-1111-111111111111','player',0,0,500,'usd','x');
    ASSERT false, 'should have raised';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'invalid_coins'; END;
  -- 7. revenue_events is append-only
  BEGIN
    UPDATE revenue_events SET gross_cents = 1;
    ASSERT false, 'update should fail';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'revenue_events is append-only'; END;
  BEGIN
    DELETE FROM revenue_events;
    ASSERT false, 'delete should fail';
  EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM = 'revenue_events is append-only'; END;
END $$;

ROLLBACK;
\echo PASS: coin purchase checks
