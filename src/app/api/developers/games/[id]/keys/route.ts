import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { getSessionDev } from "@/lib/auth/devSession";
import { createGameApiKey } from "@/lib/auth/gameApiKey";

type Params = { params: Promise<{ id: string }> };

async function ownGame(devId: string, gameId: string) {
  const r = await query("SELECT id, title FROM games WHERE id = $1 AND developer_id = $2", [gameId, devId]);
  return (r.rows[0] as { id: string; title: string } | undefined) ?? null;
}

/** GET — list this devs keys for one game (prefixes only, never raw keys). */
export async function GET(_request: NextRequest, { params }: Params) {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!(await ownGame(dev.id, id))) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const r = await query(
    "SELECT id, key_prefix, name, is_active, last_used_at, created_at FROM game_api_keys WHERE game_id = $1 ORDER BY created_at DESC",
    [id]
  );
  return NextResponse.json({ keys: r.rows });
}

/**
 * POST — generate a new API key for the devs game.
 * The raw key is returned ONCE. Store it somewhere safe.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const game = await ownGame(dev.id, id);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  let body: { name?: unknown } = {};
  try {
    body = await request.json();
  } catch { /* name optional */ }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "Default";

  const key = await createGameApiKey(id, name);
  return NextResponse.json(
    { ok: true, apiKey: key.rawKey, keyPrefix: key.keyPrefix, id: key.id },
    { status: 201 }
  );
}

/** DELETE ?keyId= — revoke a key. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const dev = await getSessionDev();
  if (!dev) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!(await ownGame(dev.id, id))) return NextResponse.json({ error: "Game not found" }, { status: 404 });
  const keyId = request.nextUrl.searchParams.get("keyId");
  if (!keyId) return NextResponse.json({ error: "keyId is required" }, { status: 400 });
  await query("UPDATE game_api_keys SET is_active = FALSE WHERE id = $1 AND game_id = $2", [keyId, id]);
  return NextResponse.json({ ok: true });
}
