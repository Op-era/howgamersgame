-- ============================================================
-- OPTIONAL hardening (recommended before taking real money)
--
-- The existing RLS policy "Users can update own profile" lets a signed-in
-- user UPDATE any column of their own profiles row, including coin_balance
-- and total_coins_purchased, straight from the browser with the public anon
-- key. This trigger blocks wallet-column changes from the anon and
-- authenticated roles. The service role (webhook, spend, award routes) and
-- the SQL editor are unaffected.
-- ============================================================
CREATE OR REPLACE FUNCTION protect_wallet_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated')
     AND (NEW.coin_balance IS DISTINCT FROM OLD.coin_balance
          OR NEW.total_coins_purchased IS DISTINCT FROM OLD.total_coins_purchased) THEN
    RAISE EXCEPTION 'wallet columns can only be changed by the server';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_protect_wallet ON profiles;
CREATE TRIGGER profiles_protect_wallet
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_wallet_columns();
