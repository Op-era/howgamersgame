#!/bin/sh
# Parallel spends and awards against real connections. Scratch DB only (see setup-scratch.sh).
# Usage: PSQL="psql -h /tmp -p 54329 -U postgres -d scratch" sh tests/sql/spend-award-concurrency.sh
set -e
: "${PSQL:?set PSQL}"
Q="$PSQL -q -At"
G=77777777-7777-4777-8777-777777777777
$Q -c "insert into games(id,slug,title,game_url) values ('$G','conc-$$','C','https://c.test')"
newuser() { U=$(uuidgen | tr A-Z a-z); $Q -c "insert into auth.users(id,email) values ('$U','$U@t.invalid')"; $Q -c "update profiles set coin_balance=$1 where id='$U'"; }
fail() { echo "FAIL: $1"; exit 1; }
count() { cat /tmp/sac_$$_$1_*.out 2>/dev/null | grep -c "\"$2\"" || true; }

# 1. 25 parallel spends of 30 (distinct keys) against a balance of 100: exactly 3 succeed, balance 10, never negative
newuser 100; U1=$U
for i in $(seq 1 25); do $Q -c "select spend_coins('$U1','$G',30,'p','k1_$i')" > /tmp/sac_$$_a_$i.out 2>&1 & done; wait
ok=$(count a ok); ins=$(count a insufficient); bal=$($Q -c "select coin_balance from profiles where id='$U1'")
[ "$ok" = 3 ] && [ "$ins" = 22 ] && [ "$bal" = 10 ] || fail "distinct-key spends ok=$ok insufficient=$ins balance=$bal"
rows=$($Q -c "select count(*) from coin_transactions where user_id='$U1' and type='spend'"); [ "$rows" = 3 ] || fail "ledger rows=$rows"
echo "PASS: 25 parallel spends -> 3 applied, 22 refused, balance 10"

# 2. 12 parallel retries of ONE spend (same key): applied once, the rest replayed
newuser 1000; U2=$U
for i in $(seq 1 12); do $Q -c "select spend_coins('$U2','$G',400,'p','same-key')" > /tmp/sac_$$_b_$i.out 2>&1 & done; wait
ok=$(count b ok); rep=$(count b replayed); bal=$($Q -c "select coin_balance from profiles where id='$U2'")
[ "$ok" = 1 ] && [ "$rep" = 11 ] && [ "$bal" = 600 ] || fail "same-key spends ok=$ok replayed=$rep balance=$bal"
echo "PASS: 12 parallel retries with one key -> applied once, balance 600"

# 3. 12 parallel retries of ONE award: applied once
newuser 0; U3=$U
for i in $(seq 1 12); do $Q -c "select award_coins('$U3','$G',500,'p','same-award')" > /tmp/sac_$$_c_$i.out 2>&1 & done; wait
ok=$(count c ok); rep=$(count c replayed); bal=$($Q -c "select coin_balance from profiles where id='$U3'")
[ "$ok" = 1 ] && [ "$rep" = 11 ] && [ "$bal" = 500 ] || fail "same-key awards ok=$ok replayed=$rep balance=$bal"
echo "PASS: 12 parallel retries of one award -> applied once, balance 500"

# 4. Mixed: 20 spends of 10 and 20 awards of 10 (distinct keys) from balance 50: ends consistent with the ledger, never negative
newuser 50; U4=$U
for i in $(seq 1 20); do
  $Q -c "select spend_coins('$U4','$G',10,'p','m_s_$i')" > /tmp/sac_$$_d_s$i.out 2>&1 &
  $Q -c "select award_coins('$U4','$G',10,'p','m_a_$i')" > /tmp/sac_$$_d_a$i.out 2>&1 &
done; wait
bal=$($Q -c "select coin_balance from profiles where id='$U4'")
ledger=$($Q -c "select 50 + coalesce(sum(amount),0) from coin_transactions where user_id='$U4'")
[ "$bal" = "$ledger" ] && [ "$bal" -ge 0 ] || fail "mixed balance=$bal ledger_implies=$ledger"
aw=$($Q -c "select count(*) from coin_transactions where user_id='$U4' and type='award'"); [ "$aw" = 20 ] || fail "awards applied=$aw"
echo "PASS: 40 mixed parallel ops -> balance $bal equals ledger, never negative"

# 5. Concurrent purchase credit + spends on one wallet stay consistent
newuser 0; U5=$U
for i in $(seq 1 6); do $Q -c "select credit_coin_purchase('evt_mx_${$}_$i','checkout.session.completed','cs_mx_${$}_$i','pi_mx_$i','$U5','player',550,50,500,'usd','mx')" > /tmp/sac_$$_e_c$i.out 2>&1 & done
for i in $(seq 1 30); do $Q -c "select spend_coins('$U5','$G',100,'p','mx_s_$i')" > /tmp/sac_$$_e_s$i.out 2>&1 & done; wait
bal=$($Q -c "select coin_balance from profiles where id='$U5'")
ledger=$($Q -c "select coalesce(sum(amount),0) from coin_transactions where user_id='$U5'")
[ "$bal" = "$ledger" ] && [ "$bal" -ge 0 ] || fail "purchase+spend balance=$bal ledger=$ledger"
echo "PASS: purchases + spends in parallel -> balance $bal equals ledger, never negative"
rm -f /tmp/sac_$$_*.out
