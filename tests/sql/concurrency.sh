#!/bin/sh
# Fires 8 concurrent credit_coin_purchase() calls for ONE Checkout Session (different event ids)
# and asserts exactly one credit. Needs a scratch Postgres prepared like tests/sql/coin-purchase.sql.
# Usage: PSQL="psql -h /tmp -p 54329 -U postgres -d scratch" sh tests/sql/concurrency.sh
set -e
: "${PSQL:?set PSQL to a psql command line for the scratch database}"
U=44444444-4444-4444-4444-444444444444
S=cs_conc_$$
$PSQL -q -c "insert into auth.users(id,email) values ('$U','conc$$@t.invalid')"
for i in 1 2 3 4 5 6 7 8; do
  $PSQL -q -At -c "select credit_coin_purchase('evt_${S}_$i','checkout.session.completed','$S','pi_$S','$U','pro',2500,500,2000,'usd','concurrency test')" > /tmp/conc_$$_$i.out &
done
wait
credited=$(cat /tmp/conc_$$_*.out | grep -c '"credited"' || true)
bal=$($PSQL -q -At -c "select coin_balance from profiles where id='$U'")
rows=$($PSQL -q -At -c "select (select count(*) from coin_transactions where stripe_checkout_session_id='$S')||','||(select count(*) from revenue_events where stripe_checkout_session_id='$S')")
rm -f /tmp/conc_$$_*.out
[ "$credited" = 1 ] && [ "$bal" = 2500 ] && [ "$rows" = "1,1" ] && echo "PASS: concurrency (credited=$credited balance=$bal ledger_rows=$rows)" || { echo "FAIL credited=$credited balance=$bal rows=$rows"; exit 1; }
