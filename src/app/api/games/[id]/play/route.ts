import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";

/** POST /api/games/[id]/play — increments the play counter. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await query("UPDATE games SET play_count = play_count + 1 WHERE id = $1", [id]).catch(() => {});
  return NextResponse.json({ ok: true });
}
