-- Case-insensitive uniqueness of public.users.email (2026-10-16-g).
-- The app always lowercases email before insert/update; this index makes the
-- database enforce that invariant so two rows cannot differ only by case.
-- Pre-checked on the live DB read-only: 0 duplicate lower(email) groups out
-- of 4 rows. Must be applied in a quiet window by the owner; NOT applied by
-- CI/deploy. CREATE UNIQUE INDEX takes a short lock on users (tiny table).
-- Rollback: DROP INDEX IF EXISTS idx_users_email_lower;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate emails by lower(email): resolve before applying';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
