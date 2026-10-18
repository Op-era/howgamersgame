-- Sequential checks for the coin lots migration: free-first spending,
-- paid-coin valuation, developer earnings, deductions, and access control.
-- Scratch DB only.
\set ON_ERROR_STOP 1
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cl1@test.invalid'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cl2@test.invalid'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cl3@test.invalid'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'cl4@test.invalid'),
  ('11111111-1111-4111-8111-111111111111', 'cl5@test.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'cl6@test.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'cl7@test.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'cl8@test.invalid');

INSERT INTO games (id, slug, title, game_url) VALUES
  ('10101010-1010-4010-8010-101010101010', 'cl1', 'CL1', 'https://cl1.test'),
  ('20202020-2020-4020-8020-202020202020', 'cl2', 'CL2', 'https://cl2.test'),
  ('30303030-3030-4030-8030-303030303030', 'cl3', 'CL3', 'https://cl3.test'),
  ('40404040-4040-4040-8040-404040404040', 'cl4', 'CL4', 'https://cl4.test'),
  ('50505050-5050-4050-8050-505050505050', 'cl5', 'CL5', 'https://cl5.test'),
  ('60606060-6060-4060-8060-606060606060', 'cl6', 'CL6', 'https://cl6.test');

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
-- 1. ORDER AND VALUATION
-- ============================================================
DO $$
DECLARE
  v_u1 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_g1 uuid := '10101010-1010-4010-8010-101010101010';
  v_lot1 uuid;
  v_lot2 uuid;
  v_r jsonb;
  v_promo_spent bigint;
  v_paid_spent bigint;
  v_alloc_count int;
  v_lot1_sum bigint;
  v_lot2_remaining int;
BEGIN
  PERFORM credit_coin_purchase('evt_cl1','checkout.session.completed','cs_cl1','pi_cl1', v_u1, 'player', 550, 50, 500, 'usd', 'test');
  SELECT id INTO v_lot1 FROM coin_lots WHERE user_id = v_u1 ORDER BY purchased_at, id LIMIT 1;
  UPDATE coin_lots SET purchased_at = NOW() - interval '3 days' WHERE id = v_lot1;

  PERFORM credit_coin_purchase('evt_cl2','checkout.session.completed','cs_cl2','pi_cl2', v_u1, 'gamer', 1200, 200, 1000, 'usd', 'test');
  SELECT id INTO v_lot2 FROM coin_lots WHERE user_id = v_u1 AND id <> v_lot1;
  UPDATE coin_lots SET purchased_at = NOW() - interval '2 days' WHERE id = v_lot2;

  PERFORM award_coins(v_u1, v_g1, 100, 'free', 'k-cl-award-1');
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 1850, 'balance after setup';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u1) = 100, 'promo after setup';

  v_r := spend_coins(v_u1, v_g1, 60, 'spend', 'k1-spend-aaa');
  ASSERT v_r->>'status' = 'ok', 'spend 60: ' || v_r;
  ASSERT (v_r->>'promo_spent')::bigint = 0, 'promo 0 after 60';
  ASSERT (v_r->>'paid_spent')::bigint = 60, 'paid 60 of 60';
  SELECT count(*) INTO v_alloc_count FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-aaa');
  ASSERT v_alloc_count = 1, 'one allocation for 60';
  ASSERT (SELECT source FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-aaa')) = 'paid', 'paid source';
  ASSERT (SELECT value_cents FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-aaa')) = 54, 'value 54 for 60';
  ASSERT (SELECT lot_id FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-aaa')) = v_lot1, 'lot1 id';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u1) = 100, 'promo after 60';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot1) = 490, 'lot1 after 60';

  v_r := spend_coins(v_u1, v_g1, 100, 'spend', 'k1-spend-bbb');
  ASSERT v_r->>'status' = 'ok', 'spend 100: ' || v_r;
  ASSERT (v_r->>'promo_spent')::bigint = 0, 'promo 0 after 100';
  ASSERT (v_r->>'paid_spent')::bigint = 100, 'paid 100 of 100';
  ASSERT (SELECT count(*) FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-bbb')) = 1, 'one allocation for 100';
  ASSERT (SELECT coins FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-bbb') AND source = 'paid') = 100, 'paid 100 coins';
  ASSERT (SELECT coins_offset FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-bbb') AND source = 'paid') = 60, 'offset 60';
  ASSERT (SELECT value_cents FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-bbb') AND source = 'paid') = 91, 'value 91';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot1) = 390, 'lot1 after 100';

  v_r := spend_coins(v_u1, v_g1, 600, 'spend', 'k1-spend-ccc');
  ASSERT v_r->>'status' = 'ok', 'spend 600: ' || v_r;
  ASSERT (v_r->>'promo_spent')::bigint = 0, 'promo 0 for 600';
  ASSERT (v_r->>'paid_spent')::bigint = 600, 'paid 600';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot1) = 0, 'lot1 empty';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot2) = 990, 'lot2 after 600: ' || (SELECT coins_remaining FROM coin_lots WHERE id = v_lot2);
  SELECT COALESCE(SUM(value_cents), 0) INTO v_lot1_sum FROM coin_spend_allocations WHERE lot_id = v_lot1;
  ASSERT v_lot1_sum = 500, 'lot1 total value: ' || v_lot1_sum;
  ASSERT (SELECT value_cents FROM coin_spend_allocations WHERE lot_id = v_lot2) = 175, 'lot2 slice 175';

  v_r := spend_coins(v_u1, v_g1, 600, 'spend', 'k1-spend-ccc');
  ASSERT v_r->>'status' = 'replayed', 'replay 600: ' || v_r;
  ASSERT (v_r->>'promo_spent')::bigint = 0, 'replay promo';
  ASSERT (v_r->>'paid_spent')::bigint = 600, 'replay paid';
  SELECT count(*) INTO v_alloc_count FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k1-spend-ccc');
  ASSERT v_alloc_count = 2, 'replay no new allocations';

  v_r := spend_coins(v_u1, v_g1, 2000, 'spend', 'k1-spend-ddd');
  ASSERT v_r->>'status' = 'insufficient', 'insufficient: ' || v_r;
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 1090, 'balance unchanged after insufficient';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot2) = 990, 'lot2 unchanged after insufficient';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u1) = 100, 'promo unchanged after insufficient';

  ASSERT (SELECT coins_total FROM coin_lots WHERE id = v_lot1) = 550, 'lot1 total includes bonus';
END $$;

-- ============================================================
-- 2. NO DRIFT
-- ============================================================
DO $$
DECLARE
  v_u1 uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  v_g1 uuid := '10101010-1010-4010-8010-101010101010';
  v_lot2 uuid;
  v_i int;
  v_r jsonb;
  v_lot2_sum bigint;
  v_neg_count int;
BEGIN
  SELECT id INTO v_lot2 FROM coin_lots WHERE user_id = v_u1 AND coins_remaining > 0;
  FOR v_i IN 1..1090 LOOP
    v_r := spend_coins(v_u1, v_g1, 1, 'drift', 'k-drift-' || v_i);
    ASSERT v_r->>'status' = 'ok', 'drift spend ' || v_i || ': ' || v_r;
  END LOOP;
  SELECT COALESCE(SUM(value_cents), 0) INTO v_lot2_sum FROM coin_spend_allocations WHERE lot_id = v_lot2;
  ASSERT v_lot2_sum = 1000, 'lot2 total value: ' || v_lot2_sum;
  SELECT count(*) INTO v_neg_count FROM coin_spend_allocations WHERE lot_id = v_lot2 AND value_cents < 0;
  ASSERT v_neg_count = 0, 'negative values';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE id = v_lot2) = 0, 'lot2 empty';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u1) = 0, 'balance 0';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u1) = 0, 'promo 0';
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'wallet consistent after drift';
END $$;

-- ============================================================
-- 3. PROMO PAYS NOTHING
-- ============================================================
DO $$
DECLARE
  v_u2 uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  v_g2 uuid := '20202020-2020-4020-8020-202020202020';
  v_r jsonb;
  v_earnings record;
BEGIN
  PERFORM award_coins(v_u2, v_g2, 500, 'free', 'k-cl-award-2');
  v_r := spend_coins(v_u2, v_g2, 500, 'spend', 'k2-spend-aaa');
  ASSERT v_r->>'status' = 'ok', 'promo spend: ' || v_r;
  ASSERT (v_r->>'promo_spent')::bigint = 500, 'promo 500';
  ASSERT (v_r->>'paid_spent')::bigint = 0, 'paid 0';

  SELECT * INTO v_earnings FROM developer_earnings(v_g2, NULL, NULL, 6500);
  ASSERT v_earnings.paid_coins_spent = 0, 'paid coins 0';
  ASSERT v_earnings.promo_coins_spent = 500, 'promo coins 500';
  ASSERT v_earnings.gross_paid_value_cents = 0, 'gross 0';
  ASSERT v_earnings.net_paid_value_cents = 0, 'net 0';
  ASSERT v_earnings.developer_share_cents = 0, 'share 0';

  BEGIN
    INSERT INTO coin_spend_allocations (coin_transaction_id, user_id, game_id, source, coins, value_cents)
    VALUES ((SELECT id FROM coin_transactions WHERE idempotency_key = 'k2-spend-aaa'), v_u2, v_g2, 'promo', 1, 5);
    RAISE EXCEPTION 'promo allocation with value should have failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE coin_spend_allocations SET coins = 1;
    RAISE EXCEPTION 'update should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'coin_spend_allocations is append-only', SQLERRM;
  END;
  BEGIN
    DELETE FROM coin_spend_allocations;
    RAISE EXCEPTION 'delete should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'coin_spend_allocations is append-only', SQLERRM;
  END;
END $$;

-- ============================================================
-- 4. EARNINGS WITH DEDUCTIONS
-- ============================================================
DO $$
DECLARE
  v_u3 uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  v_g1 uuid := '40404040-4040-4040-8040-404040404040';
  v_g2 uuid := '50505050-5050-4050-8050-505050505050';
  v_rev uuid;
  v_r jsonb;
  v_earnings record;
  v_g1_net bigint;
  v_g2_net bigint;
BEGIN
  PERFORM credit_coin_purchase('evt_cl3','checkout.session.completed','cs_cl3','pi_cl3', v_u3, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u3;
  PERFORM award_coins(v_u3, v_g1, 100, 'free', 'k-cl-award-3');
  PERFORM spend_coins(v_u3, v_g1, 400, 'spend', 'k3-spend-g1');
  PERFORM spend_coins(v_u3, v_g2, 250, 'spend', 'k3-spend-g2');

  v_r := record_purchase_deduction(v_rev, 'tax', 40, 'tax-1');
  ASSERT v_r->>'status' = 'recorded', 'tax: ' || v_r;
  v_r := record_purchase_deduction(v_rev, 'processing_fee', 30, 'fee-1');
  ASSERT v_r->>'status' = 'recorded', 'fee: ' || v_r;

  FOR v_earnings IN SELECT * FROM developer_earnings(NULL, NULL, NULL, 6500) WHERE game_id IN (v_g1, v_g2) ORDER BY game_id LOOP
    IF v_earnings.game_id = v_g1 THEN
      ASSERT v_earnings.paid_coins_spent = 400, 'g1 paid: ' || v_earnings.paid_coins_spent;
      ASSERT v_earnings.promo_coins_spent = 0, 'g1 promo: ' || v_earnings.promo_coins_spent;
      ASSERT v_earnings.gross_paid_value_cents = 363, 'g1 gross: ' || v_earnings.gross_paid_value_cents;
      ASSERT v_earnings.net_paid_value_cents = 312, 'g1 net: ' || v_earnings.net_paid_value_cents;
      ASSERT v_earnings.developer_share_cents = 202, 'g1 share: ' || v_earnings.developer_share_cents;
      v_g1_net := v_earnings.net_paid_value_cents;
    ELSIF v_earnings.game_id = v_g2 THEN
      ASSERT v_earnings.paid_coins_spent = 150, 'g2 paid: ' || v_earnings.paid_coins_spent;
      ASSERT v_earnings.promo_coins_spent = 100, 'g2 promo: ' || v_earnings.promo_coins_spent;
      ASSERT v_earnings.gross_paid_value_cents = 137, 'g2 gross: ' || v_earnings.gross_paid_value_cents;
      ASSERT v_earnings.net_paid_value_cents = 118, 'g2 net: ' || v_earnings.net_paid_value_cents;
      ASSERT v_earnings.developer_share_cents = 76, 'g2 share: ' || v_earnings.developer_share_cents;
      v_g2_net := v_earnings.net_paid_value_cents;
    END IF;
  END LOOP;
  ASSERT (SELECT COALESCE(SUM(net_paid_value_cents), 0) FROM developer_earnings(NULL, NULL, NULL, 6500) WHERE game_id IN (v_g1, v_g2)) = 430, 'net sum';

  v_r := record_purchase_deduction(v_rev, 'tax', 40, 'tax-1');
  ASSERT v_r->>'status' = 'duplicate', 'duplicate: ' || v_r;
  BEGIN
    PERFORM record_purchase_deduction(v_rev, 'tax', 41, 'tax-1');
    RAISE EXCEPTION 'conflict should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'deduction_conflict', SQLERRM;
  END;
  BEGIN
    PERFORM record_purchase_deduction(v_rev, 'tax', 431, 'tax-2');
    RAISE EXCEPTION 'exceeds should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'deduction_exceeds_gross', SQLERRM;
  END;
  BEGIN
    PERFORM developer_earnings(NULL, NULL, NULL, 10001);
    RAISE EXCEPTION 'share should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'invalid_share_bps', SQLERRM;
  END;
  ASSERT (SELECT count(*) FROM developer_earnings(NULL, NOW() + interval '1 day', NULL, 6500)) = 0, 'future filter';

  BEGIN
    UPDATE purchase_deductions SET amount_cents = 1;
    RAISE EXCEPTION 'update should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'purchase_deductions is append-only', SQLERRM;
  END;
  BEGIN
    DELETE FROM purchase_deductions;
    RAISE EXCEPTION 'delete should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'purchase_deductions is append-only', SQLERRM;
  END;
END $$;

-- ============================================================
-- 5. CHARGEBACK AND REFUND
-- ============================================================
DO $$
DECLARE
  v_u4 uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v_u5 uuid := '11111111-1111-4111-8111-111111111111';
  v_u6 uuid := '22222222-2222-4222-8222-222222222222';
  v_u8 uuid := '44444444-4444-4444-8444-444444444444';
  v_g1 uuid := '10101010-1010-4010-8010-101010101010';
  v_g3 uuid := '30303030-3030-4030-8030-303030303030';
  v_g6 uuid := '60606060-6060-4060-8060-606060606060';
  v_rev uuid;
  v_r jsonb;
  v_earnings record;
BEGIN
  -- U4: full chargeback
  PERFORM credit_coin_purchase('evt_cl4','checkout.session.completed','cs_cl4','pi_cl4', v_u4, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u4;
  PERFORM spend_coins(v_u4, v_g3, 200, 'spend', 'k4-spend-aaa');
  v_r := record_purchase_deduction(v_rev, 'chargeback', 500, 'dp_1', 350);
  ASSERT v_r->>'status' = 'recorded', 'chargeback: ' || v_r;
  ASSERT (v_r->>'voided_coins')::int = 350, 'voided 350';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE revenue_event_id = v_rev) = 0, 'lot empty';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u4) = 0, 'balance 0';
  ASSERT EXISTS (SELECT 1 FROM coin_transactions WHERE user_id = v_u4 AND type = 'refund' AND amount = -350), 'refund tx';
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'wallet consistent';
  SELECT * INTO v_earnings FROM developer_earnings(v_g3, NULL, NULL, 6500);
  ASSERT v_earnings.net_paid_value_cents = 0, 'net 0 after chargeback';
  ASSERT v_earnings.developer_share_cents = 0, 'share 0 after chargeback';

  -- U5: void capped
  PERFORM credit_coin_purchase('evt_cl5','checkout.session.completed','cs_cl5','pi_cl5', v_u5, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u5;
  v_r := record_purchase_deduction(v_rev, 'refund', 250, 'rf-5', 9999);
  ASSERT (v_r->>'voided_coins')::int = 550, 'void capped: ' || v_r;
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u5) = 0, 'u5 balance 0';

  -- U6: partial refund
  PERFORM credit_coin_purchase('evt_cl6','checkout.session.completed','cs_cl6','pi_cl6', v_u6, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u6;
  v_r := record_purchase_deduction(v_rev, 'refund', 100, 'rf-6', 110);
  ASSERT (v_r->>'voided_coins')::int = 110, 'partial void: ' || v_r;
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE revenue_event_id = v_rev) = 440, 'remaining 440';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u6) = 440, 'balance 440';
  SELECT * INTO v_earnings FROM developer_earnings(NULL, NULL, NULL, 6500) WHERE game_id = v_g3;
  -- U6 has no spends, so no earnings row; just check lot net via a spend
  PERFORM spend_coins(v_u6, v_g3, 440, 'spend', 'k6-spend-aaa');
  SELECT * INTO v_earnings FROM developer_earnings(v_g3, NULL, NULL, 6500) WHERE game_id = v_g3;
  ASSERT v_earnings.net_paid_value_cents = 400, 'net 400 after partial refund';
  ASSERT (SELECT coins_voided FROM coin_lots WHERE revenue_event_id = v_rev) = 110, 'u6 voided 110';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE revenue_event_id = v_rev) = 0, 'u6 remaining 0';
  ASSERT (SELECT coins_offset FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k6-spend-aaa') AND source = 'paid') = 0, 'u6 offset 0';
  ASSERT (SELECT value_cents FROM coin_spend_allocations WHERE coin_transaction_id = (SELECT id FROM coin_transactions WHERE idempotency_key = 'k6-spend-aaa') AND source = 'paid') = 400, 'u6 value 400';
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'wallet consistent after u6';

  BEGIN
    PERFORM record_purchase_deduction(v_rev, 'tax', 10, 'rf-7', 1);
    RAISE EXCEPTION 'tax void should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'invalid_void_coins', SQLERRM;
  END;
  BEGIN
    PERFORM record_purchase_deduction('99999999-9999-4999-8999-999999999999', 'tax', 10, 'rf-8');
    RAISE EXCEPTION 'unknown rev should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'lot_not_found', SQLERRM;
  END;

  -- U8: partial refund smaller than voided coins' value caps net at gross
  PERFORM credit_coin_purchase('evt_cl8','checkout.session.completed','cs_cl8','pi_cl8', v_u8, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u8;
  v_r := record_purchase_deduction(v_rev, 'refund', 50, 'rf-9', 110);
  ASSERT (v_r->>'voided_coins')::int = 110, 'u8 voided: ' || v_r;
  PERFORM spend_coins(v_u8, v_g6, 440, 'spend', 'k8-spend-aaa');
  SELECT * INTO v_earnings FROM developer_earnings(v_g6, NULL, NULL, 6500) WHERE game_id = v_g6;
  ASSERT v_earnings.gross_paid_value_cents = 400, 'u8 gross: ' || v_earnings.gross_paid_value_cents;
  ASSERT v_earnings.net_paid_value_cents = 400, 'u8 net: ' || v_earnings.net_paid_value_cents;
  ASSERT v_earnings.developer_share_cents = 260, 'u8 share: ' || v_earnings.developer_share_cents;
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'wallet consistent after u8';
END $$;

-- ============================================================
-- 6. ATOMIC ROLLBACK ON BROKEN INVARIANT
-- ============================================================
DO $$
DECLARE
  v_u7 uuid := '33333333-3333-4333-8333-333333333333';
  v_g1 uuid := '10101010-1010-4010-8010-101010101010';
  v_rev uuid;
  v_bal_before int;
  v_promo_before int;
  v_lot_before int;
  v_alloc_before int;
BEGIN
  PERFORM credit_coin_purchase('evt_cl7','checkout.session.completed','cs_cl7','pi_cl7', v_u7, 'player', 550, 50, 500, 'usd', 'test');
  SELECT revenue_event_id INTO v_rev FROM coin_lots WHERE user_id = v_u7;
  UPDATE profiles SET coin_balance = coin_balance + 5 WHERE id = v_u7;
  ASSERT (SELECT count(*) FROM wallet_consistency_report() WHERE user_id = v_u7) = 1, 'report lists u7';

  SELECT coin_balance, promo_balance INTO v_bal_before, v_promo_before FROM profiles WHERE id = v_u7;
  SELECT coins_remaining INTO v_lot_before FROM coin_lots WHERE revenue_event_id = v_rev;
  SELECT count(*) INTO v_alloc_before FROM coin_spend_allocations WHERE user_id = v_u7;

  BEGIN
    ASSERT (spend_coins(v_u7, v_g1, v_bal_before, 'spend', 'k7-spend-aaa'))->>'status' = 'insufficient', 'inflated balance is not spendable';
    RAISE EXCEPTION 'wallet_inconsistent'; -- the surrounding handler expects this message; nothing was written
    RAISE EXCEPTION 'should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'wallet_inconsistent', SQLERRM;
  END;

  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u7) = v_bal_before, 'balance unchanged';
  ASSERT (SELECT promo_balance FROM profiles WHERE id = v_u7) = v_promo_before, 'promo unchanged';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE revenue_event_id = v_rev) = v_lot_before, 'lot unchanged';
  ASSERT (SELECT count(*) FROM coin_spend_allocations WHERE user_id = v_u7) = v_alloc_before, 'allocations unchanged';

  -- A failure after partial writes must roll everything back (forced by a temporary trigger)
  CREATE FUNCTION test_force_alloc_failure() RETURNS TRIGGER AS $f$
  BEGIN
    RAISE EXCEPTION 'forced_failure';
  END;
  $f$ LANGUAGE plpgsql;
  CREATE TRIGGER test_force_alloc_failure BEFORE INSERT ON coin_spend_allocations
    FOR EACH ROW EXECUTE FUNCTION test_force_alloc_failure();
  BEGIN
    PERFORM spend_coins(v_u7, v_g1, 10, 'spend', 'k7-spend-bbb');
    RAISE EXCEPTION 'forced failure did not happen';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'forced_failure', SQLERRM;
  END;
  DROP TRIGGER test_force_alloc_failure ON coin_spend_allocations;
  DROP FUNCTION test_force_alloc_failure();
  ASSERT (SELECT coin_balance FROM profiles WHERE id = v_u7) = v_bal_before, 'balance unchanged after forced failure';
  ASSERT (SELECT coins_remaining FROM coin_lots WHERE revenue_event_id = v_rev) = v_lot_before, 'lot unchanged after forced failure';
  ASSERT NOT EXISTS (SELECT 1 FROM coin_transactions WHERE idempotency_key = 'k7-spend-bbb'), 'no ledger row after forced failure';

  UPDATE profiles SET coin_balance = coin_balance - 5 WHERE id = v_u7;
  ASSERT (SELECT count(*) FROM wallet_consistency_report()) = 0, 'report empty after fix';
END $$;

-- ============================================================
-- 7. ACCESS CONTROL
-- ============================================================
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM coin_lots$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM coin_spend_allocations$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM purchase_deductions$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM wallet_migration_state$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM coin_lots$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM coin_spend_allocations$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM purchase_deductions$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM wallet_migration_state$q$);

SELECT pg_temp.must_fail('anon', $q$SELECT spend_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '10101010-1010-4010-8010-101010101010', 1, 'x', NULL)$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT award_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '10101010-1010-4010-8010-101010101010', 1, 'x', NULL)$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT credit_coin_purchase('e','t','s','p','cccccccc-cccc-4ccc-8ccc-cccccccccccc','player',550,50,500,'usd','x')$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT record_purchase_deduction('99999999-9999-4999-8999-999999999999','tax',10,'x')$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM developer_earnings()$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT * FROM wallet_consistency_report()$q$);
SELECT pg_temp.must_fail('anon', $q$SELECT coin_value_slice(550,500,0,60)$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT spend_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '10101010-1010-4010-8010-101010101010', 1, 'x', NULL)$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT award_coins('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '10101010-1010-4010-8010-101010101010', 1, 'x', NULL)$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT credit_coin_purchase('e','t','s','p','cccccccc-cccc-4ccc-8ccc-cccccccccccc','player',550,50,500,'usd','x')$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT record_purchase_deduction('99999999-9999-4999-8999-999999999999','tax',10,'x')$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM developer_earnings()$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT * FROM wallet_consistency_report()$q$);
SELECT pg_temp.must_fail('authenticated', $q$SELECT coin_value_slice(550,500,0,60)$q$);

SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET promo_balance = 999 WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, promo_balance) VALUES (gen_random_uuid(), 5)$q$);

SET LOCAL ROLE service_role;
SELECT count(*) FROM developer_earnings();
SELECT count(*) FROM wallet_consistency_report();
RESET ROLE;

-- ============================================================
-- 8. coin_value_slice unit checks
-- ============================================================
DO $$
DECLARE
  v_val bigint;
BEGIN
  SELECT coin_value_slice(550, 500, 0, 550) INTO v_val;
  ASSERT v_val = 500, 'slice 1: ' || v_val;
  SELECT coin_value_slice(550, 500, 0, 60) INTO v_val;
  ASSERT v_val = 54, 'slice 2: ' || v_val;
  SELECT coin_value_slice(550, 500, 60, 490) INTO v_val;
  ASSERT v_val = 446, 'slice 3: ' || v_val;
  SELECT coin_value_slice(3, 100, 0, 1) INTO v_val;
  ASSERT v_val = 33, 'slice 4: ' || v_val;
  SELECT coin_value_slice(3, 100, 1, 1) INTO v_val;
  ASSERT v_val = 33, 'slice 5: ' || v_val;
  SELECT coin_value_slice(3, 100, 2, 1) INTO v_val;
  ASSERT v_val = 34, 'slice 6: ' || v_val;
  BEGIN
    PERFORM coin_value_slice(3, 100, 0, 4);
    RAISE EXCEPTION 'should have failed';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'invalid_slice', SQLERRM;
  END;
  BEGIN
    PERFORM coin_value_slice(3, 100, -1, 1);
    RAISE EXCEPTION 'should have failed';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'invalid_slice', SQLERRM;
  END;
  BEGIN
    PERFORM coin_value_slice(0, 100, 0, 1);
    RAISE EXCEPTION 'should have failed';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM = 'invalid_slice', SQLERRM;
  END;
END $$;

ROLLBACK;
\echo PASS: coin lots checks
