import Stripe from 'stripe'

export { COIN_PACKAGES, getPackageById } from '@/lib/coins/packs'
export type { CoinPackageId } from '@/lib/coins/packs'

let cached: Stripe | null = null

/**
 * Lazy so that importing this module (e.g. during `next build` on a machine without
 * keys) never throws. Throws a clear error only when Stripe is actually needed.
 */
export function getStripe(): Stripe {
  if (cached) return cached
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  cached = new Stripe(key, { apiVersion: '2026-05-27.dahlia' })
  return cached
}
