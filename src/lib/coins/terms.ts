// Coin purchase terms: version, wording shown at checkout, and server side acceptance check.
// Pure module. Bump COIN_TERMS_VERSION whenever the wording on the Terms page (section 4) changes;
// buyers are then asked to accept again, and the accepted version is stored with each purchase.
// DRAFT wording: flagged for Legal review (see PR).

export const COIN_TERMS_VERSION = '2026-10-04'

/** Shown next to the checkbox on the store page and on the Stripe payment page. */
export const COIN_TERMS_SUMMARY =
  'All coin purchases are final. No refunds. Coins have no cash value.'

export type TermsCheck =
  | { ok: true; version: string; acceptedAt: string }
  | { ok: false; status: 400 | 409; code: 'terms_required' | 'terms_outdated'; error: string }

/**
 * The browser says "I accepted version X"; the server decides if that is valid and stamps the
 * acceptance time itself (the client clock is never trusted).
 */
export function checkTermsAcceptance(body: unknown, now: Date = new Date()): TermsCheck {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (b.acceptedTerms !== true) {
    return {
      ok: false, status: 400, code: 'terms_required',
      error: 'You must accept the coin purchase terms before paying',
    }
  }
  if (b.termsVersion !== COIN_TERMS_VERSION) {
    return {
      ok: false, status: 409, code: 'terms_outdated',
      error: 'The coin purchase terms have changed. Please reload the page and accept them again',
    }
  }
  return { ok: true, version: COIN_TERMS_VERSION, acceptedAt: now.toISOString() }
}

/** Parses the acceptance time we stored in Stripe metadata; null if missing or malformed. */
export function parseAcceptedAt(value: string | null | undefined): string | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
