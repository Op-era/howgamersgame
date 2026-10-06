import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { getPlayContext } from "../route";
import { mapWalletResult } from "@/lib/coins/wallet";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const ctx = await getPlayContext(slug);
  if ("error" in ctx) return ctx.error;
  let body: { amount?: unknown; reason?: unknown; idempotencyKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: "A positive amount is required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "Played " + ctx.game.title;
  const idem = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  let data: { status?: string; balance?: number } | null = null;
  let error: { message: string } | null = null;
  try {
    const r = await query("SELECT spend_coins($1,$2,$3,$4,$5) AS result", [ctx.user.id, ctx.game.id, amount, reason, idem]);
    data = (r.rows[0] as { result: { status?: string; balance?: number } }).result;
  } catch (err) {
    error = { message: err instanceof Error ? err.message : "spend_coins failed" };
  }
  const outcome = mapWalletResult("spend", amount, { data, error });
  return NextResponse.json(outcome.body, { status: outcome.status });
}
