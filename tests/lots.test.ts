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
} from '../src/lib/coins/lots.ts'

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

test('allocateSpend: promo first, then lots by purchasedAt and id', () => {
  const lot1: LotInput = {
    id: 'lot-b',
    purchasedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    coinsTotal: 550,
    coinsRemaining: 550,
    coinsVoided: 0,
    grossCents: 500,
  }
  const lot2: LotInput = {
    id: 'lot-a',
    purchasedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    coinsTotal: 1200,
    coinsRemaining: 1200,
    coinsVoided: 0,
    grossCents: 1000,
  }

  const r1 = allocateSpend({ promoBalance: 100, lots: [lot1, lot2], amount: 60 })
  assert.equal(r1.status, 'ok')
  if (r1.status === 'ok') {
    assert.equal(r1.promoSpent, 60)
    assert.equal(r1.paidSpent, 0)
    assert.deepEqual(r1.allocations, [{ source: 'promo', lotId: null, coins: 60, coinsOffset: null, valueCents: 0 }])
  }

  const r2 = allocateSpend({ promoBalance: 40, lots: r1.status === 'ok' ? r1.lots : [lot1, lot2], amount: 100 })
  assert.equal(r2.status, 'ok')
  if (r2.status === 'ok') {
    assert.equal(r2.promoSpent, 40)
    assert.equal(r2.paidSpent, 60)
    assert.deepEqual(r2.allocations[0], { source: 'promo', lotId: null, coins: 40, coinsOffset: null, valueCents: 0 })
    assert.deepEqual(r2.allocations[1], { source: 'paid', lotId: 'lot-b', coins: 60, coinsOffset: 0, valueCents: 54 })
    assert.equal(r2.lots.find((l) => l.id === 'lot-b')?.coinsRemaining, 490)
  }

  const r3 = allocateSpend({ promoBalance: 0, lots: r2.status === 'ok' ? r2.lots : [lot1, lot2], amount: 600 })
  assert.equal(r3.status, 'ok')
  if (r3.status === 'ok') {
    assert.deepEqual(r3.allocations[0], { source: 'paid', lotId: 'lot-b', coins: 490, coinsOffset: 60, valueCents: 446 })
    assert.deepEqual(r3.allocations[1], { source: 'paid', lotId: 'lot-a', coins: 110, coinsOffset: 0, valueCents: 91 })
    assert.equal(r3.allocations[0].valueCents + r3.allocations[1].valueCents, 537)
  }

  // lot1 total value across r2 and r3 is 54 + 446 = 500
  assert.equal(54 + 446, 500)

  // reverse array order still spends lot1 first
  const r4 = allocateSpend({ promoBalance: 0, lots: [lot2, lot1], amount: 10 })
  assert.equal(r4.status, 'ok')
  if (r4.status === 'ok') assert.equal(r4.allocations[0].lotId, 'lot-b')

  // same purchasedAt ties broken by id
  const sameTime = new Date().toISOString()
  const tieA: LotInput = { id: 'z-lot', purchasedAt: sameTime, coinsTotal: 100, coinsRemaining: 100, coinsVoided: 0, grossCents: 100 }
  const tieB: LotInput = { id: 'a-lot', purchasedAt: sameTime, coinsTotal: 100, coinsRemaining: 100, coinsVoided: 0, grossCents: 100 }
  const r5 = allocateSpend({ promoBalance: 0, lots: [tieA, tieB], amount: 10 })
  assert.equal(r5.status, 'ok')
  if (r5.status === 'ok') assert.equal(r5.allocations[0].lotId, 'a-lot')

  // input objects are not mutated
  assert.equal(lot1.coinsRemaining, 550)
  assert.equal(lot2.coinsRemaining, 1200)
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
  assert.deepEqual(allocateSpend({ promoBalance: 0, lots: [lot], amount: 6 }), { status: 'insufficient' })
  assert.throws(() => allocateSpend({ promoBalance: 0, lots: [lot], amount: 0 }), /invalid_amount/)
  assert.throws(() => allocateSpend({ promoBalance: 0, lots: [lot], amount: -1 }), /invalid_amount/)
  assert.throws(() => allocateSpend({ promoBalance: 0, lots: [lot], amount: 1.5 }), /invalid_amount/)

  // promo-only spend is ok
  const promoOnly = allocateSpend({ promoBalance: 10, lots: [], amount: 10 })
  assert.equal(promoOnly.status, 'ok')
  if (promoOnly.status === 'ok') {
    assert.equal(promoOnly.promoSpent, 10)
    assert.equal(promoOnly.paidSpent, 0)
  }

  // every ok result's allocations sum to amount
  const r = allocateSpend({ promoBalance: 3, lots: [lot], amount: 8 })
  assert.equal(r.status, 'ok')
  if (r.status === 'ok') {
    assert.equal(r.allocations.reduce((sum, a) => sum + a.coins, 0), 8)
  }
})

test('developerEarnings: promo-only spend pays nothing', () => {
  const rows = [
    {
      gameId: 'g-promo',
      allocation: { source: 'promo' as const, lotId: null, coins: 100, coinsOffset: null, valueCents: 0 },
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
  const r1 = allocateSpend({ promoBalance: 100, lots: [lot], amount: 400 })
  const r2 = allocateSpend({ promoBalance: 0, lots: r1.status === 'ok' ? r1.lots : [lot], amount: 250 })
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
      paidCoinsSpent: 300,
      promoCoinsSpent: 100,
      grossPaidValueCents: 272,
      netPaidValueCents: 234,
      developerShareCents: 152,
    },
    {
      gameId: 'g2',
      paidCoinsSpent: 250,
      promoCoinsSpent: 0,
      grossPaidValueCents: 228,
      netPaidValueCents: 196,
      developerShareCents: 127,
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
  const r = allocateSpend({ promoBalance: 0, lots: [lot], amount: 200 })
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
  const partialSpend = allocateSpend({ promoBalance: 0, lots: [partialLot], amount: 440 })
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
  const cappedSpend = allocateSpend({ promoBalance: 0, lots: [cappedLot], amount: 440 })
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
