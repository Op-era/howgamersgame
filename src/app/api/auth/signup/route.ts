import { query } from "@/lib/db/pg"
import { createActionToken, hashPassword, verifyPassword } from "@/lib/auth/passwords"
import { sendConfirmationEmail } from "@/lib/resend/client"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/signup
 * Body: { email: string, password: string, username?: string }
 *
 * The built signup: free account on the Postgres users table (the same
 * stored account the coin wallet keys off), with a password the user
 * chooses and an email confirmation sent through Resend. No session is
 * issued until the email link is clicked (see /auth/verify).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://howgamersgame.online"

export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown; username?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""
  const displayName =
    (typeof body.username === "string" && body.username.trim().slice(0, 80)) || email.split("@")[0]

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 })
  }

  const found = await query(
    "SELECT id, password_hash, email_verified_at FROM users WHERE email = $1",
    [email]
  )
  const row = found.rows[0] as
    | { id: string; password_hash: string | null; email_verified_at: string | null }
    | undefined

  if (row?.password_hash && row.email_verified_at) {
    return NextResponse.json(
      { error: "An account with this email already exists. Log in instead." },
      { status: 400 }
    )
  }
  if (row?.password_hash && !row.email_verified_at) {
    // A signup that was never confirmed, repeated: resend only for the
    // person who knows the password they set.
    if (!(await verifyPassword(password, row.password_hash))) {
      return NextResponse.json(
        { error: "An account with this email already exists. Log in instead." },
        { status: 400 }
      )
    }
  }

  const token = createActionToken()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const passwordHash = await hashPassword(password)

  if (row) {
    // New account finishing signup, or an email-only-era account being
    // claimed by its owner: either way the wallet and history stay put.
    await query(
      "UPDATE users SET password_hash = $2, display_name = COALESCE(display_name, $3), verification_token_hash = $4, verification_expires_at = $5 WHERE id = $1",
      [row.id, passwordHash, displayName, token.hash, expires]
    )
  } else {
    const created = await query(
      "INSERT INTO users (email, display_name, password_hash, verification_token_hash, verification_expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [email, displayName, passwordHash, token.hash, expires]
    )
    const id = (created.rows[0] as { id: string }).id
    await query("INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [id])
  }

  try {
    await sendConfirmationEmail(email, displayName, `${APP_URL()}/auth/verify?token=${token.raw}`)
  } catch (mailErr: any) {
    return NextResponse.json(
      { error: "Account created but email failed: " + mailErr.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
