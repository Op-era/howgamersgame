import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("key") !== process.env.SCHEMA_DEBUG_KEY) {
    return NextResponse.json({ error: "nope" }, { status: 403 });
  }
  const tables = ["games", "developers", "game_api_keys", "users", "profiles", "coin_transactions"];
  const out: Record<string, string[]> = {};
  for (const t of tables) {
    try {
      const r = await query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
        [t]
      );
      out[t] = r.rows.map((x: { column_name: string }) => x.column_name);
    } catch (e) {
      out[t] = ["ERROR: " + (e instanceof Error ? e.message : "unknown")];
    }
  }
  const g = await query("SELECT slug FROM games LIMIT 10").catch(() => ({ rows: [] }));
  out["_game_slugs"] = (g.rows as Array<{ slug: string }>).map((x) => x.slug);
  return NextResponse.json(out);
}
