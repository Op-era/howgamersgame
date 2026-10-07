import { NextResponse } from "next/server";
import { query } from "@/lib/db/pg";

/** TEMPORARY TEST ROUTE - DELETE AFTER VERIFICATION */
export async function GET() {
  const out: any = {};
  try {
    let u = await query("SELECT id FROM users WHERE email=$1", ["snaketest@howgamersgame.fly.dev"]);
    const userId = u.rows[0].id;
    const ts = Date.now();
    await query("SELECT credit_coin_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [
      "test-ev-" + ts, "test", "test-sess-" + ts, "test-pi-" + ts, userId,
      "player", 500, 50, 500, "usd", "Test funding", "2026-10-04"
    ]);
    let b = await query("SELECT coin_balance FROM profiles WHERE id=$1", [userId]);
    out.balanceAfterFunding = b.rows[0].coin_balance;
    const s = await query("SELECT spend_coins($1,$2,$3,$4,$5) AS result", [userId, null, 1, "Neon Snake power-up slowmo", "test-pu-" + ts]);
    out.spendResult = s.rows[0].result;
    b = await query("SELECT coin_balance FROM profiles WHERE id=$1", [userId]);
    out.balanceAfterSpend = b.rows[0].coin_balance;
    const t = await query("SELECT type, amount, reason FROM coin_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5", [userId]);
    out.ledger = t.rows;
    out.deducted = out.balanceAfterFunding - out.balanceAfterSpend;
  } catch (e: any) {
    out.error = e.message;
  }
  return NextResponse.json(out);
}
