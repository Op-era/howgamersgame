#!/bin/bash
set -u
D=$(cd "$(dirname "$0")/../.." && pwd)
DB=${1:-coinlots_bf}
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
sed '/-- BEGIN migrations 2026-10-04/,$d' "$D/src/lib/supabase/schema.sql" > /tmp/coinlots_schema_$$.sql
$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f /tmp/coinlots_schema_$$.sql 2>&1 | grep -v NOTICE || true
rm -f /tmp/coinlots_schema_$$.sql

for f in \
  2026-10-04-a-coin-purchase-ledger.sql \
  2026-10-04-b-wallet-protection.sql \
  2026-10-04-c-spend-award.sql \
  2026-10-06-d-developer-portal.sql \
  2026-10-06-e-games-columns.sql; do
  $PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/$f" 2>&1 | grep -v NOTICE || true
done

has_promo=$($PSQL -d "$DB" -c "select count(*) from information_schema.columns where table_name='profiles' and column_name='promo_balance'")
echo "promo_balance column exists before migration: $has_promo"
check "promo_balance does not exist before migration" "0" "$has_promo"

$PSQL -d "$DB" -c "insert into games(id,slug,title,game_url) values ('$G','bf','BF','https://bf.test')"

newuser() {
  local email="$1"
  $PSQL -d "$DB" -c "insert into auth.users(id,email) values ('$email','$email@t.invalid')"
  echo "$email"
}

L1=$(newuser "11111111-1111-4111-8111-111111111111")
L2=$(newuser "22222222-2222-4222-8222-222222222222")
L3=$(newuser "33333333-3333-4333-8333-333333333333")
L4=$(newuser "44444444-4444-4444-8444-444444444444")
L5=$(newuser "55555555-5555-4555-8555-555555555555")

$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l1_1','checkout.session.completed','cs_l1_1','pi_l1_1','$L1','player',550,50,500,'usd','legacy')"
sleep 1
$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l1_2','checkout.session.completed','cs_l1_2','pi_l1_2','$L1','gamer',1200,200,1000,'usd','legacy')"
$PSQL -d "$DB" -c "select award_coins('$L1','$G',100,'x',NULL)"
$PSQL -d "$DB" -c "select spend_coins('$L1','$G',500,'x',NULL)"
$PSQL -d "$DB" -c "select spend_coins('$L1','$G',300,'x',NULL)"

$PSQL -d "$DB" -c "select award_coins('$L2','$G',300,'x',NULL)"

$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l3_1','checkout.session.completed','cs_l3_1','pi_l3_1','$L3','player',550,50,500,'usd','legacy')"
$PSQL -d "$DB" -c "select spend_coins('$L3','$G',100,'x',NULL)"

$PSQL -d "$DB" -c "select award_coins('$L4','$G',50,'x',NULL)"
$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l4_1','checkout.session.completed','cs_l4_1','pi_l4_1','$L4','player',550,50,500,'usd','legacy')"

$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l5_1','checkout.session.completed','cs_l5_1','pi_l5_1','$L5','player',550,50,500,'usd','legacy')"
$PSQL -d "$DB" -c "select spend_coins('$L5','$G',550,'x',NULL)"

bal_before_l1=$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L1'")
bal_before_l2=$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L2'")
bal_before_l3=$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L3'")
bal_before_l4=$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L4'")
bal_before_l5=$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L5'")

$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/2026-10-15-f-coin-lots.sql" 2>&1 | grep -v NOTICE || true

check "L1 promo_balance" "0" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L1'")"
check "L1 lot count" "2" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L1'")"
check "L1 oldest lot remaining" "0" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L1' order by purchased_at limit 1")"
check "L1 newest lot remaining" "1050" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L1' order by purchased_at desc limit 1")"

check "L2 promo_balance" "300" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L2'")"
check "L2 lot count" "0" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L2'")"

check "L3 promo_balance" "0" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L3'")"
check "L3 lot count" "1" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L3'")"
check "L3 lot remaining" "450" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L3'")"

check "L4 promo_balance" "50" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L4'")"
check "L4 lot count" "1" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L4'")"
check "L4 lot remaining" "550" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L4'")"

check "L5 promo_balance" "0" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L5'")"
check "L5 lot count" "1" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L5'")"
check "L5 lot remaining" "0" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L5'")"

check "L1 balance unchanged" "$bal_before_l1" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L1'")"
check "L2 balance unchanged" "$bal_before_l2" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L2'")"
check "L3 balance unchanged" "$bal_before_l3" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L3'")"
check "L4 balance unchanged" "$bal_before_l4" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L4'")"
check "L5 balance unchanged" "$bal_before_l5" "$($PSQL -d "$DB" -c "select coin_balance from profiles where id='$L5'")"

check "wallet consistency report empty" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"
check "backfill state row exists" "1" "$($PSQL -d "$DB" -c "select count(*) from wallet_migration_state where migration_key='coin_lots_backfill_v1'")"

check "lot coins_total matches revenue" "0" "$($PSQL -d "$DB" -c "select count(*) from coin_lots cl join revenue_events re on re.id=cl.revenue_event_id where cl.coins_total != re.coins_credited")"
check "lot gross_cents matches revenue" "0" "$($PSQL -d "$DB" -c "select count(*) from coin_lots cl join revenue_events re on re.id=cl.revenue_event_id where cl.gross_cents != re.gross_cents")"
check "lot coins_voided zero" "0" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where coins_voided != 0")"
check "no spend allocations" "0" "$($PSQL -d "$DB" -c "select count(*) from coin_spend_allocations")"

$PSQL_BASE -d "$DB" -q -v ON_ERROR_STOP=1 -f "$D/src/lib/supabase/migrations/2026-10-15-f-coin-lots.sql" 2>&1 | grep -v NOTICE || true

check "L1 promo_balance after re-run" "0" "$($PSQL -d "$DB" -c "select promo_balance from profiles where id='$L1'")"
check "L1 newest lot remaining after re-run" "1050" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L1' order by purchased_at desc limit 1")"
check "backfill state row count after re-run" "1" "$($PSQL -d "$DB" -c "select count(*) from wallet_migration_state where migration_key='coin_lots_backfill_v1'")"
check "wallet consistency report empty after re-run" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"

spend_result=$($PSQL -d "$DB" -c "select status||'|'||promo_spent||'|'||paid_spent from spend_coins('$L1','$G',1050,'x','post-1')")
check "post-migration spend result" "ok|0|1050" "$spend_result"
check "post-migration spend allocation count" "1" "$($PSQL -d "$DB" -c "select count(*) from coin_spend_allocations where spend_transaction_id=(select id from coin_transactions where user_id='$L1' and idempotency_key='post-1')")"
check "post-migration allocation coins_offset" "150" "$($PSQL -d "$DB" -c "select coins_offset from coin_spend_allocations where spend_transaction_id=(select id from coin_transactions where user_id='$L1' and idempotency_key='post-1')")"
check "post-migration allocation value_cents" "875" "$($PSQL -d "$DB" -c "select value_cents from coin_spend_allocations where spend_transaction_id=(select id from coin_transactions where user_id='$L1' and idempotency_key='post-1')")"
check "post-migration report empty" "0" "$($PSQL -d "$DB" -c "select count(*) from wallet_consistency_report()")"
check "post-migration lot remaining" "0" "$($PSQL -d "$DB" -c "select coins_remaining from coin_lots where user_id='$L1' order by purchased_at desc limit 1")"

lots_before_new=$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L2'")
$PSQL -d "$DB" -c "select credit_coin_purchase('evt_l2_new','checkout.session.completed','cs_l2_new','pi_l2_new','$L2','player',550,50,500,'usd','legacy')"
check "new purchase lot count +1" "$((lots_before_new+1))" "$($PSQL -d "$DB" -c "select count(*) from coin_lots where user_id='$L2'")"
check "new purchase lot coins_total" "550" "$($PSQL -d "$DB" -c "select coins_total from coin_lots where user_id='$L2' order by purchased_at desc limit 1")"

if [ "$FAILS" -eq 0 ]; then
  echo "PASS: coin lots backfill checks"
else
  echo "FAIL: $FAILS check(s) failed"
  exit 1
fi
