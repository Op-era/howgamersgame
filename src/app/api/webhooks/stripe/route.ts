import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { createServiceClient } from '@/lib/supabase/service'
import { sendCoinPurchaseEmail } from '@/lib/resend/client'
import { handleStripeEvent } from '@/lib/coins/webhook'
import type { CreditResult, StripeEventLike } from '@/lib/coins/webhook'

export const runtime = 'nodejs'

/**
 * Stripe webhook. Register for: checkout.session.completed,
 * checkout.session.async_payment_succeeded. See docs/STRIPE-COINS.md.
 *
 * Coins are credited by the credit_coin_purchase() SQL function, which is atomic and
 * idempotent on both the Stripe event id and the Checkout Session id.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: StripeEventLike
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret) as unknown as StripeEventLike
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const outcome = await handleStripeEvent(event, {
    creditPurchase: async (eventId, eventType, p): Promise<CreditResult> => {
      const supabase = createServiceClient()
      const { data, error } = await supabase.rpc('credit_coin_purchase', {
        p_event_id: eventId,
        p_event_type: eventType,
        p_session_id: p.sessionId,
        p_payment_intent_id: p.paymentIntentId,
        p_user_id: p.userId,
        p_package_id: p.pack.id,
        p_coins: p.coins,
        p_bonus_coins: p.bonusCoins,
        p_gross_cents: p.grossCents,
        p_currency: p.currency,
        p_description: `Purchased ${p.pack.name} pack (${p.coins.toLocaleString('en-US')} coins)`,
      })
      if (error) throw new Error(error.message)
      const r = data as { status?: string; balance_after?: number } | null
      if (r?.status === 'credited') return { status: 'credited', balanceAfter: r.balance_after ?? 0 }
      if (r?.status === 'duplicate_event') return { status: 'duplicate_event' }
      if (r?.status === 'duplicate_session') return { status: 'duplicate_session' }
      throw new Error(`unexpected credit_coin_purchase result: ${JSON.stringify(r)}`)
    },
    sendEmail: async p => {
      if (!p.email) return
      await sendCoinPurchaseEmail(p.email, p.customerName ?? 'Gamer', p.pack.name, p.coins, p.grossCents)
    },
    log: (level, message, extra) => {
      const line = `[stripe-webhook] ${message}`
      if (level === 'error') console.error(line, extra ?? {})
      else console.log(line, extra ?? {})
    },
  })

  return NextResponse.json(outcome.body, { status: outcome.status })
}
