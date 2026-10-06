-- Players (anon / authenticated) must never be able to change coins or ledgers.
-- Runs against a scratch DB built by tests/sql/setup-scratch.sh. Uses real SET ROLE, like PostgREST does.
\set ON_ERROR_STOP 1
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'p1@test.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'p2@test.invalid');
INSERT INTO games (id, slug, title, game_url) VALUES ('99999999-9999-4999-8999-999999999999', 'g', 'G', 'https://g.test');
INSERT INTO game_api_keys (game_id, key_prefix, key_hash) VALUES ('99999999-9999-4999-8999-999999999999', 'hgg_abcd', 'deadbeef');
UPDATE profiles SET coin_balance = 100 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO coin_transactions (user_id, type, amount, balance_after) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'purchase', 100, 100);

-- Helper: run a statement as a role and require a specific outcome.
CREATE FUNCTION pg_temp.must_fail(role_name text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean := false; n bigint;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  EXECUTE format('SET LOCAL request.jwt.claim.sub = %L', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  BEGIN
    EXECUTE stmt;
    GET DIAGNOSTICS n = ROW_COUNT;
    -- RLS can also "succeed" by touching zero rows; that is a safe outcome only if nothing changed
    IF n > 0 THEN denied := false; ELSE denied := true; END IF;
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR check_violation THEN
    denied := true;
  END;
  RESET ROLE;
  IF NOT denied THEN RAISE EXCEPTION '% should have been blocked: %', role_name, stmt; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO PUBLIC;

-- ── 1. authenticated user, own row: every wallet write path is blocked
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET coin_balance = 999999 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET total_coins_purchased = 999999 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET coin_balance = coin_balance + 1$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET coin_balance = 5, display_name = 'x' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
-- upserts (INSERT .. ON CONFLICT DO UPDATE), the PostgREST/Supabase upsert path
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, coin_balance) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 999999) ON CONFLICT (id) DO UPDATE SET coin_balance = EXCLUDED.coin_balance$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, total_coins_purchased) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 999999) ON CONFLICT (id) DO UPDATE SET total_coins_purchased = EXCLUDED.total_coins_purchased$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x') ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, coin_balance) VALUES (gen_random_uuid(), 50)$q$);
SELECT pg_temp.must_fail('authenticated', $q$DELETE FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
-- other player's row
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET coin_balance = 0 WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$q$);
-- ledgers and config
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO coin_transactions (user_id, type, amount, balance_after) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'award', 5000, 5100)$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE coin_transactions SET amount = 1$q$);
SELECT pg_temp.must_fail('authenticated', $q$DELETE FROM coin_transactions$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO revenue_events (event_type, package_id, gross_cents, currency, coins_credited, stripe_event_id, stripe_checkout_session_id) VALUES ('coin_purchase','player',500,'usd',550,'e','s')$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO stripe_events (event_id, event_type) VALUES ('evt_x','x')$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO game_api_keys (game_id, key_prefix, key_hash) VALUES ('99999999-9999-4999-8999-999999999999', 'hgg_mine', 'myownhash')$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE game_api_keys SET is_active = true$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE coin_packages SET coins = 999999$q$);
SELECT pg_temp.must_fail('authenticated', $q$UPDATE games SET title = 'pwned'$q$);

-- ── 2. anon: same, plus no reads of secrets
SELECT pg_temp.must_fail('anon', $q$UPDATE profiles SET coin_balance = 999999$q$);
SELECT pg_temp.must_fail('anon', $q$INSERT INTO profiles (id, coin_balance) VALUES (gen_random_uuid(), 50)$q$);
SELECT pg_temp.must_fail('anon', $q$INSERT INTO coin_transactions (user_id, type, amount, balance_after) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'award', 5000, 5100)$q$);
SELECT pg_temp.must_fail('anon', $q$INSERT INTO game_api_keys (game_id, key_prefix, key_hash) VALUES ('99999999-9999-4999-8999-999999999999', 'hgg_mine', 'myownhash')$q$);

-- ── 3. nothing changed (guards against a statement "passing" only because it matched zero rows)
DO $$
DECLARE n int;
BEGIN
  ASSERT (SELECT coin_balance FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 100, 'balance changed';
  ASSERT (SELECT total_coins_purchased FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 0, 'total changed';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') = 0, 'p2 balance changed';
  ASSERT (SELECT count(*) FROM coin_transactions) = 1, 'ledger rows changed';
  ASSERT (SELECT count(*) FROM game_api_keys) = 1, 'api keys changed';
  ASSERT (SELECT key_hash FROM game_api_keys) = 'deadbeef', 'api key changed';
  ASSERT (SELECT count(*) FROM revenue_events) = 0 AND (SELECT count(*) FROM stripe_events) = 0, 'revenue/stripe rows appeared';
  ASSERT (SELECT max(coins) FROM coin_packages) = 14000, 'packages changed';
  ASSERT (SELECT title FROM games) = 'G', 'games changed';
END $$;

-- ── 4. secrets are invisible to players
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticated', 'anon'] LOOP
    FOREACH t IN ARRAY ARRAY['game_api_keys', 'revenue_events', 'stripe_events'] LOOP
      EXECUTE format('SET LOCAL ROLE %I', r);
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I', t);
        RESET ROLE;
        RAISE EXCEPTION '% could read %', r, t;
      EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
      END;
    END LOOP;
  END LOOP;
END $$;

-- ── 5. what players CAN still do
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
UPDATE profiles SET display_name = 'Renamed', username = 'p1', avatar_url = 'https://a.test/x.png' WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$
BEGIN
  ASSERT (SELECT display_name FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 'Renamed', 'rename failed';
  ASSERT (SELECT coin_balance FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 100, 'cannot read own balance';
  ASSERT (SELECT count(*) FROM profiles) = 1, 'sees other profiles';
  ASSERT (SELECT count(*) FROM coin_transactions) = 1, 'cannot read own ledger';
  ASSERT (SELECT count(*) FROM coin_packages) = 5, 'cannot read packages';
END $$;
RESET ROLE;

-- ── 6. the service role (server) can still do its job
SET LOCAL ROLE service_role;
UPDATE profiles SET coin_balance = coin_balance + 1 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT count(*) FROM game_api_keys \gset
RESET ROLE;

-- ── 7. trigger backstop works on its own: re-grant the privileges and retry
GRANT UPDATE, INSERT ON profiles TO authenticated;
GRANT UPDATE ON profiles TO anon;
SELECT pg_temp.must_fail('authenticated', $q$UPDATE profiles SET coin_balance = 999999 WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, coin_balance) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 999999) ON CONFLICT (id) DO UPDATE SET coin_balance = EXCLUDED.coin_balance$q$);
SELECT pg_temp.must_fail('authenticated', $q$INSERT INTO profiles (id, total_coins_purchased) VALUES (gen_random_uuid(), 77)$q$);
SELECT pg_temp.must_fail('anon', $q$UPDATE profiles SET total_coins_purchased = 5$q$);
DO $$ BEGIN ASSERT (SELECT coin_balance FROM profiles WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') = 101, 'balance changed in layer 3 test'; END $$;
ROLLBACK;
\echo PASS: wallet protection
