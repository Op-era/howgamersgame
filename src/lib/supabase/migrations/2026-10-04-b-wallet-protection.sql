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
