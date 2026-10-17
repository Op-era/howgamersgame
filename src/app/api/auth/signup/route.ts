import { query } from "@/lib/db/pg"
import { createActionToken } from "@/lib/auth/passwords"
import { sendConfirmationEmail } from "@/lib/resend/client"
import { handleSignup, SIGNUP_OK } from "@/lib/auth/signupFlow"
import { NextResponse, after } from "next/server"

/**
 * POST /api/auth/signup
 * Body: { email: string, password?: string, username?: string }
 *
 * Signup never stores a password. It creates a new account (or refreshes
 * the reset token for an unverified/legacy account) and emails a link to
 * /auth/reset?token=...&welcome=1. The password is only set when that
 * token is confirmed, proving ownership of the email address.
 */
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://howgamersgame.online"

export async function POST(req: Request) {
  let body: { email?: unknown; username?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = await handleSignup(
    {
      store: {
        async findByEmail(email: string) {
          const found = await query(
            "SELECT id, display_name, password_hash, email_verified_at FROM users WHERE email = $1",
            [email]
          )
          return found.rows[0] as
            | {
                id: string
                display_name: string | null
                password_hash: string | null
                email_verified_at: unknown | null
              }
            | undefined
        },
        async createUser(email: string, displayName: string, resetTokenHash: string, resetExpires: Date) {
          const created = await query(
            "INSERT INTO users (email, display_name, reset_token_hash, reset_expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING id",
            [email, displayName, resetTokenHash, resetExpires]
          )
          const row = created.rows[0] as { id: string } | undefined
          if (row) {
            await query("INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [row.id])
          }
        },
        async setResetToken(userId: string, resetTokenHash: string, resetExpires: Date) {
          await query(
            "UPDATE users SET reset_token_hash = $2, reset_expires_at = $3 WHERE id = $1",
            [userId, resetTokenHash, resetExpires]
          )
        },
      },
      createToken: createActionToken,
      sendEmail: sendConfirmationEmail,
      defer(fn: () => Promise<void>) {
        after(async () => {
          try {
            await fn()
          } catch (err) {
            console.error("[signup] email failed", err)
          }
        })
      },
      appUrl: APP_URL(),
    },
    { email: body.email, username: body.username }
  )

  return NextResponse.json(result.body, { status: result.status })
}
