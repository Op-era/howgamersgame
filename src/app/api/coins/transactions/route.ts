import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { query } from '@/lib/db/pg'

/** GET /api/coins/transactions — signed-in user's recent coin transactions. */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await query(
    `SELECT id, type, amount, description, created_at FROM coin_transactions
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [user.id]
  )
  const res = NextResponse.json({ transactions: r.rows })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
