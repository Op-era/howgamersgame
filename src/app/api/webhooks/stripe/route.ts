import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getStripe } from '@/lib/stripe/client'
import { query } from '@/lib/db/pg'
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
      let rows: { credit_coin_purchase: { status?: string; balance_after?: number } }[]
      try {
        const r = await query(
          `SELECT credit_coin_purchase($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS credit_coin_purchase`,
          [
            eventId, eventType, p.sessionId, p.paymentIntentId, p.userId,
            p.pack.id, p.coins, p.bonusCoins, p.grossCents, p.currency,
            `Purchased ${p.pack.name} pack (${p.coins.toLocaleString('en-US')} coins)`,
            p.termsVersion, p.termsAcceptedAt,
          ]
        )
        rows = r.rows as { credit_coin_purchase: { status?: string; balance_after?: number } }[]
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : 'credit_coin_purchase failed')
      }
      const result = rows[0]?.credit_coin_purchase
      if (result?.status === 'credited') return { status: 'credited', balanceAfter: result.balance_after ?? 0 }
      if (result?.status === 'duplicate_event') return { status: 'duplicate_event' }
      if (result?.status === 'duplicate_session') return { status: 'duplicate_session' }
      throw new Error(`unexpected credit_coin_purchase result: ${JSON.stringify(result)}`)
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
