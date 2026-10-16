import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coinValueSlice,
  allocateSpend,
  lotNetCents,
  allocationNetCents,
  developerShareCents,
  developerEarnings,
  type LotInput,
  type PromoGrantInput,
} from '../src/lib/coins/lots.ts'

const FAR = '2999-01-01T00:00:00Z'

test('coinValueSlice: exact hand-computed values', () => {
  assert.equal(coinValueSlice(550, 500, 0, 550), 500)
  assert.equal(coinValueSlice(550, 500, 0, 60), 54)
  assert.equal(coinValueSlice(550, 500, 60, 490), 446)
  assert.equal(coinValueSlice(3, 100, 0, 1), 33)
  assert.equal(coinValueSlice(3, 100, 1, 1), 33)
  assert.equal(coinValueSlice(3, 100, 2, 1), 34)
  assert.equal(coinValueSlice(3, 100, 0, 1) + coinValueSlice(3, 100, 1, 1) + coinValueSlice(3, 100, 2, 1), 100)
})

test('coinValueSlice: invalid args throw invalid_slice', () => {
  for (const args of [
    [550, 500, 0, 551],
    [550, 500, -1, 1],
    [0, 500, 0, 1],
    [550, 500, NaN, 1],
    [550, 500, 0, 1.5],
  ]) {
    assert.throws(() => coinValueSlice(args[0] as number, args[1] as number, args[2] as number, args[3] as number), /invalid_slice/)
  }
})

test('coinValueSlice: no drift when slicing one coin at a time', () => {
  let sum = 0
  for (let i = 0; i < 1200; i++) {
    const slice = coinValueSlice(1200, 1000, i, 1)
    assert.ok(slice === 0 || slice === 1)
    sum += slice
  }
  assert.equal(sum, 1000)

  let partial = 0
  for (let i = 110; i < 110 + 1090; i++) {
    partial += coinValueSlice(1200, 1000, i, 1)
  }
  assert.equal(partial, 1000 - Math.floor((110 * 1000) / 1200))
  assert.equal(partial, 909)
})

test('allocateSpend: paid lots first (oldest first), then promo soonest-expiring', () => {
  const lot1: LotInput = {
    id: 'lot-a',
    purchasedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    coinsTotal: 550,
    coinsRemaining: 550,
    coinsVoided: 0,
    grossCents: 500,
  }
  const lot2: LotInput = {
    id: 'lot-b',
    purchasedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    coinsTotal: 1200,
    coinsRemaining: 1200,
    coinsVoided: 0,
    grossCents: 1000,
  }
  const pgA: PromoGrantInput = { id: 'pg-a', coinsRemaining: 100, expiresAt: '2999-01-02T00:00:00Z' }
  const pgB: PromoGrantInput = { id: 'pg-b', coinsRemaining: 50, expiresAt: '2999-01-01T00:00:00Z' }

  const r1 = allocateSpend({ promoGrants: [pgA, pgB], lots: [lot1, lot2], amount: 600 })
  assert.equal(r1.status, 'ok')
  if (r1.status === 'ok') {
    assert.equal(r1.paidSpent, 600)
    assert.equal(r1.promoSpent, 0)
    assert.deepEqual(r1.allocations, [
      { source: 'paid', lotId: 'lot-a', promoGrantId: null, coins: 550, coinsOffset: 0, valueCents: 500 },
      { source: 'paid', lotId: 'lot-b', promoGrantId: null, coins: 50, coinsOffset: 0, valueCents: 41 },
    ])
  }

  const r2 = allocateSpend({
    promoGrants: r1.status === 'ok' ? r1.promoGrants : [pgA, pgB],
    lots: r1.status === 'ok' ? r1.lots : [lot1, lot2],
    amount: 1200,
  })
  assert.equal(r2.status, 'ok')
  if (r2.status === 'ok') {
    assert.equal(r2.paidSpent, 1150)
    assert.equal(r2.promoSpent, 50)
    assert.deepEqual(r2.allocations, [
      { source: 'paid', lotId: 'lot-b', promoGrantId: null, coins: 1150, coinsOffset: 50, valueCents: 959 },
      { source: 'promo', lotId: null, promoGrantId: 'pg-b', coins: 50, coinsOffset: null, valueCents: 0 },
    ])
  }

  const r3 = allocateSpend({
    promoGrants: r2.status === 'ok' ? r2.promoGrants : [pgA, pgB],
    lots: r2.status === 'ok' ? r2.lots : [lot1, lot2],
    amount: 100,
  })
  assert.equal(r3.status, 'ok')
  if (r3.status === 'ok') {
    assert.equal(r3.paidSpent, 0)
    assert.equal(r3.promoSpent, 100)
    assert.deepEqual(r3.allocations, [
      { source: 'promo', lotId: null, promoGrantId: 'pg-a', coins: 100, coinsOffset: null, valueCents: 0 },
    ])
  }

  // input objects are not mutated
  assert.equal(lot1.coinsRemaining, 550)
  assert.equal(lot2.coinsRemaining, 1200)
  assert.equal(pgA.coinsRemaining, 100)
  assert.equal(pgB.coinsRemaining, 50)
})

test('allocateSpend: expired grants are ignored', () => {
  const expired: PromoGrantInput = { id: 'pg-expired', coinsRemaining: 100, expiresAt: '2000-01-01T00:00:00Z' }
  const active: PromoGrantInput = { id: 'pg-active', coinsRemaining: 10, expiresAt: FAR }
  const now = '2026-01-01T00:00:00Z'

  const r1 = allocateSpend({ promoGrants: [expired, active], lots: [], amount: 5, now })
  assert.equal(r1.status, 'ok')
  if (r1.status === 'ok') {
    assert.equal(r1.promoSpent, 5)
    assert.equal(r1.paidSpent, 0)
    assert.deepEqual(r1.allocations, [
      { source: 'promo', lotId: null, promoGrantId: 'pg-active', coins: 5, coinsOffset: null, valueCents: 0 },
    ])
  }

  const r2 = allocateSpend({ promoGrants: [expired, active], lots: [], amount: 11, now })
  assert.deepEqual(r2, { status: 'insufficient' })
})

test('worked example: 100 paid + 30 promo, spend 50, old order vs new order', () => {
  const lot: LotInput = {
    id: 'lot-w',
    purchasedAt: '2026-01-01T00:00:00Z',
    coinsTotal: 100,
    coinsRemaining: 100,
    coinsVoided: 0,
    grossCents: 200,
  }
  const grant: PromoGrantInput = { id: 'pg-w', coinsRemaining: 30, expiresAt: FAR }

  const newOrder = allocateSpend({ promoGrants: [grant], lots: [lot], amount: 50 })
  assert.equal(newOrder.status, 'ok')
  if (newOrder.status !== 'ok') return
  assert.equal(newOrder.paidSpent, 50)
  assert.equal(newOrder.promoSpent, 0)
  assert.deepEqual(newOrder.allocations, [
    { source: 'paid', lotId: 'lot-w', promoGrantId: null, coins: 50, coinsOffset: 0, valueCents: 100 },
  ])
  const newEarnings = developerEarnings([
    {
      gameId: 'gw',
      allocation: newOrder.allocations[0],
      lot,
      deductions: [],
    },
  ])
  assert.deepEqual(newEarnings, [
    {
      gameId: 'gw',
      paidCoinsSpent: 50,
      promoCoinsSpent: 0,
      grossPaidValueCents: 100,
      netPaidValueCents: 100,
      developerShareCents: 65,
    },
  ])

  const oldOrderAllocations = [
    { source: 'promo' as const, lotId: null, promoGrantId: 'pg-w', coins: 30, coinsOffset: null, valueCents: 0 },
    { source: 'paid' as const, lotId: 'lot-w', promoGrantId: null, coins: 20, coinsOffset: 0, valueCents: 40 },
  ]
  const oldEarnings = developerEarnings([
    {
      gameId: 'gw',
      allocation: oldOrderAllocations[0],
      lot: null,
      deductions: [],
    },
    {
      gameId: 'gw',
      allocation: oldOrderAllocations[1],
      lot,
      deductions: [],
    },
  ])
  assert.deepEqual(oldEarnings, [
    {
      gameId: 'gw',
      paidCoinsSpent: 20,
      promoCoinsSpent: 30,
      grossPaidValueCents: 40,
      netPaidValueCents: 40,
      developerShareCents: 26,
    },
  ])
})

test('allocateSpend: insufficient and invalid amounts', () => {
  const lot: LotInput = {
    id: 'lot-1',
    purchasedAt: new Date().toISOString(),
    coinsTotal: 10,
    coinsRemaining: 5,
    coinsVoided: 0,
    grossCents: 100,
  }
  assert.deepEqual(allocateSpend({ promoGrants: [], lots: [lot], amount: 6 }), { status: 'insufficient' })
  assert.throws(() => allocateSpend({ promoGrants: [], lots: [lot], amount: 0 }), /invalid_amount/)
  assert.throws(() => allocateSpend({ promoGrants: [], lots: [lot], amount: -1 }), /invalid_amount/)
  assert.throws(() => allocateSpend({ promoGrants: [], lots: [lot], amount: 1.5 }), /invalid_amount/)

  // promo-only spend is ok
  const promoOnly = allocateSpend({
    promoGrants: [{ id: 'pg-1', coinsRemaining: 10, expiresAt: FAR }],
    lots: [],
    amount: 10,
  })
  assert.equal(promoOnly.status, 'ok')
  if (promoOnly.status === 'ok') {
    assert.equal(promoOnly.promoSpent, 10)
    assert.equal(promoOnly.paidSpent, 0)
  }

  // every ok result's allocations sum to amount
  const r = allocateSpend({
    promoGrants: [{ id: 'pg-1', coinsRemaining: 3, expiresAt: FAR }],
    lots: [lot],
    amount: 8,
  })
  assert.equal(r.status, 'ok')
  if (r.status === 'ok') {
    assert.equal(r.allocations.reduce((sum, a) => sum + a.coins, 0), 8)
  }
})

test('developerEarnings: promo-only spend pays nothing', () => {
  const rows = [
    {
      gameId: 'g-promo',
      allocation: {
        source: 'promo' as const,
        lotId: null,
        promoGrantId: 'pg-promo',
        coins: 100,
        coinsOffset: null,
        valueCents: 0,
      },
      lot: null,
      deductions: [],
    },
  ]
  const earnings = developerEarnings(rows)
  assert.deepEqual(earnings, [
    {
      gameId: 'g-promo',
      paidCoinsSpent: 0,
      promoCoinsSpent: 100,
      grossPaidValueCents: 0,
      netPaidValueCents: 0,
      developerShareCents: 0,
    },
  ])
})

test('developerEarnings: deductions split across games', () => {
  const lot: LotInput = {
    id: 'lot-1',
    purchasedAt: new Date().toISOString(),
    coinsTotal: 550,
    coinsRemaining: 550,
    coinsVoided: 0,
    grossCents: 500,
  }
  const r1 = allocateSpend({
    promoGrants: [{ id: 'pg-1', coinsRemaining: 100, expiresAt: FAR }],
    lots: [lot],
    amount: 400,
  })
  const r2 = allocateSpend({
    promoGrants: r1.status === 'ok' ? r1.promoGrants : [],
    lots: r1.status === 'ok' ? r1.lots : [lot],
    amount: 250,
  })
  assert.equal(r1.status, 'ok')
  assert.equal(r2.status, 'ok')
  if (r1.status !== 'ok' || r2.status !== 'ok') return

  const rows = [
    ...r1.allocations.map((allocation) => ({
      gameId: 'g1',
      allocation,
      lot: allocation.source === 'paid' ? lot : null,
      deductions: [
        { kind: 'tax' as const, amountCents: 40 },
        { kind: 'processing_fee' as const, amountCents: 30 },
      ],
    })),
    ...r2.allocations.map((allocation) => ({
      gameId: 'g2',
      allocation,
      lot: allocation.source === 'paid' ? lot : null,
      deductions: [
        { kind: 'tax' as const, amountCents: 40 },
        { kind: 'processing_fee' as const, amountCents: 30 },
      ],
    })),
  ]

  const earnings = developerEarnings(rows)
  assert.deepEqual(earnings, [
    {
      gameId: 'g1',
      paidCoinsSpent: 400,
      promoCoinsSpent: 0,
      grossPaidValueCents: 363,
      netPaidValueCents: 312,
      developerShareCents: 202,
    },
    {
      gameId: 'g2',
      paidCoinsSpent: 150,
      promoCoinsSpent: 100,
      grossPaidValueCents: 137,
      netPaidValueCents: 118,
      developerShareCents: 76,
    },
  ])
  assert.equal(earnings[0].netPaidValueCents + earnings[1].netPaidValueCents, 430)
})

test('developerEarnings: chargeback, partial refund, and capped refund', () => {
  const lot: LotInput = {
    id: 'lot-1',
    purchasedAt: new Date().toISOString(),
    coinsTotal: 550,
    coinsRemaining: 550,
    coinsVoided: 0,
    grossCents: 500,
  }
  const r = allocateSpend({ promoGrants: [], lots: [lot], amount: 200 })
  assert.equal(r.status, 'ok')
  if (r.status !== 'ok') return

  const voidedLot = { ...lot, coinsVoided: 350, coinsRemaining: 0 }
  const chargebackRows = r.allocations.map((allocation) => ({
    gameId: 'g3',
    allocation,
    lot: voidedLot,
    deductions: [{ kind: 'chargeback' as const, amountCents: 500 }],
  }))
  const chargebackEarnings = developerEarnings(chargebackRows)
  assert.equal(chargebackEarnings[0].netPaidValueCents, 0)
  assert.equal(chargebackEarnings[0].developerShareCents, 0)

  const partialLot: LotInput = {
    id: 'lot-2',
    purchasedAt: new Date().toISOString(),
    coinsTotal: 550,
    coinsRemaining: 440,
    coinsVoided: 110,
    grossCents: 500,
  }
  const partialSpend = allocateSpend({ promoGrants: [], lots: [partialLot], amount: 440 })
  assert.equal(partialSpend.status, 'ok')
  if (partialSpend.status !== 'ok') return
  const partialRows = partialSpend.allocations.map((allocation) => ({
    gameId: 'g4',
    allocation,
    lot: partialLot,
    deductions: [{ kind: 'refund' as const, amountCents: 100 }],
  }))
  const partialEarnings = developerEarnings(partialRows)
  assert.equal(partialEarnings[0].grossPaidValueCents, 400)
  assert.equal(partialEarnings[0].netPaidValueCents, 400)

  const cappedLot: LotInput = {
    id: 'lot-3',
    purchasedAt: new Date().toISOString(),
    coinsTotal: 550,
    coinsRemaining: 440,
    coinsVoided: 110,
    grossCents: 500,
  }
  const cappedSpend = allocateSpend({ promoGrants: [], lots: [cappedLot], amount: 440 })
  assert.equal(cappedSpend.status, 'ok')
  if (cappedSpend.status !== 'ok') return
  const cappedRows = cappedSpend.allocations.map((allocation) => ({
    gameId: 'g5',
    allocation,
    lot: cappedLot,
    deductions: [{ kind: 'refund' as const, amountCents: 50 }],
  }))
  const cappedEarnings = developerEarnings(cappedRows)
  assert.equal(cappedEarnings[0].grossPaidValueCents, 400)
  assert.equal(cappedEarnings[0].netPaidValueCents, 400)
  assert.equal(cappedEarnings[0].developerShareCents, 260)
})

test('developerShareCents and lotNetCents edge cases', () => {
  assert.equal(developerShareCents(235, 6500), 152)
  assert.equal(developerShareCents(10000, 6500), 6500)
  assert.throws(() => developerShareCents(100, -1), /invalid_share_bps/)
  assert.throws(() => developerShareCents(100, 10001), /invalid_share_bps/)
  assert.throws(() => developerShareCents(100, 1.5), /invalid_share_bps/)

  assert.equal(lotNetCents(500, [{ kind: 'tax', amountCents: 600 }]), 0)
  assert.throws(() => lotNetCents(500, [{ kind: 'fee' as never, amountCents: 10 }]), /invalid_kind/)
  assert.throws(() => lotNetCents(500, [{ kind: 'tax', amountCents: 0 }]), /invalid_amount/)
})
