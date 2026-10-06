import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/auth/adminCheck";
import { query } from "@/lib/db/pg";

type Params = { params: Promise<{ id: string }> };

const UPDATABLE = [
  "slug", "title", "description", "long_description", "genre", "game_type",
  "game_url", "cover_art_url", "cartridge_label_url", "sort_order",
  "is_active", "status", "revenue_share_pct",
  "review_status", "review_note", "developer_id",
];

/** PATCH /api/admin/games/[id] — update a game, incl. approve/reject review. Rewritten 2026-10-06: pg. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await request.json();

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of UPDATABLE) {
    if (body[col] !== undefined) {
      vals.push(body[col]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const r = await query(`UPDATE games SET ${sets.join(", ")} WHERE id = $${vals.length + 1} RETURNING *`, [...vals, id]);
    if (!r.rows[0]) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    return NextResponse.json({ game: r.rows[0] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "update failed" }, { status: 400 });
  }
}

/** DELETE /api/admin/games/[id] — delete a game. Rewritten 2026-10-06: pg. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { id } = await params;
  await query("DELETE FROM games WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
