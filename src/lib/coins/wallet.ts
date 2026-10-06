// Request parsing and result mapping for /api/coins/spend and /api/coins/award.
// Pure module (no framework imports) so it is unit tested. The money logic itself
// lives in the SQL functions spend_coins() / award_coins().

export type WalletKind = 'spend' | 'award'

export const MAX_SPEND_PER_CALL = 1_000_000
export const MAX_AWARD_PER_CALL = 10_000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/

export interface WalletRequest {
  userId: string
  amount: number
  reason: string | null
  idempotencyKey: string | null
}

export type ParseResult =
  | { ok: true; value: WalletRequest }
  | { ok: false; status: 400; error: string }

export function parseWalletRequest(
  kind: WalletKind,
  body: unknown,
  idempotencyHeader: string | null,
  opts: { requireIdempotencyKey?: boolean } = {},
): ParseResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const bad = (error: string): ParseResult => ({ ok: false, status: 400, error })

  if (typeof b.userId !== 'string' || !UUID_RE.test(b.userId)) {
    return bad('userId must be a valid user id')
  }
  const amount = b.amount
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0) {
    return bad('userId and positive amount are required')
  }
  const max = kind === 'award' ? MAX_AWARD_PER_CALL : MAX_SPEND_PER_CALL
  if (amount > max) {
    return bad(kind === 'award' ? `Max award per call is ${max}` : `Max spend per call is ${max}`)
  }

  let reason: string | null = null
  if (b.reason !== undefined && b.reason !== null) {
    if (typeof b.reason !== 'string') return bad('reason must be a string')
    reason = b.reason.trim().slice(0, 200) || null
  }

  const rawKey = idempotencyHeader ?? (typeof b.idempotencyKey === 'string' ? b.idempotencyKey : null)
  if (b.idempotencyKey !== undefined && typeof b.idempotencyKey !== 'string') {
    return bad('idempotencyKey must be a string')
  }
  let idempotencyKey: string | null = null
  if (rawKey !== null && rawKey !== '') {
    if (!IDEMPOTENCY_KEY_RE.test(rawKey)) {
      return bad('Idempotency key must be 8 to 128 characters: letters, numbers, and _ . : -')
    }
    idempotencyKey = rawKey
  } else if (opts.requireIdempotencyKey) {
    return bad('An Idempotency-Key header (or idempotencyKey in the body) is required')
  }

  return { ok: true, value: { userId: b.userId, amount, reason, idempotencyKey } }
}

export interface RpcOutcome {
  data: { status?: string; balance?: number } | null
  error: { message: string } | null
}

export interface WalletOutcome {
  status: number
  body: Record<string, unknown>
}

/** Maps the SQL function result (or its raised exception) to the HTTP contract. */
export function mapWalletResult(kind: WalletKind, amount: number, rpc: RpcOutcome): WalletOutcome {
  if (rpc.error) {
    const m = rpc.error.message
    if (m.includes('user_not_found')) return { status: 404, body: { error: 'User not found' } }
    if (m.includes('idempotency_key_conflict')) {
      return { status: 409, body: { error: 'Idempotency key was already used for a different request' } }
    }
    if (m.includes('invalid_amount')) return { status: 400, body: { error: 'Invalid amount' } }
    if (m.includes('balance_limit')) return { status: 400, body: { error: 'Balance limit reached' } }
    return { status: 500, body: { error: 'Could not update coins' } }
  }
  const d = rpc.data
  if (!d || typeof d.balance !== 'number') return { status: 500, body: { error: 'Could not update coins' } }

  if (d.status === 'insufficient') {
    return { status: 402, body: { error: 'Insufficient coins', balance: d.balance } }
  }
  if (d.status === 'ok' || d.status === 'replayed') {
    const body: Record<string, unknown> = kind === 'spend'
      ? { success: true, spent: amount, balance: d.balance }
      : { success: true, awarded: amount, balance: d.balance }
    if (d.status === 'replayed') body.replayed = true
    return { status: 200, body }
  }
  return { status: 500, body: { error: 'Could not update coins' } }
}
