\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pg1@test.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'pg2@test.invalid'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'pg3@test.invalid'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'pg4@test.invalid'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'pg5@test.invalid'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'pg6@test.invalid'),
  ('11111111-1111-4111-8111-111111111111', 'pg7@test.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'pg8@test.invalid');

INSERT INTO games (id, slug, title, game_url) VALUES
  ('90909090-9090-4090-8090-909090909090', 'pg1', 'PG1', 'https://pg1.test'),
  ('80808080-8080-4080-8080-808080808080', 'pg2', 'PG2', 'https://pg2.test'),
  ('70707070-7070-4070-8070-707070707070', 'pg3', 'PG3', 'https://pg3.test'),
  ('60606060-6060-4060-8060-606060606060', 'pg4', 'PG4', 'https://pg4.test');

-- Helper: run a statement as a role and require insufficient_privilege.
CREATE FUNCTION pg_temp.must_fail(role_name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean := false;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION '% should have been blocked: %', role_name, stmt; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO PUBLIC;

-- ============================================================
-- 1. AWARD CREATES A GRANT
-- ============================================================
DO $$
DECLARE
  v_u uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_g uuid := '90909090-9090-4090-8090-909090909090';
  v_r jsonb;
  v_grant promo_grants%ROWTYPE;
BEGIN
  v_r := award_coins(v_u, v_g, 100, 'free', 'pg1-award-1');
  ASSERT v_r->>'status' = 'ok', 'award status: ' || v_r;
  ASSERT (v_r->>'balance')::int = 100, 'award balance: ' || v_r;

  SELECT * INTO v_grant FROM promo_grants WHERE user_id = v_u;
  ASSERT FOUND, 'grant row exists';
  ASSERT v_grant.coins_granted = 100, 'grant coins_granted';
  ASSERT v_grant.coins_remaining = 100, 'grant coins_remaining';
  ASSERT v_grant.source = 'award', 'grant source';
  ASSERT v_grant.swept_at IS NULL, 'grant not swept';
  ASSERT v_grant.expires_at = v_grant.granted_at + INTERVAL '720 hours', 'grant expiry formula';
  ASSERT v_grant.expires_at > NOW() + INTERVAL '29 days', 'grant expiry far enough';

  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u) = 100, 'profile coin_balance';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u) = 100, 'profile promo_balance';
  ASSERT (SELECT count(*) FROM wallet_consistency_report() WHERE user_id = v_u) = 0, 'wallet consistent';

  BEGIN
    INSERT INTO promo_grants (user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
    VALUES (v_u, 10, 11, NOW(), NOW() + INTERVAL '720 hours', 'award');
    RAISE EXCEPTION 'coins_remaining > coins_granted should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO promo_grants (user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
    VALUES (v_u, 10, 10, NOW(), NOW() + INTERVAL '719 hours', 'award');
    RAISE EXCEPTION 'bad expiry should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ============================================================
-- 2. STARTER GRANT
-- ============================================================
DO $$
DECLARE
  v_u uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_u2 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_g uuid := '90909090-9090-4090-8090-909090909090';
  v_r jsonb;
  v_grant promo_grants%ROWTYPE;
  v_tx_count int;
BEGIN
  v_r := grant_starter_coins(v_u, 150);
  ASSERT v_r->>'status' = 'granted', 'starter status: ' || v_r;
  ASSERT (v_r->>'balance')::int = 150, 'starter balance: ' || v_r;
  ASSERT (v_r->>'amount')::int = 150, 'starter amount: ' || v_r;

  SELECT * INTO v_grant FROM promo_grants WHERE user_id = v_u;
  ASSERT FOUND, 'starter grant exists';
  ASSERT v_grant.source = 'starter', 'starter source';
  ASSERT v_grant.coins_granted = 150, 'starter coins_granted';
  ASSERT v_grant.expires_at = v_grant.granted_at + INTERVAL '720 hours', 'starter expiry';

  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u) = 150, 'starter coin_balance';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u) = 150, 'starter promo_balance';
  ASSERT (SELECT starter_granted_at FROM profiles WHERE id = v_u) IS NOT NULL, 'starter_granted_at set';

  SELECT count(*) INTO v_tx_count FROM coin_transactions WHERE user_id = v_u AND type = 'award';
  ASSERT v_tx_count = 1, 'one award ledger row';
  ASSERT (SELECT amount FROM coin_transactions WHERE user_id = v_u AND type = 'award') = 150, 'award amount';
  ASSERT (SELECT description FROM coin_transactions WHERE user_id = v_u AND type = 'award') = 'Starter coins', 'award description';

  v_r := grant_starter_coins(v_u, 150);
  ASSERT v_r->>'status' = 'already_granted', 'second starter: ' || v_r;
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u) = 150, 'balance unchanged after second starter';
  ASSERT (SELECT count(*) FROM promo_grants WHERE user_id = v_u) = 1, 'still one grant';
  SELECT count(*) INTO v_tx_count FROM coin_transactions WHERE user_id = v_u AND type = 'award';
  ASSERT v_tx_count = 1, 'still one ledger row';

  v_r := grant_starter_coins(v_u2);
  ASSERT v_r->>'status' = 'granted', 'default starter: ' || v_r;
  ASSERT (v_r->>'amount')::int = 150, 'default starter amount';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u2) = 150, 'u2 starter balance';

  ASSERT (SELECT count(*) FROM coin_lots WHERE user_id IN (v_u, v_u2)) = 0, 'no coin lots for starter users';

  BEGIN
    PERFORM grant_starter_coins(v_u, 0);
    RAISE EXCEPTION 'amount 0 should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'invalid_amount', SQLERRM;
  END;
  BEGIN
    PERFORM grant_starter_coins(v_u, 1001);
    RAISE EXCEPTION 'amount 1001 should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'invalid_amount', SQLERRM;
  END;
  BEGIN
    PERFORM grant_starter_coins('99999999-9999-4999-8999-999999999999', 150);
    RAISE EXCEPTION 'unknown user should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'user_not_found', SQLERRM;
  END;
END $$;

-- ============================================================
-- 3. PAID FIRST, THEN PROMO SOONEST-EXPIRING
-- ============================================================
DO $$
DECLARE
  v_u uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_g uuid := '90909090-9090-4090-8090-909090909090';
  v_grant_a uuid := gen_random_uuid();
  v_grant_b uuid := gen_random_uuid();
  v_r jsonb;
  v_tx uuid;
  v_alloc_count int;
BEGIN
  PERFORM credit_coin_purchase('evt_pg3','checkout.session.completed','cs_pg3','pi_pg3', v_u, 'player', 550, 50, 500, 'usd', 'test');

  INSERT INTO promo_grants (id, user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
  VALUES (v_grant_a, v_u, 40, 40, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days' + INTERVAL '720 hours', 'award');
  INSERT INTO promo_grants (id, user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
  VALUES (v_grant_b, v_u, 60, 60, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days' + INTERVAL '720 hours', 'award');
  UPDATE profiles SET coin_balance = coin_balance + 100, promo_balance = promo_balance + 100 WHERE id = v_u;

  v_r := spend_coins(v_u, v_g, 100, 'spend', 'pg3-1');
  ASSERT v_r->>'status' = 'ok', 'spend 100: ' || v_r;
  ASSERT (v_r->>'paid_spent')::bigint = 100, 'paid 100';
  ASSERT (v_r->>'promo_spent')::bigint = 0, 'promo 0';
  SELECT id INTO v_tx FROM coin_transactions WHERE user_id = v_u AND type = 'spend' AND amount = -100;
  SELECT count(*) INTO v_alloc_count FROM coin_spend_allocations WHERE coin_transaction_id = v_tx;
  ASSERT v_alloc_count = 1, 'one allocation for 100';
  ASSERT (SELECT source FROM coin_spend_allocations WHERE coin_transaction_id = v_tx) = 'paid', 'paid source';

  v_r := spend_coins(v_u, v_g, 500, 'spend', 'pg3-2');
  ASSERT v_r->>'status' = 'ok', 'spend 500: ' || v_r;
  ASSERT (v_r->>'paid_spent')::bigint = 450, 'paid 450';
  ASSERT (v_r->>'promo_spent')::bigint = 50, 'promo 50';
  SELECT id INTO v_tx FROM coin_transactions WHERE user_id = v_u AND type = 'spend' AND amount = -500;
  ASSERT (SELECT promo_grant_id FROM coin_spend_allocations WHERE coin_transaction_id = v_tx AND source = 'promo') = v_grant_b, 'promo from soonest expiring grant B';
  ASSERT (SELECT coins FROM coin_spend_allocations WHERE coin_transaction_id = v_tx AND source = 'promo') = 50, 'promo coins 50';
  ASSERT (SELECT value_cents FROM coin_spend_allocations WHERE coin_transaction_id = v_tx AND source = 'promo') = 0, 'promo value 0';
  ASSERT (SELECT lot_id FROM coin_spend_allocations WHERE coin_transaction_id = v_tx AND source = 'promo') IS NULL, 'promo lot_id null';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant_b) = 10, 'grant B remaining 10';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant_a) = 40, 'grant A remaining 40';
  ASSERT (SELECT count(*) FROM coin_spend_allocations WHERE user_id = v_u AND source = 'promo' AND promo_grant_id IS NULL) = 0, 'all promo allocations have grant id';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u) = 50, 'balance 50';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u) = 50, 'promo balance 50';
  ASSERT (SELECT count(*) FROM wallet_consistency_report() WHERE user_id = v_u) = 0, 'wallet consistent';

  v_r := spend_coins(v_u, v_g, 50, 'spend', 'pg3-3');
  ASSERT v_r->>'status' = 'ok', 'spend 50: ' || v_r;
  ASSERT (v_r->>'paid_spent')::bigint = 0, 'paid 0';
  ASSERT (v_r->>'promo_spent')::bigint = 50, 'promo 50';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant_b) = 0, 'grant B empty';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant_a) = 0, 'grant A empty';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u) = 0, 'balance 0';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u) = 0, 'promo balance 0';
  ASSERT (SELECT count(*) FROM wallet_consistency_report() WHERE user_id = v_u) = 0, 'wallet consistent after all spends';
END $$;

-- ============================================================
-- 4. EXPIRED GRANTS ARE IGNORED BEFORE THE SWEEP, THEN SWEPT IDEMPOTENTLY
-- ============================================================
DO $$
DECLARE
  v_u1 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_u2 uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_u3 uuid := '11111111-1111-4111-8111-111111111111';
  v_g uuid := '90909090-9090-4090-8090-909090909090';
  v_grant1 uuid := gen_random_uuid();
  v_grant2_expired uuid := gen_random_uuid();
  v_grant2_active uuid := gen_random_uuid();
  v_r jsonb;
  v_exp promo_expirations%ROWTYPE;
  v_swept_count int;
BEGIN
  -- u1: only an expired grant
  INSERT INTO promo_grants (id, user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
  VALUES (v_grant1, v_u1, 50, 50, NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days' + INTERVAL '720 hours', 'award');
  UPDATE profiles SET coin_balance = coin_balance + 50, promo_balance = promo_balance + 50 WHERE id = v_u1;

  v_r := spend_coins(v_u1, v_g, 10, 'spend', 'pg4-1');
  ASSERT v_r->>'status' = 'insufficient', 'expired grant insufficient: ' || v_r;
  ASSERT (v_r->>'balance')::bigint = 0, 'spendable balance 0';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 50, 'u1 balance unchanged';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant1) = 50, 'u1 grant unchanged';

  -- u2: paid lot + expired grant + active grant
  PERFORM credit_coin_purchase('evt_pg4','checkout.session.completed','cs_pg4','pi_pg4', v_u2, 'player', 550, 50, 500, 'usd', 'test');
  INSERT INTO promo_grants (id, user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
  VALUES (v_grant2_expired, v_u2, 30, 30, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days' + INTERVAL '720 hours', 'award');
  INSERT INTO promo_grants (id, user_id, coins_granted, coins_remaining, granted_at, expires_at, source)
  VALUES (v_grant2_active, v_u2, 20, 20, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '720 hours', 'award');
  UPDATE profiles SET coin_balance = coin_balance + 50, promo_balance = promo_balance + 50 WHERE id = v_u2;

  v_r := spend_coins(v_u2, v_g, 570, 'spend', 'pg4-2');
  ASSERT v_r->>'status' = 'ok', 'spend 570: ' || v_r;
  ASSERT (v_r->>'paid_spent')::bigint = 550, 'paid 550';
  ASSERT (v_r->>'promo_spent')::bigint = 20, 'promo 20';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant2_active) = 0, 'active grant empty';
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant2_expired) = 30, 'expired grant untouched';

  -- Sweep
  v_r := expire_promo_coins(NOW());
  ASSERT v_r->>'status' = 'ok', 'sweep status: ' || v_r;
  ASSERT (v_r->>'coins_expired')::bigint = 80, 'coins expired 80: ' || v_r;

  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant1) = 0, 'u1 grant swept';
  ASSERT (SELECT swept_at FROM promo_grants WHERE id = v_grant1) IS NOT NULL, 'u1 grant swept_at set';
  SELECT * INTO v_exp FROM promo_expirations WHERE grant_id = v_grant1;
  ASSERT FOUND, 'u1 expiration row exists';
  ASSERT v_exp.coins_expired = 50, 'u1 expiration coins';
  ASSERT v_exp.expires_at = (SELECT expires_at FROM promo_grants WHERE id = v_grant1), 'u1 expiration expiry matches';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 0, 'u1 balance 0';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u1) = 0, 'u1 promo 0';

  ASSERT (SELECT coins_remaining FROM promo_grants WHERE id = v_grant2_expired) = 0, 'u2 expired grant swept';
  ASSERT (SELECT swept_at FROM promo_grants WHERE id = v_grant2_expired) IS NOT NULL, 'u2 expired grant swept_at set';
  SELECT * INTO v_exp FROM promo_expirations WHERE grant_id = v_grant2_expired;
  ASSERT FOUND, 'u2 expiration row exists';
  ASSERT v_exp.coins_expired = 30, 'u2 expiration coins';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u2) = 0, 'u2 balance 0';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u2) = 0, 'u2 promo 0';
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'wallet consistent after sweep';

  -- Second sweep is idempotent for these users
  SELECT count(*) INTO v_swept_count FROM promo_expirations WHERE user_id IN (v_u1, v_u2);
  v_r := expire_promo_coins(NOW());
  ASSERT v_r->>'status' = 'ok', 'second sweep status: ' || v_r;
  ASSERT (SELECT count(*) FROM promo_expirations WHERE user_id IN (v_u1, v_u2)) = v_swept_count, 'no new expirations for u1/u2';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 0, 'u1 balance unchanged after second sweep';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u2) = 0, 'u2 balance unchanged after second sweep';

  -- Append-only
  BEGIN
    UPDATE promo_expirations SET coins_expired = 1;
    RAISE EXCEPTION 'update should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'promo_expirations is append-only', SQLERRM;
  END;
  BEGIN
    DELETE FROM promo_expirations;
    RAISE EXCEPTION 'delete should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'promo_expirations is append-only', SQLERRM;
  END;

  -- Future clock sweep
  PERFORM award_coins(v_u3, v_g, 100, 'free', 'pg4-3');
  v_r := expire_promo_coins(NOW() + INTERVAL '31 days');
  ASSERT v_r->>'status' = 'ok', 'future sweep status: ' || v_r;
  ASSERT (SELECT coins_remaining FROM promo_grants WHERE user_id = v_u3) = 0, 'u3 grant swept';
  ASSERT (SELECT swept_at FROM promo_grants WHERE user_id = v_u3) IS NOT NULL, 'u3 grant swept_at set';
  ASSERT (SELECT coins_expired FROM promo_expirations WHERE user_id = v_u3) = 100, 'u3 expiration coins';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u3) = 0, 'u3 balance 0';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u3) = 0, 'u3 promo 0';
END $$;

-- ============================================================
-- 5. ACCESS CONTROL
-- ============================================================
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM promo_grants$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM promo_expirations$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT expire_promo_coins()$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT grant_starter_coins('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT create_promo_grant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 1, 'award', 'x', NULL, NULL)$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM promo_grants$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM promo_expirations$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT expire_promo_coins()$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT grant_starter_coins('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT create_promo_grant('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 1, 'award', 'x', NULL, NULL)$q$);

SET LOCAL ROLE service_role;
SELECT count(*) FROM promo_grants;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'coin_lots' AND column_name LIKE '%expire%') = 0, 'coin_lots has no expiry column';
END $$;

ROLLBACK;
\echo PASS: promo grants checks
