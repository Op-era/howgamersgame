import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { getSessionUser } from "@/lib/auth/session";

type Params = { params: Promise<{ slug: string }> };

/**
 * Shared helper for session based iframe game wallet calls.
 * The player is identified by their session cookie; the game by its slug.
 * The game API key never leaves the server.
 */
export async function getPlayContext(slug: string) {
  const user = await getSessionUser().catch(() => null);
  if (!user) return { error: NextResponse.json({ error: "Please sign in to play" }, { status: 401 }) };

  const g = await query("SELECT id, title, is_active FROM games WHERE slug = $1", [slug]);
  const game = g.rows[0] as { id: string; title: string; is_active: boolean } | undefined;
  if (!game || !game.is_active) {
    return { error: NextResponse.json({ error: "Game not found" }, { status: 404 }) };
  }
  return { user, game };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const ctx = await getPlayContext(slug);
  if ("error" in ctx) return ctx.error;
  const r = await query("SELECT coin_balance FROM profiles WHERE id = $1", [ctx.user.id]);
  const row = r.rows[0] as { coin_balance: number } | undefined;
  return NextResponse.json({ userId: ctx.user.id, balance: row?.coin_balance ?? 0, game: ctx.game.title });
}
