export interface LoginRow {
  id: string
  password_hash: string | null
  email_verified_at: unknown | null
}

export interface LoginDeps {
  findByEmail(email: string): Promise<LoginRow | undefined>
  updatePasswordHash(userId: string, oldHash: string, newHash: string): Promise<void>
  verify(password: string, hash: string): Promise<boolean>
  dummyVerify(password: string): Promise<void>
  needsRehash(hash: string): boolean
  rehash(password: string): Promise<string>
}

export const LOGIN_FAILED_MESSAGE =
  "Invalid email or password. If you have not set a password yet, use Forgot Password."

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function handleLogin(
  deps: LoginDeps,
  input: { email: unknown; password: unknown }
): Promise<{ status: number; body: Record<string, unknown>; userId?: string }> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : ""
  const password = typeof input.password === "string" ? input.password : ""

  if (!EMAIL_RE.test(email)) {
    return { status: 400, body: { error: "Valid email required" } }
  }
  if (!password) {
    return { status: 400, body: { error: "Password required" } }
  }

  const row = await deps.findByEmail(email)

  if (!row || !row.password_hash) {
    await deps.dummyVerify(password)
    return { status: 401, body: { error: LOGIN_FAILED_MESSAGE } }
  }

  const valid = await deps.verify(password, row.password_hash)
  if (!valid) {
    return { status: 401, body: { error: LOGIN_FAILED_MESSAGE } }
  }

  if (!row.email_verified_at) {
    return {
      status: 403,
      body: { error: "Please confirm your email first. Check your inbox for the confirmation link." },
    }
  }

  if (deps.needsRehash(row.password_hash)) {
    try {
      const newHash = await deps.rehash(password)
      await deps.updatePasswordHash(row.id, row.password_hash, newHash)
    } catch {
      // never fail the login because of the upgrade
    }
  }

  return { status: 200, body: { ok: true }, userId: row.id }
}
