import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, getPackageById } from '@/lib/stripe/client'

/**
 * POST /api/coins/purchase
 * Body: { packageId: string }
 *
 * Creates a Stripe Checkout session for a coin package.
 * User must be authenticated.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { packageId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const pkg = getPackageById(body.packageId ?? '')
  if (!pkg) {
    return NextResponse.json({ error: 'Invalid package' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: pkg.priceCents,
          product_data: {
            name: `${pkg.name} Coin Pack — ${pkg.coins.toLocaleString()} Coins`,
            description: pkg.bonusCoins > 0
              ? `${pkg.coins.toLocaleString()} coins + ${pkg.bonusCoins.toLocaleString()} bonus for HowGamersGame`
              : `${pkg.coins.toLocaleString()} coins for HowGamersGame`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: user.id,
      packageId: pkg.id,
      coins: String(pkg.coins),
    },
    success_url: `${appUrl}/store/success?pkg=${pkg.id}`,
    cancel_url: `${appUrl}/store?cancelled=1`,
  })

  return NextResponse.json({ checkoutUrl: session.url })
}
