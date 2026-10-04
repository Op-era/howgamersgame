import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyGameApiKey } from '@/lib/auth/gameApiKey'
import { mapWalletResult, parseWalletRequest } from '@/lib/coins/wallet'

/**
 * POST /api/coins/award
 * Body: { userId: string, amount: number, reason?: string, idempotencyKey?: string }
 * Header (optional alternative to the body field): Idempotency-Key
 *
 * Awards coins to a user (game reward, achievement, etc.). Max 10,000 coins per call.
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

  const parsed = parseWalletRequest('award', body, request.headers.get('Idempotency-Key'), {
    requireIdempotencyKey: process.env.COINS_REQUIRE_IDEMPOTENCY_KEY === 'true',
  })
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const { userId, amount, reason, idempotencyKey } = parsed.value

  const { data, error } = await createServiceClient().rpc('award_coins', {
    p_user_id: userId,
    p_game_id: authResult.gameId,
    p_amount: amount,
    p_reason: reason ?? `Awarded in ${authResult.gameName ?? 'game'}`,
    p_idempotency_key: idempotencyKey,
  })
  if (error) console.error('[coins/award] rpc failed', error.message)

  const outcome = mapWalletResult('award', amount, { data, error })
  return NextResponse.json(outcome.body, { status: outcome.status })
}
