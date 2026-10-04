import { COIN_CURRENCY, getPackageById } from './packs.ts'
import type { CoinPackage } from './packs.ts'
import { parseAcceptedAt } from './terms.ts'

// Structural subset of Stripe.Checkout.Session that we rely on.
export interface CheckoutSessionLike {
  id?: string | null
  mode?: string | null
  payment_status?: string | null
  currency?: string | null
  amount_total?: number | null
  client_reference_id?: string | null
  payment_intent?: string | { id?: string | null } | null
  metadata?: Record<string, string | null | undefined> | null
  customer_email?: string | null
  customer_details?: { email?: string | null; name?: string | null } | null
}

export interface ValidPurchase {
  sessionId: string
  userId: string
  pack: CoinPackage
  coins: number          // from the SERVER pack table, never from metadata
  bonusCoins: number
  grossCents: number
  currency: string
  paymentIntentId: string | null
  email: string | null
  customerName: string | null
  termsVersion: string | null       // from checkout metadata; null only if a session pre dates the terms step
  termsAcceptedAt: string | null    // ISO time stamped by our server at acceptance
}

export type ValidationResult =
  | { ok: true; purchase: ValidPurchase }
  // `not_paid`: nothing to credit yet (e.g. async payment pending). Not an error.
  | { ok: false; reason: 'not_paid' | 'not_ours'; detail: string }
  // `invalid`: Stripe says it is paid, but it does not match what we sell. Needs a human.
  | { ok: false; reason: 'invalid'; detail: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateCheckoutSession(session: CheckoutSessionLike): ValidationResult {
  if (!session.id) return { ok: false, reason: 'invalid', detail: 'session has no id' }
  if (session.mode !== 'payment') {
    return { ok: false, reason: 'not_ours', detail: `mode is ${session.mode ?? 'missing'}` }
  }
  const meta = session.metadata ?? {}
  if (!meta.packageId && !meta.userId) {
    return { ok: false, reason: 'not_ours', detail: 'no coin metadata' }
  }
  if (session.payment_status !== 'paid') {
    return { ok: false, reason: 'not_paid', detail: `payment_status is ${session.payment_status ?? 'missing'}` }
  }

  const pack = getPackageById(meta.packageId)
  if (!pack) return { ok: false, reason: 'invalid', detail: `unknown packageId ${String(meta.packageId)}` }

  const userId = meta.userId ?? ''
  if (!UUID_RE.test(userId)) return { ok: false, reason: 'invalid', detail: 'metadata.userId is not a UUID' }
  if (session.client_reference_id && session.client_reference_id !== userId) {
    return { ok: false, reason: 'invalid', detail: 'client_reference_id does not match metadata.userId' }
  }

  if ((session.currency ?? '').toLowerCase() !== COIN_CURRENCY) {
    return { ok: false, reason: 'invalid', detail: `currency is ${session.currency ?? 'missing'}` }
  }
  if (session.amount_total !== pack.priceCents) {
    return {
      ok: false,
      reason: 'invalid',
      detail: `amount_total ${String(session.amount_total)} does not match ${pack.id} price ${pack.priceCents}`,
    }
  }

  const pi = session.payment_intent
  const paymentIntentId = typeof pi === 'string' ? pi : pi?.id ?? null

  return {
    ok: true,
    purchase: {
      sessionId: session.id,
      userId,
      pack,
      coins: pack.coins,
      bonusCoins: pack.bonusCoins,
      grossCents: pack.priceCents,
      currency: COIN_CURRENCY,
      paymentIntentId,
      email: session.customer_email ?? session.customer_details?.email ?? null,
      customerName: session.customer_details?.name ?? null,
      termsVersion: typeof meta.termsVersion === 'string' && meta.termsVersion ? meta.termsVersion.slice(0, 40) : null,
      termsAcceptedAt: parseAcceptedAt(meta.termsAcceptedAt),
    },
  }
}
