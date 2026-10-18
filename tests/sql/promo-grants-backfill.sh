#!/bin/bash
set -u
D=$(cd "$(dirname "$0")/../.." && pwd)
DB=${1:-promo_bf}
: "${PSQL_BASE:?set PSQL_BASE, e.g. 'psql -h /tmp -p 54329 -U postgres'}"
PSQL="$PSQL_BASE -q -At"
G=99999999-9999-4999-8999-999999999999
FAILS=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS: $label"
  else
    echo "FAIL: $label (expected=$expected actual=$actual)"
    FAILS=$((FAILS+1))
  fi
}

$PSQL_BASE -d postgres -q -c "drop database if exists $DB" -c "create database $DB"
$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/tests/sql/supabase-stub.sql"
sed '/-- BEGIN migrations 2026-10-04/,$d' "$D/src/lib/supabase/schema.sql" > /tmp/promo_grants_schema_$$.sql
$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f /tmp/promo_grants_schema_$$.sql 2>&1 | grep -v NOTICE || true
rm -f /tmp/promo_grants_schema_$$.sql

for f in \
  2026-10-04-a-coin-purchase-ledger.sql \
  2026-10-04-b-wallet-protection.sql \
  2026-10-04-c-spend-award.sql \
  2026-10-06-d-developer-portal.sql \
  2026-10-06-e-games-columns.sql \
  2026-10-15-f-coin-lots.sql; do
  $PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/$f" 2>&1 | grep -v NOTICE || true
done

check "promo_grants table does not exist before migration" "0" "$($PSQL -d "$DB" -c "select count(*) from information_schema.tables where table_name='promo_grants'")"

$PSQL -d "$DB" -c "insert into games(id,slug,title,game_url) values ('$G','pb','PB','https://pb.test')"

P1=11111111-1111-4111-8111-111111111111
P2=22222222-2222-4222-8222-222222222222
P3=33333333-3333-4333-8333-333333333333

$PSQL -d "$DB" -c "insert into auth.users(id,email) values ('$P1','$P1@t.invalid')"
$PSQL -d "$DB" -c "insert into auth.users(id,email) values ('$P2','$P2@t.invalid')"
$PSQL -d "$DB" -c "insert into auth.users(id,email) values ('$P3','$P3@t.invalid')"

$PSQL -d "$DB" -c "update profiles set coin_balance=300, promo_balance=300 where id='$P2'"
$PSQL -d "$DB" -c "select credit_coin_purchase('evt_pb3','checkout.session.completed','cs_pb3','pi_pb3','$P3','player',550,50,500,'usd','legacy')"
$PSQL -d "$DB" -c "update profiles set coin_balance = coin_balance + 40, promo_balance = 40 where id='$P3'"

$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/2026-10-16-g-promo-grants.sql" 2>&1 | grep -v NOTICE || true

check "P1 has no promo grants" "0" "$($PSQL -d "$DB" -c "select count(*) from promo_grants where user_id='$P1'")"
check "P2 has one promo grant" "1" "$($PSQL -d "$DB" -c "select count(*) from promo_grants where user_id='$P2'")"
check "P2 grant source" "grandfather" "$($PSQL -d "$DB" -c "select source from promo_grants where user_id='$P2'")"
check "P2 grant coins_granted" "300" "$($PSQL -d "$DB" -c "select coins_granted from promo_grants where user_id='$P2'")"
check "P2 grant coins_remaining" "300" "$($PSQL -d "$DB" -c "select coins_remaining from promo_grants where user_id='$P2'")"
check "P2 grant swept_at null" "t" "$($PSQL -d "$DB" -c "select swept_at is null from promo_grants where user_id='$P2'")"
check "P2 grant expires_at 30 days out" "t" "$($PSQL -d "$DB" -c "select expires_at = granted_at + interval '720 hours' from promo_grants where user_id='$P2'")"
check "P2 grant expires_at later than 29 days" "t" "$($PSQL -d "$DB" -c "select expires_at > now() + interval '29 days' from promo_grants where user_id='$P2'")"
check "P3 has one promo grant" "1" "$($PSQL -d "$DB" -c "select count(*) from promo_grants where user_id='$P3'")"
check "P3 grant coins_granted" "40" "$($PSQL -d "$DB" -c "select coins_granted from promo_grants where user_id='$P3'")"
check "P3 grant source" "grandfather" "$($PSQL -d "$DB" -c "select source from promo_grants where user_id='$P3'")"
check "P2 promo_balance unchanged" "300" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$P2'")"
check "P3 promo_balance unchanged" "40" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$P3'")"
check "P2 coin_balance unchanged" "300" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$P2'")"
check "P3 coin_balance unchanged" "590" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$P3'")"
check "wallet consistency report empty" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"
check "backfill state row exists" "1" "$($PSQL -d "$DB" -c "select count(*) from wallet_migration_state where name='promo_grants_backfill_v1'")"

$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/2026-10-16-g-promo-grants.sql" 2>&1 | grep -v NOTICE || true

check "P2 grant count after re-run" "1" "$($PSQL -d "$DB" -c "select count(*) from promo_grants where user_id='$P2'")"
check "P3 grant count after re-run" "1" "$($PSQL -d "$DB" -c "select count(*) from promo_grants where user_id='$P3'")"
check "total promo grants after re-run" "2" "$($PSQL -d "$DB" -c "select count(*) from promo_grants")"
check "backfill state row count after re-run" "1" "$($PSQL -d "$DB" -c "select count(*) from wallet_migration_state where name='promo_grants_backfill_v1'")"
check "wallet consistency report empty after re-run" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"

check "P2 spend status" "ok" "$($PSQL -d "$DB" -c "select spend_coins('$P2','$G',100,'x','pb-1')::jsonb->>'status'")"
check "P2 grant coins_remaining after spend" "200" "$($PSQL -d "$DB" -c "select coins_remaining from promo_grants where user_id='$P2'")"
check "P2 coin_balance after spend" "200" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$P2'")"
check "P2 promo_balance after spend" "200" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$P2'")"
check "wallet consistency report empty after P2 spend" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"

check "P3 spend status" "ok" "$($PSQL -d "$DB" -c "select spend_coins('$P3','$G',580,'x','pb-2')::jsonb->>'status'")"
check "P3 grant coins_remaining after spend" "10" "$($PSQL -d "$DB" -c "select coins_remaining from promo_grants where user_id='$P3'")"
check "P3 coin_balance after spend" "10" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$P3'")"

if [ "$FAILS" -eq 0 ]; then
  echo "PASS: promo grants backfill checks"
else
  echo "FAIL: $FAILS check(s) failed"
  exit 1
fi
