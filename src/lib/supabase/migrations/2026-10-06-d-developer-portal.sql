-- Developer portal migration (2026-10-06)
-- Adds developers table and game review workflow columns.

CREATE TABLE IF NOT EXISTS developers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  studio_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE games ADD COLUMN IF NOT EXISTS developer_id UUID REFERENCES developers(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved'
  CHECK (review_status IN ('pending','approved','rejected'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_games_developer_id ON games(developer_id);
CREATE INDEX IF NOT EXISTS idx_games_review_status ON games(review_status);
