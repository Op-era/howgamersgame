import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, getPackageById } from '@/lib/stripe/client'
import { COIN_CURRENCY } from '@/lib/coins/packs'
import { COIN_TERMS_SUMMARY, checkTermsAcceptance } from '@/lib/coins/terms'

/**
 * POST /api/coins/purchase
 * Body: { packageId: string, acceptedTerms: true, termsVersion: string }
 *
 * Creates a Stripe Checkout session for a coin package.
 * User must be authenticated and must have accepted the current coin purchase terms
 * (all sales final, no refunds, no cash value). The acceptance time is stamped here, on the
 * server, and stored in the Checkout Session and PaymentIntent metadata and then on the
 * revenue_events row. Price and coin amount come from the server pack table;
 * nothing price-related is read from the request.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { packageId?: unknown; acceptedTerms?: unknown; termsVersion?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pkg = getPackageById(body?.packageId)
  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package' }, { status: 400 })
  }

  const terms = checkTermsAcceptance(body)
  if (!terms.ok) {
    return NextResponse.json({ error: terms.error, code: terms.code }, { status: terms.status })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000')
  if (!appUrl || !process.env.STRIPE_SECRET_KEY) {
    console.error('[coins/purchase] NEXT_PUBLIC_APP_URL or STRIPE_SECRET_KEY is not configured')
    return NextResponse.json({ error: 'Purchases are not available right now' }, { status: 503 })
  }

  const metadata = {
    userId: user.id,
    packageId: pkg.id,
    coins: String(pkg.coins), // informational only; the webhook credits from the server pack table
    termsVersion: terms.version,
    termsAcceptedAt: terms.acceptedAt,
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: [
        {
          price_data: {
            currency: COIN_CURRENCY,
            unit_amount: pkg.priceCents,
            product_data: {
              name: `${pkg.name} Coin Pack — ${pkg.coins.toLocaleString('en-US')} Coins`,
              description: pkg.bonusCoins > 0
                ? `${pkg.coins.toLocaleString('en-US')} coins + ${pkg.bonusCoins.toLocaleString('en-US')} bonus for HowGamersGame`
                : `${pkg.coins.toLocaleString('en-US')} coins for HowGamersGame`,
            },
          },
          quantity: 1,
        },
      ],
      metadata,
      // Shown on Stripe's payment page next to the pay button
      custom_text: { submit: { message: COIN_TERMS_SUMMARY } },
      // Lets you find the user/pack from a Payment in the Stripe Dashboard or on refunds
      payment_intent_data: { metadata },
      // {CHECKOUT_SESSION_ID} is substituted by Stripe; the success page uses it to wait for the webhook
      success_url: `${appUrl}/store/success?pkg=${pkg.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/store?cancelled=1`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
    }
    return NextResponse.json({ checkoutUrl: session.url })
  } catch (err) {
    console.error('[coins/purchase] Stripe checkout creation failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 502 })
  }
}
