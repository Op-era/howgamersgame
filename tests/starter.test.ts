import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grantStarterCoins, POWER_UP_PRICE_COINS, STARTER_GRANT_COINS } from '../src/lib/coins/starter.ts'

const U = '11111111-1111-4111-8111-111111111111'

test('starter grant constants', () => {
  assert.equal(STARTER_GRANT_COINS, 3 * POWER_UP_PRICE_COINS)
  assert.equal(STARTER_GRANT_COINS, 150)
})

test('grantStarterCoins calls the injected query once', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params })
    return { rows: [] }
  }
  await grantStarterCoins(query, U)
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /grant_starter_coins/)
  assert.deepEqual(calls[0].params, [U, 150])
})

test('grantStarterCoins does not throw when the query rejects', async () => {
  const query = async () => {
    throw new Error('connection reset')
  }
  await assert.doesNotReject(() => grantStarterCoins(query, U))
})
