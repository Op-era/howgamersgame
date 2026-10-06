import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/auth/adminCheck";
import { query } from "@/lib/db/pg";

/** GET /api/admin/games — list all games (admin). Rewritten 2026-10-06: pg. */
export async function GET() {
  const { error } = await checkAdmin();
  if (error) return error;
  const r = await query("SELECT * FROM games ORDER BY sort_order");
  return NextResponse.json({ games: r.rows });
}

/** POST /api/admin/games — create a game (admin). Rewritten 2026-10-06: pg. */
export async function POST(request: NextRequest) {
  const { error } = await checkAdmin();
  if (error) return error;

  const body = await request.json();
  if (!body.slug || !body.title || !body.game_url) {
    return NextResponse.json({ error: "slug, title and game_url are required" }, { status: 400 });
  }
  try {
    const r = await query(
      `INSERT INTO games (slug, title, description, long_description, genre, game_type, game_url,
                          cover_art_url, cartridge_label_url, sort_order, is_active, status, revenue_share_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        body.slug, body.title, body.description || null, body.long_description || null,
        body.genre || null, body.game_type ?? "external", body.game_url,
        body.cover_art_url || null, body.cartridge_label_url || null,
        body.sort_order ?? 0, body.is_active ?? true, body.status ?? "live",
        body.revenue_share_pct ?? 30.0,
      ]
    );
    return NextResponse.json({ game: r.rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "insert failed" }, { status: 400 });
  }
}
