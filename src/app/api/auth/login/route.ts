import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { query } from "@/lib/db/pg"
import { verifyPassword } from "@/lib/auth/passwords"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Password sign-in for player accounts on Fly Postgres. The account must
 * have a password and a confirmed email (see /api/auth/signup and
 * /auth/verify). Sets the HMAC-signed session cookie.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 })
  }
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 })
  }

  const found = await query(
    "SELECT id, password_hash, email_verified_at FROM users WHERE email = $1",
    [email]
  )
  const row = found.rows[0] as
    | { id: string; password_hash: string | null; email_verified_at: string | null }
    | undefined

  if (!row) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }
  if (!row.password_hash) {
    // Account from the email-only period: it never had a password. The
    // reset flow sets one and confirms the email in the same step.
    return NextResponse.json(
      { error: "This account has no password yet. Use Forgot Password to set one, then log in." },
      { status: 400 }
    )
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }
  if (!row.email_verified_at) {
    return NextResponse.json(
      { error: "Please confirm your email first. Check your inbox for the confirmation link." },
      { status: 403 }
    )
  }

  const sessionValue = await createSession(row.id)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  })
  return res
}

/** POST /api/auth/logout — clears the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 })
  return res
}
