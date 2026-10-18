export interface ResetStore {
  findByEmail(email: string): Promise<{ id: string } | undefined>
  setResetToken(userId: string, resetTokenHash: string, resetExpires: Date): Promise<void>
}

export interface ResetDeps {
  store: ResetStore
  createToken(): { raw: string; hash: string }
  sendEmail(to: string, url: string): Promise<void>
  defer(fn: () => Promise<void>): void
  appUrl: string
  now?: () => number
}

export const RESET_OK = { status: 200, body: { ok: true } }
export const NO_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handleResetRequest(
  deps: ResetDeps,
  input: { email: unknown }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return { status: 400, body: { error: "Please enter a valid email address." } }
  }

  const row = await deps.store.findByEmail(email)
  const token = deps.createToken()
  const expires = new Date((deps.now ? deps.now() : Date.now()) + 60 * 60 * 1000)
  await deps.store.setResetToken(row ? row.id : NO_ACCOUNT_ID, token.hash, expires)

  if (row) {
    deps.defer(async () => {
      await deps.sendEmail(email, `${deps.appUrl}/auth/reset?token=${token.raw}`)
    })
  }

  return RESET_OK
}
