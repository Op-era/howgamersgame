import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db/pg'
import { verifyGameApiKey } from '@/lib/auth/gameApiKey'

/**
 * GET /api/coins/balance?userId=<uuid>
 *
 * Used by games to check a player's coin balance.
 * Requires Authorization: Bearer <game-api-key>
 */
export async function GET(request: NextRequest) {
  const authResult = await verifyGameApiKey(request)
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  const r = await query('SELECT coin_balance FROM profiles WHERE id = $1', [userId])
  const row = r.rows[0] as { coin_balance: number } | undefined
  if (!row) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ userId, balance: row.coin_balance })
}
