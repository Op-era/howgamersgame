import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isAuthorizedCron } from '../src/lib/coins/cronAuth.ts'

const SECRET = 'cron-secret-123'

test('correct header returns true', () => {
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, SECRET), true)
})

test('wrong secret returns false', () => {
  assert.equal(isAuthorizedCron('Bearer wrong-secret', SECRET), false)
})

test('missing header returns false', () => {
  assert.equal(isAuthorizedCron(null, SECRET), false)
})

test('empty bearer token returns false', () => {
  assert.equal(isAuthorizedCron('Bearer ', SECRET), false)
})

test('header without Bearer prefix returns false', () => {
  assert.equal(isAuthorizedCron(SECRET, SECRET), false)
})

test('header of different length returns false', () => {
  assert.equal(isAuthorizedCron('Bearer short', SECRET), false)
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}-extra`, SECRET), false)
})

test('unset or empty secret returns false', () => {
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, undefined), false)
  assert.equal(isAuthorizedCron(`Bearer ${SECRET}`, ''), false)
})

test('vercel.json contains the expire-promo cron', () => {
  const raw = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  const config = JSON.parse(raw) as { crons?: Array<{ path?: string; schedule?: string }> }
  assert.ok(Array.isArray(config.crons))
  const cron = config.crons?.find((c) => c.path === '/api/cron/expire-promo')
  assert.ok(cron, 'expected a cron for /api/cron/expire-promo')
  assert.ok(cron?.schedule && cron.schedule.length > 0)
})
