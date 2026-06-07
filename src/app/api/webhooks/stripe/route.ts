import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/server'
import { sendCoinPurchaseEmail } from '@/lib/resend/client'
import { COIN_PACKAGES } from '@/lib/stripe/client'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as {
    metadata?: Record<string, string>
    payment_intent?: string
    customer_email?: string | null
    customer_details?: { email?: string | null; name?: string | null }
    amount_total?: number | null
  }

  const { userId, packageId, coins: coinsStr } = session.metadata ?? {}
  if (!userId || !packageId || !coinsStr) {
    return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
  }

  const coins = parseInt(coinsStr, 10)
  const pkg = COIN_PACKAGES.find(p => p.id === packageId)
  if (!coins || !pkg) {
    return NextResponse.json({ error: 'Invalid package data' }, { status: 400 })
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : null

  const supabase = await createAdminClient()

  // Idempotency: skip if this payment intent was already processed
  if (paymentIntentId) {
    const { data: existing } = await supabase
      .from('coin_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single()

    if (existing) {
      return NextResponse.json({ received: true, skipped: 'duplicate' })
    }
  }

  // Credit coins
  const { data: profile } = await supabase
    .from('profiles')
    .select('coin_balance, display_name')
    .eq('id', userId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const newBalance = profile.coin_balance + coins

  await supabase
    .from('profiles')
    .update({
      coin_balance: newBalance,
      total_coins_purchased: supabase.rpc('increment', { x: coins }) as unknown as number,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  // Simpler update without RPC for total_coins_purchased
  const { data: updated } = await supabase
    .from('profiles')
    .select('total_coins_purchased')
    .eq('id', userId)
    .single()

  await supabase.from('profiles').update({
    total_coins_purchased: (updated?.total_coins_purchased ?? 0) + coins,
  }).eq('id', userId)

  await supabase.from('coin_transactions').insert({
    user_id: userId,
    type: 'purchase',
    amount: coins,
    balance_after: newBalance,
    description: `Purchased ${pkg.name} pack (${coins.toLocaleString()} coins)`,
    stripe_payment_intent_id: paymentIntentId,
  })

  // Send confirmation email
  const email = session.customer_email ?? session.customer_details?.email
  if (email) {
    const displayName = session.customer_details?.name ?? profile.display_name ?? 'Gamer'
    await sendCoinPurchaseEmail(
      email,
      displayName,
      pkg.name,
      coins,
      session.amount_total ?? pkg.priceCents,
    ).catch(() => {})
  }

  return NextResponse.json({ received: true, credited: coins })
}
