import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isPlausibleSessionId, toPurchaseHistoryItem } from '@/lib/coins/history'
import type { RevenueRow } from '@/lib/coins/history'

/**
 * GET /api/coins/purchases[?session_id=cs_...]
 * The signed-in user's own coin purchases (newest first, max 25).
 * With session_id, returns just that purchase if it belongs to the caller; the
 * success page polls this until the webhook has credited the coins.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (sessionId !== null && !isPlausibleSessionId(sessionId)) {
    return NextResponse.json({ error: 'Invalid session_id' }, { status: 400 })
  }

  // revenue_events has no RLS policies on purpose (service role only), so the ownership
  // filter below is the access control. It is always applied.
  let query = createServiceClient()
    .from('revenue_events')
    .select('created_at, package_id, gross_cents, currency, coins_credited, bonus_coins, stripe_checkout_session_id')
    .eq('user_id', user.id)
    .eq('event_type', 'coin_purchase')
    .order('created_at', { ascending: false })
    .limit(25)
  if (sessionId) query = query.eq('stripe_checkout_session_id', sessionId)

  const { data, error } = await query
  if (error) {
    console.error('[coins/purchases] query failed', error.message)
    return NextResponse.json({ error: 'Could not load purchases' }, { status: 500 })
  }

  const res = NextResponse.json({ purchases: (data as RevenueRow[]).map(toPurchaseHistoryItem) })
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
