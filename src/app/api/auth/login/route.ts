import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { ensureUser, createSession, COOKIE_NAME } from '@/lib/auth/session'

/**
 * POST /api/auth/login
 * Body: { email: string, displayName?: string }
 *
 * Minimal email login for howgamersgame (Supabase Auth removed 2026-10-06).
 * Creates the user if needed, sets the HMAC-signed session cookie.
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; displayName?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) : undefined

  let userId: string
  try {
    userId = await ensureUser(email, displayName)
  } catch (err) {
    console.error('[auth/login] ensureUser failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not sign in' }, { status: 500 })
  }

  const sessionValue = await createSession(userId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90, // 90 days
  })
  return res
}

/** POST /api/auth/logout — clears the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return res
}
