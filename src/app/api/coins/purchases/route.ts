import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { query } from '@/lib/db/pg'
import { isPlausibleSessionId, toPurchaseHistoryItem } from '@/lib/coins/history'
import type { RevenueRow } from '@/lib/coins/history'

/**
 * GET /api/coins/purchases[?session_id=cs_...]
 * The signed-in user's own coin purchases (newest first, max 25).
 * With session_id, returns just that purchase if it belongs to the caller; the
 * success page polls this until the webhook has credited the coins.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (sessionId !== null && !isPlausibleSessionId(sessionId)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
  }

  // The ownership filter below is the access control. It is always applied.
  const params: unknown[] = [user.id]
  let sql = `SELECT created_at, package_id, gross_cents, currency, coins_credited, bonus_coins, stripe_checkout_session_id
    FROM revenue_events WHERE user_id = $1 AND event_type = 'coin_purchase'`
  if (sessionId) {
    params.push(sessionId)
    sql += ` AND stripe_checkout_session_id = $2`
  }
  sql += ` ORDER BY created_at DESC LIMIT 25`

  let rows: RevenueRow[]
  try {
    const r = await query(sql, params)
    rows = r.rows as RevenueRow[]
  } catch (err) {
    console.error('[coins/purchases] query failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not load purchases' }, { status: 500 })
  }

  const res = NextResponse.json({ purchases: rows.map(toPurchaseHistoryItem) })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
