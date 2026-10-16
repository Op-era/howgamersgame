import { query } from "@/lib/db/pg"
import { createActionToken } from "@/lib/auth/passwords"
import { sendPasswordResetEmail } from "@/lib/resend/client"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/reset
 * Body: { email: string }
 *
 * Sends the password reset link through Resend (link valid 1 hour, see
 * the email copy in lib/resend/client). Always answers ok for a
 * well-formed email so the response never reveals whether an account
 * exists. Setting the new password also confirms the email, which is
 * how accounts from the email-only period get their first password.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://howgamersgame.online"

export async function POST(req: Request) {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 })
  }

  const found = await query("SELECT id FROM users WHERE email = $1", [email])
  const row = found.rows[0] as { id: string } | undefined
  if (!row) return NextResponse.json({ ok: true })

  const token = createActionToken()
  const expires = new Date(Date.now() + 60 * 60 * 1000)
  await query("UPDATE users SET reset_token_hash = $2, reset_expires_at = $3 WHERE id = $1", [
    row.id,
    token.hash,
    expires,
  ])

  try {
    await sendPasswordResetEmail(email, `${APP_URL()}/auth/reset?token=${token.raw}`)
  } catch (mailErr: any) {
    return NextResponse.json({ error: "Email failed: " + mailErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
