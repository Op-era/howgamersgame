#!/bin/sh
# Builds a fresh scratch database: Supabase stubs + schema.sql (which already includes every migration),
# then re-applies each migration to prove they are re-runnable.
# Usage: PSQL_BASE="psql -h /tmp -p 54329 -U postgres" sh tests/sql/setup-scratch.sh scratch_db
set -e
: "${PSQL_BASE:?set PSQL_BASE, e.g. 'psql -h /tmp -p 54329 -U postgres'}"
DB=${1:?database name}
D=$(dirname "$0")/../..
$PSQL_BASE -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/tests/sql/supabase-stub.sql"
$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/schema.sql" 2>&1 | grep -v NOTICE || true
for f in "$D"/src/lib/supabase/migrations/*.sql; do
  $PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | grep -v NOTICE || true
done
echo "scratch db $DB ready"
