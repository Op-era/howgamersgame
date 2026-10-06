-- Fill in missing games table columns (live table was created minimal).
-- Also creates game_api_keys if missing.

ALTER TABLE games ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS long_description TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS cover_art_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS cartridge_label_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'external';
ALTER TABLE games ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'live';
ALTER TABLE games ADD COLUMN IF NOT EXISTS revenue_share_pct NUMERIC NOT NULL DEFAULT 30.0;

-- Backfill title from name where title is null
UPDATE games SET title = name WHERE title IS NULL AND name IS NOT NULL;

CREATE TABLE IF NOT EXISTS game_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_game_api_keys_game_id ON game_api_keys(game_id);
CREATE INDEX IF NOT EXISTS idx_game_api_keys_hash ON game_api_keys(key_hash);
