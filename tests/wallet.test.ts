import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapWalletResult, parseWalletRequest, MAX_AWARD_PER_CALL } from '../src/lib/coins/wallet.ts'

const U = '11111111-1111-4111-8111-111111111111'

test('parse: valid spend and award requests', () => {
  const s = parseWalletRequest('spend', { userId: U, amount: 250, reason: '  Double jump  ' }, null)
  assert.ok(s.ok)
  if (s.ok) assert.deepEqual(s.value, { userId: U, amount: 250, reason: 'Double jump', idempotencyKey: null })
  const a = parseWalletRequest('award', { userId: U, amount: 50 }, 'daily-2026-10-04-u1')
  assert.ok(a.ok)
  if (a.ok) assert.equal(a.value.idempotencyKey, 'daily-2026-10-04-u1')
})

test('parse: rejects bad user ids and amounts', () => {
  const bad = [
    { userId: 'abc', amount: 5 }, { userId: U }, { userId: U, amount: 0 }, { userId: U, amount: -5 },
    { userId: U, amount: 1.5 }, { userId: U, amount: '5' }, { userId: U, amount: Infinity },
    { userId: U, amount: NaN }, { userId: U, amount: 2 ** 60 }, { userId: 5, amount: 5 }, null, 'x', [],
  ]
  for (const b of bad) assert.equal(parseWalletRequest('spend', b, null).ok, false, JSON.stringify(b))
})

test('parse: award cap is 10,000, spend cap is 1,000,000', () => {
  assert.ok(parseWalletRequest('award', { userId: U, amount: MAX_AWARD_PER_CALL }, null).ok)
  const over = parseWalletRequest('award', { userId: U, amount: MAX_AWARD_PER_CALL + 1 }, null)
  assert.equal(over.ok, false)
  if (!over.ok) assert.match(over.error, /Max award per call is 10000/)
  assert.ok(parseWalletRequest('spend', { userId: U, amount: 20_000 }, null).ok)
  assert.equal(parseWalletRequest('spend', { userId: U, amount: 1_000_001 }, null).ok, false)
})

test('parse: idempotency key rules', () => {
  const body = { userId: U, amount: 5 }
  assert.ok(parseWalletRequest('spend', body, null).ok) // optional by default
  assert.equal(parseWalletRequest('spend', body, null, { requireIdempotencyKey: true }).ok, false)
  assert.ok(parseWalletRequest('spend', { ...body, idempotencyKey: 'order-12345678' }, null, { requireIdempotencyKey: true }).ok)
  for (const k of ['short', 'has space in it', 'x'.repeat(129), "bad';--key1", 'é'.repeat(10)]) {
    assert.equal(parseWalletRequest('spend', body, k).ok, false, k)
  }
  assert.equal(parseWalletRequest('spend', { ...body, idempotencyKey: 12345678 }, null).ok, false)
  const hdr = parseWalletRequest('spend', { ...body, idempotencyKey: 'body-key-1234' }, 'header-key-1234')
  assert.ok(hdr.ok && hdr.value.idempotencyKey === 'header-key-1234') // header wins
})

test('parse: reason is trimmed, capped, and must be a string', () => {
  const r = parseWalletRequest('spend', { userId: U, amount: 1, reason: 'x'.repeat(500) }, null)
  assert.ok(r.ok && r.value.reason?.length === 200)
  assert.equal(parseWalletRequest('spend', { userId: U, amount: 1, reason: { a: 1 } }, null).ok, false)
  const blank = parseWalletRequest('spend', { userId: U, amount: 1, reason: '   ' }, null)
  assert.ok(blank.ok && blank.value.reason === null)
})

test('result mapping keeps the documented contract', () => {
  assert.deepEqual(mapWalletResult('spend', 250, { data: { status: 'ok', balance: 2150 }, error: null }),
    { status: 200, body: { success: true, spent: 250, balance: 2150 } })
  assert.deepEqual(mapWalletResult('award', 50, { data: { status: 'ok', balance: 2200 }, error: null }),
    { status: 200, body: { success: true, awarded: 50, balance: 2200 } })
  assert.deepEqual(mapWalletResult('spend', 250, { data: { status: 'insufficient', balance: 150 }, error: null }),
    { status: 402, body: { error: 'Insufficient coins', balance: 150 } })
  assert.deepEqual(mapWalletResult('spend', 250, { data: { status: 'replayed', balance: 2150 }, error: null }),
    { status: 200, body: { success: true, spent: 250, balance: 2150, replayed: true } })
  assert.equal(mapWalletResult('spend', 1, { data: null, error: { message: 'user_not_found' } }).status, 404)
  assert.equal(mapWalletResult('spend', 1, { data: null, error: { message: 'idempotency_key_conflict' } }).status, 409)
  assert.equal(mapWalletResult('spend', 1, { data: null, error: { message: 'connection reset by peer at 10.0.0.5' } }).status, 500)
  // internal error text must not leak to the game
  assert.ok(!JSON.stringify(mapWalletResult('spend', 1, { data: null, error: { message: 'secret internal detail' } }).body).includes('secret'))
  assert.equal(mapWalletResult('spend', 1, { data: { status: 'weird', balance: 1 }, error: null }).status, 500)
  assert.equal(mapWalletResult('spend', 1, { data: null, error: null }).status, 500)
})
