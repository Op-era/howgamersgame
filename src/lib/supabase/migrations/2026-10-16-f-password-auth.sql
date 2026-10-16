-- Password auth restore (2026-10-16)
-- Restores the built signup contract on the Fly Postgres users table:
-- a user-chosen password plus email verification through Resend, on the
-- same stored account the coin wallet keys off. Supabase Auth was
-- removed 2026-10-06 (cost); these columns bring its account guarantees
-- back without it. All additive; existing rows keep working, with
-- password_hash NULL marking accounts created in the email-only period.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token_hash);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token_hash);
