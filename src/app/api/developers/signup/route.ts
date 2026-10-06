import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { createDevSession, devCookieSettings, DEV_COOKIE_NAME } from "@/lib/auth/devSession";

export async function POST(request: NextRequest) {
  let body: { name?: unknown; email?: unknown; studio_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const studioName = typeof body?.studio_name === "string" ? body.studio_name.trim().slice(0, 120) : null;
  if (!name) return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const existing = await query("SELECT id FROM developers WHERE email = $1", [email]);
  if (existing.rows[0]) {
    return NextResponse.json({ error: "An account with this email already exists. Please sign in." }, { status: 409 });
  }
  const created = await query(
    "INSERT INTO developers (email, name, studio_name) VALUES ($1,$2,$3) RETURNING id, email, name, studio_name",
    [email, name, studioName || null]
  );
  const dev = created.rows[0] as { id: string; email: string; name: string; studio_name: string | null };
  const res = NextResponse.json({ ok: true, developer: dev }, { status: 201 });
  res.cookies.set(DEV_COOKIE_NAME, await createDevSession(dev.id), devCookieSettings(60 * 60 * 24 * 90));
  return res;
}
