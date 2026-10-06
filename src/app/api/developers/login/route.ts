import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/db/pg";
import { createDevSession, devCookieSettings, DEV_COOKIE_NAME } from "@/lib/auth/devSession";

export async function POST(request: NextRequest) {
  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  const r = await query("SELECT id, email, name, studio_name FROM developers WHERE email = $1", [email]);
  const dev = r.rows[0] as { id: string; email: string; name: string; studio_name: string | null } | undefined;
  if (!dev) return NextResponse.json({ error: "No developer account found for this email" }, { status: 404 });
  const res = NextResponse.json({ ok: true, developer: dev });
  res.cookies.set(DEV_COOKIE_NAME, await createDevSession(dev.id), devCookieSettings(60 * 60 * 24 * 90));
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEV_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
