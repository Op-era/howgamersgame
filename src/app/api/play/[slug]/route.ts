import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { getPlayContext } from "@/lib/playContext";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/play/[slug] — player balance + game info for the iframe game. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const ctx = await getPlayContext(slug);
  if ("error" in ctx) return ctx.error;
  const r = await query("SELECT coin_balance FROM profiles WHERE id = $1", [ctx.user.id]);
  const row = r.rows[0] as { coin_balance: number } | undefined;
  return NextResponse.json({ userId: ctx.user.id, balance: row?.coin_balance ?? 0, game: ctx.game.title });
}
