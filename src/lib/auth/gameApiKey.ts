import type { NextRequest } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db/pg";

export interface AuthResult {
  ok: boolean;
  gameId?: string;
  gameName?: string;
}

/**
 * Verifies a game API key from the Authorization: Bearer header.
 * Rewritten 2026-10-06: uses plain pg (Supabase removed).
 */
export async function verifyGameApiKey(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false };

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) return { ok: false };

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const r = await query(
    `SELECT k.id, k.game_id, g.title
     FROM game_api_keys k
     JOIN games g ON g.id = k.game_id
     WHERE k.key_hash = $1 AND k.is_active = TRUE`,
    [keyHash]
  );
  const row = r.rows[0] as { id: string; game_id: string; title: string } | undefined;
  if (!row) return { ok: false };

  // Update last_used_at without blocking the response
  query("UPDATE game_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]).catch(() => {});

  return { ok: true, gameId: row.game_id, gameName: row.title };
}

/** Generates a new API key for a game. Returns the raw key (show once) and its prefix. */
export async function createGameApiKey(gameId: string, name: string): Promise<{ rawKey: string; keyPrefix: string; id: string }> {
  const rawKey = "hgg_" + crypto.randomBytes(32).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);
  const r = await query(
    "INSERT INTO game_api_keys (game_id, key_prefix, key_hash, name) VALUES ($1,$2,$3,$4) RETURNING id",
    [gameId, keyPrefix, keyHash, name]
  );
  return { rawKey, keyPrefix, id: (r.rows[0] as { id: string }).id };
}
