import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { query } from "@/lib/db/pg"
import { verifyPassword, dummyVerify, passwordNeedsRehash, hashPassword } from "@/lib/auth/passwords"
import { createSession, COOKIE_NAME } from "@/lib/auth/session"
import { handleLogin } from "@/lib/auth/loginFlow"

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Password sign-in for player accounts on Fly Postgres. The account must
 * have a password and a confirmed email (see /api/auth/signup and
 * /auth/verify). Sets the HMAC-signed session cookie.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = await handleLogin(
    {
      findByEmail: async (email) => {
        const found = await query(
          "SELECT id, password_hash, email_verified_at FROM users WHERE email = $1",
          [email]
        )
        return found.rows[0] as
          | { id: string; password_hash: string | null; email_verified_at: string | null }
          | undefined
      },
      updatePasswordHash: async (userId, oldHash, newHash) => {
        await query("UPDATE users SET password_hash = $3 WHERE id = $1 AND password_hash = $2", [
          userId,
          oldHash,
          newHash,
        ])
      },
      verify: verifyPassword,
      dummyVerify,
      needsRehash: passwordNeedsRehash,
      rehash: hashPassword,
    },
    { email: body?.email, password: body?.password }
  )

  if (result.userId) {
    const sessionValue = await createSession(result.userId)
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

  return NextResponse.json(result.body, { status: result.status })
}

/** POST /api/auth/logout — clears the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 })
  return res
}
