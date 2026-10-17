import { query } from "@/lib/db/pg"
import { createActionToken } from "@/lib/auth/passwords"
import { sendPasswordResetEmail } from "@/lib/resend/client"
import { handleResetRequest } from "@/lib/auth/resetFlow"
import { NextResponse, after } from "next/server"

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
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://howgamersgame.online"

export async function POST(req: Request) {
  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = await handleResetRequest(
    {
      store: {
        findByEmail: async (email: string) => {
          const found = await query("SELECT id FROM users WHERE email = $1", [email])
          return found.rows[0] as { id: string } | undefined
        },
        setResetToken: async (userId: string, resetTokenHash: string, resetExpires: Date) => {
          await query("UPDATE users SET reset_token_hash = $2, reset_expires_at = $3 WHERE id = $1", [
            userId,
            resetTokenHash,
            resetExpires,
          ])
        },
      },
      createToken: createActionToken,
      sendEmail: sendPasswordResetEmail,
      defer: (fn: () => Promise<void>) => {
        after(async () => {
          try {
            await fn()
          } catch (err) {
            console.error("[reset] email failed", err instanceof Error ? err.name : "error")
          }
        })
      },
      appUrl: APP_URL(),
    },
    { email: body.email }
  )

  return NextResponse.json(result.body, { status: result.status })
}
