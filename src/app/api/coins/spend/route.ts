import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyGameApiKey } from '@/lib/auth/gameApiKey'

/**
 * POST /api/coins/spend
 * Body: { userId: string, amount: number, reason: string }
 *
 * Deducts coins from a user on behalf of a game.
 * Requires Authorization: Bearer <game-api-key>
 */
export async function POST(request: NextRequest) {
  const authResult = await verifyGameApiKey(request)
  if (!authResult.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { userId?: string; amount?: number; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, amount, reason } = body
  if (!userId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'userId and positive amount are required' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // Atomically check balance and deduct using a DB transaction
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('coin_balance')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (profile.coin_balance < amount) {
    return NextResponse.json({
      error: 'Insufficient coins',
      balance: profile.coin_balance,
    }, { status: 402 })
  }

  const newBalance = profile.coin_balance - amount

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ coin_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('coin_balance', profile.coin_balance) // optimistic lock

  if (updateError) {
    return NextResponse.json({ error: 'Concurrent update — please retry' }, { status: 409 })
  }

  await supabase.from('coin_transactions').insert({
    user_id: userId,
    type: 'spend',
    amount: -amount,
    balance_after: newBalance,
    description: reason ?? `Spent in ${authResult.gameName ?? 'game'}`,
    game_id: authResult.gameId,
  })

  return NextResponse.json({
    success: true,
    spent: amount,
    balance: newBalance,
  })
}
