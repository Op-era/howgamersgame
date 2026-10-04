#!/usr/bin/env python3
"""Rebuilds the migrations block at the end of src/lib/supabase/schema.sql from migrations/*.sql."""
import glob
p = 'src/lib/supabase/schema.sql'
marker = '\n-- ============================================================\n-- BEGIN migrations 2026-10-04'
s = open(p).read()
base = s[:s.index(marker)].rstrip('\n') + '\n'
blk = marker + ' (mirrors src/lib/supabase/migrations/*.sql, in order)\n-- ============================================================\n'
for f in sorted(glob.glob('src/lib/supabase/migrations/*.sql')):
    blk += '\n-- ── ' + f.split('/')[-1] + ' ──\n' + open(f).read().rstrip('\n') + '\n'
open(p, 'w').write(base + blk)
