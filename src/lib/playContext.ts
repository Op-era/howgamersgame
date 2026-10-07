import { NextResponse } from "next/server";
import { query } from "@/lib/db/pg";
import { getSessionUser } from "@/lib/auth/session";

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
