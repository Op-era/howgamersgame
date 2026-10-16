import { query } from "@/lib/db/pg"
import { hashPassword, hashToken } from "@/lib/auth/passwords"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/reset/confirm
 * Body: { token: string, password: string }
 *
 * Completes a reset: stores the new password hash, clears the token,
 * and marks the email confirmed (whoever holds the link controls the
 * inbox).
 */
export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const token = typeof body.token === "string" ? body.token : ""
  const password = typeof body.password === "string" ? body.password : ""
  if (!token) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 })
  }

  const found = await query(
    "SELECT id FROM users WHERE reset_token_hash = $1 AND reset_expires_at > now()",
    [hashToken(token)]
  )
  const row = found.rows[0] as { id: string } | undefined
  if (!row) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 })
  }

  await query(
    "UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()), reset_token_hash = NULL, reset_expires_at = NULL WHERE id = $1",
    [row.id, await hashPassword(password)]
  )

  return NextResponse.json({ ok: true })
}
