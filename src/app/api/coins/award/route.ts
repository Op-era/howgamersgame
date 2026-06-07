import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyGameApiKey } from '@/lib/auth/gameApiKey'

/**
 * POST /api/coins/award
 * Body: { userId: string, amount: number, reason: string }
 *
 * Awards coins to a user (from a game reward, achievement, etc.).
 * Requires Authorization: Bearer <game-api-key>
 * Max award per call: 10,000 coins (anti-exploit)
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

  const MAX_AWARD = 10_000
  if (amount > MAX_AWARD) {
    return NextResponse.json({ error: `Max award per call is ${MAX_AWARD}` }, { status: 400 })
  }

  const supabase = await createAdminClient()

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('coin_balance')
    .eq('id', userId)
    .single()

  if (fetchError || !profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const newBalance = profile.coin_balance + amount

  await supabase
    .from('profiles')
    .update({ coin_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', userId)

  await supabase.from('coin_transactions').insert({
    user_id: userId,
    type: 'award',
    amount,
    balance_after: newBalance,
    description: reason ?? `Awarded by ${authResult.gameName ?? 'game'}`,
    game_id: authResult.gameId,
  })

  return NextResponse.json({
    success: true,
    awarded: amount,
    balance: newBalance,
  })
}
