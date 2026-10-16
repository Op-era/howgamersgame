import { query } from "@/lib/db/pg"
import { hashToken } from "@/lib/auth/passwords"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * GET /auth/verify?token=...
 * Landing for the Resend confirmation link: marks the account verified,
 * starts the same HMAC session the rest of the site uses, and sends the
 * player into the console room.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get("token")
  if (!token) return NextResponse.redirect(`${origin}/auth/login`)

  const found = await query(
    "SELECT id FROM users WHERE verification_token_hash = $1 AND verification_expires_at > now() AND email_verified_at IS NULL",
    [hashToken(token)]
  )
  const row = found.rows[0] as { id: string } | undefined
  if (!row) return NextResponse.redirect(`${origin}/auth/login?verify=failed`)

  await query(
    "UPDATE users SET email_verified_at = now(), verification_token_hash = NULL, verification_expires_at = NULL WHERE id = $1",
    [row.id]
  )

  const res = NextResponse.redirect(`${origin}/console`)
  res.cookies.set(COOKIE_NAME, await createSession(row.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days, same as login
  })
  return res
}
