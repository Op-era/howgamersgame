import { NextResponse } from "next/server";
import { query } from "@/lib/db/pg";

/** TEMPORARY TEST ROUTE - DELETE AFTER VERIFICATION */
export async function GET() {
  const out: any = {};
  // 1. Ensure test user exists and fund via credit function (simulates Stripe webhook credit)
  let u = await query("SELECT id FROM users WHERE email=$1", ["snaketest@howgamersgame.fly.dev"]);
  const userId = u.rows[0].id;
  await query("SELECT credit_coin_purchase($1,$2,$3,$4,$5)", [userId, null, 550, "Test funding", "test-fund-" + Date.now()]);
  let b = await query("SELECT coin_balance FROM profiles WHERE id=$1", [userId]);
  out.balanceAfterFunding = b.rows[0].coin_balance;
  // 2. Simulate power-up purchase (what snake does)
  const s = await query("SELECT spend_coins($1,$2,$3,$4,$5) AS result", [userId, null, 1, "Neon Snake power-up slowmo", "test-pu-" + Date.now()]);
  out.spendResult = s.rows[0].result;
  // 3. Final balance
  b = await query("SELECT coin_balance FROM profiles WHERE id=$1", [userId]);
  out.balanceAfterSpend = b.rows[0].coin_balance;
  // 4. Ledger
  const t = await query("SELECT type, amount, reason FROM coin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5", [userId]);
  out.ledger = t.rows;
  return NextResponse.json(out);
}
