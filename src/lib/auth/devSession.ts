import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db/pg";

/**
 * Developer portal sessions (separate namespace from player sessions).
 * Cookie holds "<developerId>.<signature>" where signature is HMAC-SHA256(developerId, SESSION_SECRET).
 */

const COOKIE_NAME = "hgg_dev_session";

function getSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("SESSION_SECRET / AUTH_SECRET is not configured");
  return s;
}

function sign(devId: string): string {
  return createHmac("sha256", getSecret()).update("dev:" + devId).digest("hex");
}

export interface DevSession {
  id: string;
  email: string;
  name: string;
  studio_name: string | null;
}

export async function getSessionDev(): Promise<DevSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const devId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(devId);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const r = await query("SELECT id, email, name, studio_name FROM developers WHERE id = $1", [devId]);
  const row = r.rows[0] as DevSession | undefined;
  return row ?? null;
}

export async function createDevSession(devId: string): Promise<string> {
  return `${devId}.${sign(devId)}`;
}

export function devCookieSettings(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export { COOKIE_NAME as DEV_COOKIE_NAME };
