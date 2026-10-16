import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db/pg'
import { isAuthorizedCron } from '@/lib/coins/cronAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/expire-promo
 *
 * Vercel Cron calls this nightly (see vercel.json) and sends
 * Authorization: Bearer $CRON_SECRET. The sweep is idempotent so retries
 * are safe. It does nothing until migration 2026-10-16-g-promo-grants.sql
 * is applied (the query errors and returns 500 until then).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 })
  }

  if (!isAuthorizedCron(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const r = await query('SELECT expire_promo_coins() AS result', [])
    return NextResponse.json(r.rows[0]?.result ?? { status: 'ok' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[expire-promo] failed', message)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }
}
