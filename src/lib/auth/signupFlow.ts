export interface SignupUserRow {
  id: string
  display_name: string | null
  password_hash: string | null
  email_verified_at: unknown | null
}

export interface SignupStore {
  findByEmail(email: string): Promise<SignupUserRow | undefined>
  createUser(
    email: string,
    displayName: string,
    resetTokenHash: string,
    resetExpires: Date
  ): Promise<void>
  setResetToken(userId: string, resetTokenHash: string, resetExpires: Date): Promise<void>
}

export interface SignupDeps {
  store: SignupStore
  createToken(): { raw: string; hash: string }
  sendEmail(to: string, displayName: string, url: string): Promise<void>
  defer(fn: () => Promise<void>): void
  appUrl: string
  now?: () => number
}

export const SIGNUP_OK = { status: 200, body: { ok: true } }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handleSignup(
  deps: SignupDeps,
  input: { email: unknown; username?: unknown }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  if (!EMAIL_RE.test(email)) {
    return { status: 400, body: { error: "Please enter a valid email address." } }
  }

  const displayName =
    (typeof input.username === "string" && input.username.trim().slice(0, 80)) ||
    email.split("@")[0]

  const row = await deps.store.findByEmail(email)

  if (!row) {
    const token = deps.createToken()
    const expires = new Date((deps.now ? deps.now() : Date.now()) + 24 * 60 * 60 * 1000)
    await deps.store.createUser(email, displayName, token.hash, expires)
    deps.defer(async () => {
      await deps.sendEmail(email, displayName, `${deps.appUrl}/auth/reset?token=${token.raw}&welcome=1`)
    })
    return SIGNUP_OK
  }

  if (row.password_hash && row.email_verified_at) {
    return SIGNUP_OK
  }

  const token = deps.createToken()
  const expires = new Date((deps.now ? deps.now() : Date.now()) + 24 * 60 * 60 * 1000)
  await deps.store.setResetToken(row.id, token.hash, expires)
  deps.defer(async () => {
    await deps.sendEmail(
      email,
      row.display_name || email.split("@")[0],
      `${deps.appUrl}/auth/reset?token=${token.raw}&welcome=1`
    )
  })
  return SIGNUP_OK
}
