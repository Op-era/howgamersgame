#!/bin/sh
# Parallel spends, awards, and purchase deductions against coin lots. Scratch DB only.
# Usage: PSQL="psql -h /tmp -p 54329 -U postgres -d scratch" sh tests/sql/coin-lots-concurrency.sh
set -e
: "${PSQL:?set PSQL}"
Q="$PSQL -q -At"
G=$(uuidgen)
$Q -c "insert into games(id,slug,title,game_url) values ('$G','ccl-$$','C','https://c.test')"
newuser() { U=$(uuidgen | tr A-Z a-z); $Q -c "insert into auth.users(id,email) values ('$U','$U@t.invalid')"; }
fail() { echo "FAIL: $1"; exit 1; }
count() { cat /tmp/ccl_$$_$1_*.out 2>/dev/null | grep -c "$2" || true; }

# 1. ORDER UNDER CONTENTION
newuser; A=$U
$Q -c "select credit_coin_purchase('evt_ccl_a1_$$','checkout.session.completed','cs_ccl_a1_$$','pi_ccl_a1_$$','$A','player',550,50,500,'usd','t')" >/dev/null
$Q -c "update coin_lots set purchased_at = now() - interval '2 days' where revenue_event_id = (select id from revenue_events where stripe_event_id='evt_ccl_a1_$$')"
$Q -c "select credit_coin_purchase('evt_ccl_a2_$$','checkout.session.completed','cs_ccl_a2_$$','pi_ccl_a2_$$','$A','gamer',1200,200,1000,'usd','t')" >/dev/null
$Q -c "update coin_lots set purchased_at = now() - interval '1 day' where revenue_event_id = (select id from revenue_events where stripe_event_id='evt_ccl_a2_$$')"
$Q -c "select award_coins('$A','$G',100,'p','ccl-award-$$')" >/dev/null
for i in $(seq 1 100); do $Q -c "select spend_coins('$A','$G',20,'p','ccl_a_$i')" > /tmp/ccl_$$_a_$i.out 2>&1 & done; wait
ok=$(count a ok); ins=$(count a insufficient); bal=$($Q -c "select coin_balance from profiles where id='$A'"); pbal=$($Q -c "select promo_balance from profiles where id='$A'")
[ "$ok" = 92 ] && [ "$ins" = 8 ] && [ "$bal" = 10 ] && [ "$pbal" = 0 ] || fail "order-under-contention ok=$ok insufficient=$ins balance=$bal promo=$pbal"
wcr=$($Q -c "select count(*) from wallet_consistency_report() where user_id='$A'"); [ "$wcr" = 0 ] || fail "wallet_consistency_report rows=$wcr"
promo_coins=$($Q -c "select coalesce(sum(coins),0) from coin_spend_allocations where user_id='$A' and source='promo'")
paid_coins=$($Q -c "select coalesce(sum(coins),0) from coin_spend_allocations where user_id='$A' and source='paid'")
paid_cents=$($Q -c "select coalesce(sum(value_cents),0) from coin_spend_allocations where user_id='$A' and source='paid'")
[ "$promo_coins" = 100 ] && [ "$paid_coins" = 1740 ] && [ "$paid_cents" = 1491 ] || fail "allocations promo=$promo_coins paid=$paid_coins paid_cents=$paid_cents"
lot1=$($Q -c "select id from coin_lots where user_id='$A' and revenue_event_id=(select id from revenue_events where stripe_event_id='evt_ccl_a1_$$')")
lot2=$($Q -c "select id from coin_lots where user_id='$A' and revenue_event_id=(select id from revenue_events where stripe_event_id='evt_ccl_a2_$$')")
lot1_rem=$($Q -c "select coins_remaining from coin_lots where id='$lot1'"); lot2_rem=$($Q -c "select coins_remaining from coin_lots where id='$lot2'")
[ "$lot1_rem" = 0 ] && [ "$lot2_rem" = 10 ] || fail "lot remaining lot1=$lot1_rem lot2=$lot2_rem"
overlap=$($Q -c "select count(*) from coin_spend_allocations a join coin_spend_allocations b on a.lot_id=b.lot_id and a.id<>b.id and a.lot_id='$lot1' and a.coins_offset < b.coins_offset + b.coins and b.coins_offset < a.coins_offset + a.coins")
[ "$overlap" = 0 ] || fail "overlapping lot1 allocations=$overlap"
lot1_alloc=$($Q -c "select coalesce(sum(coins),0) from coin_spend_allocations where lot_id='$lot1'")
lot2_alloc=$($Q -c "select coalesce(sum(coins),0) from coin_spend_allocations where lot_id='$lot2'")
lot1_total=$($Q -c "select coins_total from coin_lots where id='$lot1'"); lot2_total=$($Q -c "select coins_total from coin_lots where id='$lot2'")
[ "$lot1_alloc" = $((lot1_total - lot1_rem)) ] && [ "$lot2_alloc" = $((lot2_total - lot2_rem)) ] || fail "lot allocation totals lot1=$lot1_alloc/$lot1_total lot2=$lot2_alloc/$lot2_total"
echo "PASS: 100 parallel spends -> 92 applied, 8 insufficient, balance 10, promo 0, allocations consistent"

# 2. DUPLICATE DEDUCTIONS
for i in $(seq 1 12); do $Q -c "select record_purchase_deduction('$lot1','tax',40,'tax-par-$$')" > /tmp/ccl_$$_b_$i.out 2>&1 & done; wait
rec=$(count b recorded); dup=$(count b duplicate); rows=$($Q -c "select count(*) from purchase_deductions where revenue_event_id='$lot1' and deduction_ref='tax-par-$$'")
[ "$rec" = 1 ] && [ "$dup" = 11 ] && [ "$rows" = 1 ] || fail "duplicate deductions recorded=$rec duplicate=$dup rows=$rows"
echo "PASS: 12 parallel duplicate deductions -> 1 recorded, 11 duplicate"

# 3. SPENDS RACING VOIDS
newuser; B=$U
$Q -c "select credit_coin_purchase('evt_ccl_b_$$','checkout.session.completed','cs_ccl_b_$$','pi_ccl_b_$$','$B','player',550,50,500,'usd','t')" >/dev/null
$Q -c "update coin_lots set purchased_at = now() - interval '2 days' where revenue_event_id = (select id from revenue_events where stripe_event_id='evt_ccl_b_$$')"
lotB=$($Q -c "select id from coin_lots where user_id='$B' and revenue_event_id=(select id from revenue_events where stripe_event_id='evt_ccl_b_$$')")
for i in $(seq 1 30); do $Q -c "select spend_coins('$B','$G',10,'p','ccl_b_$i')" > /tmp/ccl_$$_c_s$i.out 2>&1 & done
for j in $(seq 1 5); do $Q -c "select record_purchase_deduction('$lotB','chargeback',100,'cb-$j-$$',50)" > /tmp/ccl_$$_c_cb$j.out 2>&1 & done; wait
if grep -il "deadlock\|ERROR" /tmp/ccl_$$_c_*.out >/dev/null 2>&1; then fail "deadlock or error in output"; fi
wcr=$($Q -c "select count(*) from wallet_consistency_report() where user_id='$B'"); [ "$wcr" = 0 ] || fail "wallet_consistency_report rows=$wcr"
bal=$($Q -c "select coin_balance from profiles where id='$B'"); [ "$bal" -ge 0 ] || fail "negative balance=$bal"
lot_rem=$($Q -c "select coins_remaining from coin_lots where id='$lotB'")
lot_void=$($Q -c "select coins_voided from coin_lots where id='$lotB'")
lot_alloc=$($Q -c "select coalesce(sum(coins),0) from coin_spend_allocations where lot_id='$lotB'")
[ $((lot_rem + lot_void + lot_alloc)) = 550 ] || fail "lot invariant rem=$lot_rem void=$lot_void alloc=$lot_alloc"
ded_total=$($Q -c "select coalesce(sum(amount_cents),0) from purchase_deductions where revenue_event_id='$lotB'")
[ "$ded_total" = 500 ] || fail "deduction total=$ded_total"
echo "PASS: spends racing voids -> no deadlock, wallet consistent, lot invariant holds, deductions 500"

rm -f /tmp/ccl_$$_*.out
