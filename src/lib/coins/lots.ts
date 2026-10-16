// The SQL functions in src/lib/supabase/migrations/2026-10-15-f-coin-lots.sql and
// src/lib/supabase/migrations/2026-10-16-g-promo-grants.sql are the source of truth.
// This mirror exists so the rules can be unit tested and reused.
// All money math uses integers; products use BigInt internally so nothing overflows or rounds.

export type LotInput = {
  id: string
  purchasedAt: string | number | Date
  coinsTotal: number
  coinsRemaining: number
  coinsVoided: number
  grossCents: number
}

export type PromoGrantInput = {
  id: string
  coinsRemaining: number
  expiresAt: string | number | Date
}

export type Allocation = {
  source: 'promo' | 'paid'
  lotId: string | null
  promoGrantId: string | null
  coins: number
  coinsOffset: number | null
  valueCents: number
}

export type Deduction = {
  kind: 'tax' | 'processing_fee' | 'refund' | 'chargeback'
  amountCents: number
}

function assertSafeInteger(n: number, message: string): void {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new Error(message)
}

/** floor((offset+take)*gross/total) - floor(offset*gross/total) using BigInt floor division. */
export function coinValueSlice(
  coinsTotal: number,
  grossCents: number,
  offset: number,
  take: number,
): number {
  assertSafeInteger(coinsTotal, 'invalid_slice')
  assertSafeInteger(grossCents, 'invalid_slice')
  assertSafeInteger(offset, 'invalid_slice')
  assertSafeInteger(take, 'invalid_slice')
  if (coinsTotal <= 0 || offset < 0 || take < 0 || offset + take > coinsTotal) {
    throw new Error('invalid_slice')
  }
  const total = BigInt(coinsTotal)
  const gross = BigInt(grossCents)
  const off = BigInt(offset)
  const tk = BigInt(take)
  const end = (off + tk) * gross
  const start = off * gross
  return Number(end / total - start / total)
}

export function allocateSpend(input: {
  promoGrants: PromoGrantInput[]
  lots: LotInput[]
  amount: number
  now?: string | number | Date
}):
  | {
      status: 'ok'
      promoSpent: number
      paidSpent: number
      allocations: Allocation[]
      lots: LotInput[]
      promoGrants: PromoGrantInput[]
    }
  | { status: 'insufficient' } {
  assertSafeInteger(input.amount, 'invalid_amount')
  if (input.amount <= 0) throw new Error('invalid_amount')

  const now = input.now === undefined ? new Date() : new Date(input.now)
  const nowTime = now.getTime()

  for (const grant of input.promoGrants) {
    assertSafeInteger(grant.coinsRemaining, 'invalid_amount')
    if (grant.coinsRemaining < 0) throw new Error('invalid_amount')
  }

  const usableGrants = input.promoGrants
    .filter((grant) => grant.coinsRemaining > 0 && new Date(grant.expiresAt).getTime() > nowTime)
    .sort((a, b) => {
      const at = new Date(a.expiresAt).getTime()
      const bt = new Date(b.expiresAt).getTime()
      if (at !== bt) return at - bt
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  const balance =
    input.lots.reduce((sum, lot) => sum + lot.coinsRemaining, 0) +
    usableGrants.reduce((sum, grant) => sum + grant.coinsRemaining, 0)
  if (input.amount > balance) return { status: 'insufficient' }

  let need = input.amount
  let promoSpent = 0
  let paidSpent = 0
  const allocations: Allocation[] = []

  const lots = input.lots
    .filter((lot) => lot.coinsRemaining > 0)
    .sort((a, b) => {
      const at = new Date(a.purchasedAt).getTime()
      const bt = new Date(b.purchasedAt).getTime()
      if (at !== bt) return at - bt
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  const updatedLots = input.lots.map((lot) => ({ ...lot }))
  const updatedGrants = input.promoGrants.map((grant) => ({ ...grant }))

  for (const lot of lots) {
    if (need === 0) break
    const take = Math.min(lot.coinsRemaining, need)
    const coinsOffset = lot.coinsTotal - lot.coinsRemaining - lot.coinsVoided
    const valueCents = coinValueSlice(lot.coinsTotal, lot.grossCents, coinsOffset, take)
    allocations.push({
      source: 'paid',
      lotId: lot.id,
      promoGrantId: null,
      coins: take,
      coinsOffset,
      valueCents,
    })
    need -= take
    paidSpent += take
    const updated = updatedLots.find((l) => l.id === lot.id)
    if (updated) updated.coinsRemaining -= take
  }

  for (const grant of usableGrants) {
    if (need === 0) break
    const take = Math.min(grant.coinsRemaining, need)
    allocations.push({
      source: 'promo',
      lotId: null,
      promoGrantId: grant.id,
      coins: take,
      coinsOffset: null,
      valueCents: 0,
    })
    need -= take
    promoSpent += take
    const updated = updatedGrants.find((g) => g.id === grant.id)
    if (updated) updated.coinsRemaining -= take
  }

  if (need > 0) throw new Error('wallet_inconsistent')

  return { status: 'ok', promoSpent, paidSpent, allocations, lots: updatedLots, promoGrants: updatedGrants }
}

export function lotNetCents(grossCents: number, deductions: Deduction[]): number {
  assertSafeInteger(grossCents, 'invalid_amount')
  let total = BigInt(grossCents)
  for (const d of deductions) {
    if (!['tax', 'processing_fee', 'refund', 'chargeback'].includes(d.kind)) {
      throw new Error('invalid_kind')
    }
    assertSafeInteger(d.amountCents, 'invalid_amount')
    if (d.amountCents <= 0) throw new Error('invalid_amount')
    total -= BigInt(d.amountCents)
  }
  return total < BigInt(0) ? 0 : Number(total)
}

export function allocationNetCents(
  lot: Pick<LotInput, 'coinsTotal' | 'coinsVoided'>,
  allocation: Allocation,
  lotNetCents: number,
): number {
  if (allocation.source === 'promo') return 0
  const offset = allocation.coinsOffset as number
  if (lot.coinsVoided > 0) {
    return Math.min(
      allocation.valueCents,
      coinValueSlice(lot.coinsTotal - lot.coinsVoided, lotNetCents, offset, allocation.coins),
    )
  }
  return coinValueSlice(lot.coinsTotal, lotNetCents, offset, allocation.coins)
}

export function developerShareCents(netCents: number, shareBps = 6500): number {
  assertSafeInteger(netCents, 'invalid_amount')
  if (typeof shareBps !== 'number' || !Number.isSafeInteger(shareBps) || shareBps < 0 || shareBps > 10000) {
    throw new Error('invalid_share_bps')
  }
  return Number((BigInt(netCents) * BigInt(shareBps)) / BigInt(10000))
}

export function developerEarnings(
  rows: {
    gameId: string
    allocation: Allocation
    lot: Pick<LotInput, 'coinsTotal' | 'coinsVoided' | 'grossCents'> | null
    deductions: Deduction[]
  }[],
  shareBps = 6500,
): {
  gameId: string
  paidCoinsSpent: number
  promoCoinsSpent: number
  grossPaidValueCents: number
  netPaidValueCents: number
  developerShareCents: number
}[] {
  const byGame = new Map<
    string,
    {
      paidCoinsSpent: number
      promoCoinsSpent: number
      grossPaidValueCents: number
      netPaidValueCents: number
    }
  >()

  for (const row of rows) {
    const game = byGame.get(row.gameId) ?? {
      paidCoinsSpent: 0,
      promoCoinsSpent: 0,
      grossPaidValueCents: 0,
      netPaidValueCents: 0,
    }
    if (row.allocation.source === 'promo') {
      game.promoCoinsSpent += row.allocation.coins
    } else {
      game.paidCoinsSpent += row.allocation.coins
      game.grossPaidValueCents += row.allocation.valueCents
      if (row.lot) {
        const net = lotNetCents(row.lot.grossCents, row.deductions)
        game.netPaidValueCents += allocationNetCents(row.lot, row.allocation, net)
      }
    }
    byGame.set(row.gameId, game)
  }

  return [...byGame.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([gameId, g]) => ({
      gameId,
      paidCoinsSpent: g.paidCoinsSpent,
      promoCoinsSpent: g.promoCoinsSpent,
      grossPaidValueCents: g.grossPaidValueCents,
      netPaidValueCents: g.netPaidValueCents,
      developerShareCents: developerShareCents(g.netPaidValueCents, shareBps),
    }))
}
