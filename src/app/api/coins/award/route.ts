import { NextResponse } from 'next/server'

/**
 * DISABLED by platform policy (2026-10-06).
 * No game can award coins. Coins only enter the system via Stripe purchases.
 * This endpoint always returns 403.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Coin awards are disabled. Coins are only issued via Stripe purchases.' },
    { status: 403 }
  )
}
