import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { getSessionDev } from "@/lib/auth/devSession";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "game";
}

/**
 * GET /api/developers/games — the signed in devs games with stats.
 */
export async function GET() {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const r = await query(
    `SELECT g.id, g.slug, g.title, g.description, g.genre, g.game_url, g.cover_art_url,
            g.is_active, g.play_count, g.review_status, g.review_note, g.submitted_at,
            COALESCE(SUM(CASE WHEN t.type = 'award' THEN t.amount ELSE 0 END), 0) AS tokens_awarded,
            (SELECT COUNT(*) FROM game_api_keys k WHERE k.game_id = g.id AND k.is_active) AS active_keys
     FROM games g
     LEFT JOIN coin_transactions t ON t.game_id = g.id
     WHERE g.developer_id = $1
     GROUP BY g.id
     ORDER BY g.created_at DESC`,
    [dev.id]
  );
  return NextResponse.json({ games: r.rows });
}

/**
 * POST /api/developers/games — submit a game for review.
 * Body: { title, description?, genre?, game_url, cover_art_url?, accept_terms: true }
 * Terms (must accept): non exclusive listing; platform frames the game and may run
 * its own ads; dev may run own ads but may NOT award tokens for them; token
 * issuance is exclusive to the platform.
 */
export async function POST(request: NextRequest) {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const gameUrl = typeof body.game_url === "string" ? body.game_url.trim().slice(0, 500) : "";
  if (!title) return NextResponse.json({ error: "A game title is required" }, { status: 400 });
  if (!gameUrl || !/^https:\/\//.test(gameUrl)) {
    return NextResponse.json({ error: "A valid https game URL is required" }, { status: 400 });
  }
  if (body.accept_terms !== true) {
    return NextResponse.json({ error: "You must accept the developer terms to submit" }, { status: 400 });
  }

  const baseSlug = slugify(title);
  let slug = baseSlug;
  for (let i = 2; i < 20; i++) {
    const check = await query("SELECT id FROM games WHERE slug = $1", [slug]);
    if (!check.rows[0]) break;
    slug = `${baseSlug}-${i}`;
  }

  const r = await query(
    `INSERT INTO games (slug, name, title, description, genre, game_url, game_type, cover_art_url,
                        developer_id, is_active, review_status, submitted_at, terms_accepted_at)
     VALUES ($1,$2,$2,$3,$4,$5,'external',$6,$7,FALSE,'pending',NOW(),NOW())
     RETURNING id, slug, title, review_status`,
    [
      slug,
      title,
      typeof body.description === "string" ? body.description.trim().slice(0, 2000) : null,
      typeof body.genre === "string" ? body.genre.trim().slice(0, 60) : null,
      gameUrl,
      typeof body.cover_art_url === "string" ? body.cover_art_url.trim().slice(0, 500) : null,
      dev.id,
    ]
  );
  return NextResponse.json({ ok: true, game: r.rows[0] }, { status: 201 });
}
