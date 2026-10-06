import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { query } from '@/lib/db/pg'

/** GET /api/auth/me — current session user with coin balance. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ user: null })
  }
  const r = await query('SELECT coin_balance FROM profiles WHERE id = $1', [user.id])
  const row = r.rows[0] as { coin_balance: number } | undefined
  const res = NextResponse.json({
    user: { id: user.id, email: user.email, coin_balance: row?.coin_balance ?? 0 },
  })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
