import { validateCheckoutSession } from './checkout.ts'
import type { CheckoutSessionLike, ValidPurchase } from './checkout.ts'

export interface StripeEventLike {
  id: string
  type: string
  data: { object: unknown }
}

export type CreditResult =
  | { status: 'credited'; balanceAfter: number }
  | { status: 'duplicate_event' }
  | { status: 'duplicate_session' }

export interface WebhookDeps {
  /** Atomically credits coins + writes both ledgers. Must throw on DB errors. */
  creditPurchase: (eventId: string, eventType: string, purchase: ValidPurchase) => Promise<CreditResult>
  /** Best effort. Failures never affect the HTTP status. */
  sendEmail: (purchase: ValidPurchase) => Promise<void>
  log?: (level: 'info' | 'error', message: string, extra?: Record<string, unknown>) => void
}

export interface WebhookOutcome {
  status: number
  body: Record<string, unknown>
}

export const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
] as const

/**
 * Decides what to do with a signature-verified Stripe event.
 *  200  ignored / pending / already processed / credited
 *  400  paid session that does not match what we sell (needs a human; logged loudly)
 *  500  database failure; Stripe will retry with the same event id
 */
export async function handleStripeEvent(event: StripeEventLike, deps: WebhookDeps): Promise<WebhookOutcome> {
  const log = deps.log ?? (() => {})

  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(event.type)) {
    return { status: 200, body: { received: true, ignored: event.type } }
  }

  const validation = validateCheckoutSession(event.data.object as CheckoutSessionLike)
  if (!validation.ok) {
    if (validation.reason === 'invalid') {
      log('error', 'PAID checkout session rejected, manual review needed', {
        eventId: event.id, detail: validation.detail,
      })
      return { status: 400, body: { error: 'Invalid checkout session' } }
    }
    return { status: 200, body: { received: true, skipped: validation.reason } }
  }

  const purchase = validation.purchase
  let result: CreditResult
  try {
    result = await deps.creditPurchase(event.id, event.type, purchase)
  } catch (err) {
    log('error', 'credit_coin_purchase failed, Stripe will retry', {
      eventId: event.id,
      sessionId: purchase.sessionId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { status: 500, body: { error: 'Could not credit coins' } }
  }

  if (result.status !== 'credited') {
    log('info', 'duplicate delivery ignored', { eventId: event.id, kind: result.status })
    return { status: 200, body: { received: true, skipped: result.status } }
  }

  try {
    await deps.sendEmail(purchase)
  } catch (err) {
    log('error', 'purchase email failed (coins already credited)', {
      eventId: event.id, error: err instanceof Error ? err.message : String(err),
    })
  }
  return { status: 200, body: { received: true, credited: purchase.coins } }
}
