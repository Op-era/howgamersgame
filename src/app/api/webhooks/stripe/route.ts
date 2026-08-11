import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/server'
import { sendCoinPurchaseEmail } from '@/lib/resend/client'
import { COIN_PACKAGES } from '@/lib/stripe/client'
import { SUBSCRIPTION_TIERS, SubscriptionTier, TIER_ORDER } from '@/lib/stripe/subscriptions'
import Stripe from 'stripe'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // ── One-time coin purchase ─────────────────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const { userId, packageId, coins: coinsStr, tier } = session.metadata ?? {}

    // Subscription checkout — handled via subscription events below
    if (session.mode === 'subscription' || tier) {
      return NextResponse.json({ received: true })
    }

    if (!userId || !packageId || !coinsStr) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const coins = parseInt(coinsStr, 10)
    const pkg = COIN_PACKAGES.find(p => p.id === packageId)
    if (!coins || !pkg) return NextResponse.json({ error: 'Invalid package' }, { status: 400 })

    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null
    if (paymentIntentId) {
      const { data: existing } = await supabase
        .from('coin_transactions').select('id').eq('stripe_payment_intent_id', paymentIntentId).single()
      if (existing) return NextResponse.json({ received: true, skipped: 'duplicate' })
    }

    const { data: profile } = await supabase.from('profiles').select('coin_balance, display_name').eq('id', userId).single()
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const newBalance = profile.coin_balance + coins
    await supabase.from('profiles').update({ coin_balance: newBalance, updated_at: new Date().toISOString() }).eq('id', userId)
    const { data: updated } = await supabase.from('profiles').select('total_coins_purchased').eq('id', userId).single()
    await supabase.from('profiles').update({ total_coins_purchased: (updated?.total_coins_purchased ?? 0) + coins }).eq('id', userId)
    await supabase.from('coin_transactions').insert({
      user_id: userId, type: 'purchase', amount: coins, balance_after: newBalance,
      description: `Purchased ${pkg.name} pack (${coins.toLocaleString()} coins)`,
      stripe_payment_intent_id: paymentIntentId,
    })

    const email = session.customer_email ?? (session.customer_details as { email?: string } | null)?.email
    if (email) {
      const displayName = (session.customer_details as { name?: string } | null)?.name ?? profile.display_name ?? 'Gamer'
      await sendCoinPurchaseEmail(email, displayName, pkg.name, coins, session.amount_total ?? pkg.priceCents).catch(() => {})
    }
    return NextResponse.json({ received: true, credited: coins })
  }

  // ── Subscription created or updated ───────────────────────────────────────
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata?.userId
    if (!userId) return NextResponse.json({ received: true })

    const priceId = sub.items.data[0]?.price.id
    const tier = Object.values(SUBSCRIPTION_TIERS).find(t => t.stripePriceId === priceId)?.id as SubscriptionTier | undefined
    if (!tier) return NextResponse.json({ received: true })

    const periodEnd = new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString()

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      tier,
      status: sub.status,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' })

    if (sub.status === 'active') {
      await supabase.from('profiles').update({
        subscription_tier: tier,
        subscription_status: 'active',
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      }).eq('id', userId)
    }

    return NextResponse.json({ received: true })
  }

  // ── Subscription canceled / expired ──────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata?.userId
    if (!userId) return NextResponse.json({ received: true })

    await supabase.from('subscriptions').update({
      status: 'canceled', updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', sub.id)

    await supabase.from('profiles').update({
      subscription_tier: null,
      subscription_status: 'inactive',
    }).eq('id', userId)

    return NextResponse.json({ received: true })
  }

  // ── Monthly renewal — refill coins ────────────────────────────────────────
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const subId = typeof (invoice as unknown as { subscription?: string }).subscription === 'string'
      ? (invoice as unknown as { subscription: string }).subscription
      : null
    if (!subId) return NextResponse.json({ received: true })

    // Skip the first invoice (handled at subscription.created)
    const invoiceObj = invoice as unknown as { billing_reason?: string }
    if (invoiceObj.billing_reason === 'subscription_create') return NextResponse.json({ received: true })

    const { data: subRecord } = await supabase
      .from('subscriptions').select('user_id, tier').eq('stripe_subscription_id', subId).single()
    if (!subRecord) return NextResponse.json({ received: true })

    const tierConfig = SUBSCRIPTION_TIERS[subRecord.tier as SubscriptionTier]
    if (!tierConfig) return NextResponse.json({ received: true })

    const { data: profile } = await supabase
      .from('profiles').select('coin_balance').eq('id', subRecord.user_id).single()
    if (!profile) return NextResponse.json({ received: true })

    const newBalance = profile.coin_balance + tierConfig.monthlyCoins
    await supabase.from('profiles').update({ coin_balance: newBalance }).eq('id', subRecord.user_id)
    await supabase.from('coin_transactions').insert({
      user_id: subRecord.user_id,
      type: 'award',
      amount: tierConfig.monthlyCoins,
      balance_after: newBalance,
      description: `Monthly ${tierConfig.name} coin refill`,
    })

    return NextResponse.json({ received: true, credited: tierConfig.monthlyCoins })
  }

  return NextResponse.json({ received: true })
}
