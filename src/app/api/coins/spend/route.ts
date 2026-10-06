import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { query } from '@/lib/db/pg'
import { verifyGameApiKey } from '@/lib/auth/gameApiKey'
import { mapWalletResult, parseWalletRequest } from '@/lib/coins/wallet'

/**
 * POST /api/coins/spend
 * Body: { userId: string, amount: number, reason?: string, idempotencyKey?: string }
 * Header (optional alternative to the body field): Idempotency-Key
 *
 * Deducts coins from a user on behalf of a game.
 * Requires Authorization: Bearer <game-api-key>. Players cannot call this: the game key is
 * issued by an admin per game and must stay on the game's server.
 *
 * The change is one atomic SQL function (row lock, no negative balance, ledger row).
 * Send a unique Idempotency-Key per logical operation and reuse it when retrying;
 * a repeat returns the original result with "replayed": true and changes nothing.
 * Set COINS_REQUIRE_IDEMPOTENCY_KEY=true to make the key mandatory.
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyGameApiKey(request)
  if (!authResult.ok || !authResult.gameId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseWalletRequest('spend', body, request.headers.get('Idempotency-Key'), {
    requireIdempotencyKey: process.env.COINS_REQUIRE_IDEMPOTENCY_KEY === 'true',
  })
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const { userId, amount, reason, idempotencyKey } = parsed.value

  let data: { status?: string; balance?: number } | null = null
  let error: { message: string } | null = null
  try {
    const r = await query(`SELECT spend_coins($1,$2,$3,$4,$5) AS result`, [
      userId,
      authResult.gameId,
      amount,
      reason ?? `Spent in ${authResult.gameName ?? 'game'}`,
      idempotencyKey,
    ])
    data = (r.rows[0] as { result: { status?: string; balance?: number } }).result
  } catch (err) {
    error = { message: err instanceof Error ? err.message : 'spend_coins failed' }
    console.error('[coins/spend] query failed', error.message)
  }

  const outcome = mapWalletResult('spend', amount, { data, error })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
