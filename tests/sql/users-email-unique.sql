-- Tests for the case-insensitive users.email unique index migration.
-- Run from repo root: psql -d authscratch -v ON_ERROR_STOP=1 -f tests/sql/users-email-unique.sql
BEGIN;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text
);

\i src/lib/supabase/migrations/2026-10-16-f-password-auth.sql

-- (a) apply migration g after one row with mixed-case email: passes
INSERT INTO users (id, email, display_name) VALUES
  ('00000000-0000-0000-0000-000000000000', 'A@Example.com', 'A');
\i src/lib/supabase/migrations/2026-10-16-g-users-email-lower-unique.sql

-- (b) second insert differing only by case fails with unique_violation
DO $$
BEGIN
  BEGIN
    INSERT INTO users (email, display_name) VALUES ('a@example.com', 'B');
    RAISE EXCEPTION 'expected unique_violation for case-insensitive duplicate email';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

-- (c) UPDATE on a non-existent id affects 0 rows; real row reset_token_hash stays NULL
DO $$
DECLARE n bigint;
BEGIN
  UPDATE users SET reset_token_hash = 'x', reset_expires_at = now()
    WHERE id = '00000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'expected 0 rows updated, got %', n;
  END IF;
  IF (SELECT reset_token_hash FROM users WHERE id = '00000000-0000-0000-0000-000000000000') IS NOT NULL THEN
    RAISE EXCEPTION 'reset_token_hash should still be NULL';
  END IF;
END $$;

-- (d) re-running migration g is idempotent
\i src/lib/supabase/migrations/2026-10-16-g-users-email-lower-unique.sql

-- (e) with index dropped and two case-variant rows present, migration body raises duplicate exception
SAVEPOINT before_duplicate_test;
DROP INDEX idx_users_email_lower;
INSERT INTO users (email, display_name) VALUES ('a@example.com', 'B');
DO $$
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'duplicate emails by lower(email): resolve before applying';
    END IF;
    RAISE EXCEPTION 'expected duplicate email exception';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'duplicate emails by lower(email)%' THEN
      NULL;
    ELSE
      RAISE;
    END IF;
  END;
END $$;
ROLLBACK TO before_duplicate_test;

ROLLBACK;
\echo users-email-unique OK
