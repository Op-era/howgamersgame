import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { query } from '@/lib/db/pg'

/**
 * Minimal session for howgamersgame on Fly Postgres.
 * Replaces Supabase Auth (removed 2026-10-06).
 *
 * The session cookie holds "<userId>.<signature>" where the signature is
 * HMAC-SHA256(userId, SESSION_SECRET). httpOnly, sameSite lax.
 */

const COOKIE_NAME = 'hgg_session'

function getSecret(): string {
  const s = process.env.SESSION_SECRET || process.env.AUTH_SECRET
  if (!s) throw new Error('SESSION_SECRET / AUTH_SECRET is not configured')
  return s
}

function sign(userId: string): string {
  return createHmac('sha256', getSecret()).update(userId).digest('hex')
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const store = await cookies()
  const raw = store.get(COOKIE_NAME)?.value
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 1) return null
  const userId = raw.slice(0, dot)
  const sig = raw.slice(dot + 1)
  const expected = sign(userId)
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  const r = await query('SELECT id, email FROM users WHERE id = $1', [userId])
  const row = (r.rows[0] as { id: string; email: string } | undefined)
  if (!row) return null
  return { id: row.id, email: row.email }
}

export async function createSession(userId: string): Promise<string> {
  return `${userId}.${sign(userId)}`
}

/** Ensure a user + profile exist for this email; returns the user id. */
export async function ensureUser(email: string, displayName?: string): Promise<string> {
  const clean = email.toLowerCase().trim()
  const existing = await query('SELECT id FROM users WHERE email = $1', [clean])
  if (existing.rows[0]) {
    const id = (existing.rows[0] as { id: string }).id
    await query('INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id])
    return id
  }
  const created = await query(
    'INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id',
    [clean, displayName ?? null]
  )
  const id = (created.rows[0] as { id: string }).id
  await query('INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id])
  return id
}

export { COOKIE_NAME }
