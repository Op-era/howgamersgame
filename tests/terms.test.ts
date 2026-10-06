import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COIN_TERMS_SUMMARY, COIN_TERMS_VERSION, checkTermsAcceptance, parseAcceptedAt } from '../src/lib/coins/terms.ts'
import { validateCheckoutSession } from '../src/lib/coins/checkout.ts'

const NOW = new Date('2026-10-04T20:00:00.000Z')

test('purchase needs explicit acceptance of the current terms version', () => {
  const ok = checkTermsAcceptance({ acceptedTerms: true, termsVersion: COIN_TERMS_VERSION }, NOW)
  assert.deepEqual(ok, { ok: true, version: COIN_TERMS_VERSION, acceptedAt: '2026-10-04T20:00:00.000Z' })

  for (const body of [undefined, null, {}, { packageId: 'player' }, { acceptedTerms: false, termsVersion: COIN_TERMS_VERSION },
    { acceptedTerms: 'true', termsVersion: COIN_TERMS_VERSION }, { acceptedTerms: 1, termsVersion: COIN_TERMS_VERSION }]) {
    const r = checkTermsAcceptance(body, NOW)
    assert.equal(r.ok, false, JSON.stringify(body))
    if (!r.ok) { assert.equal(r.status, 400); assert.equal(r.code, 'terms_required') }
  }
})

test('stale or missing terms version is rejected with 409', () => {
  for (const v of ['2025-01-01', '', undefined, 20261004]) {
    const r = checkTermsAcceptance({ acceptedTerms: true, termsVersion: v }, NOW)
    assert.equal(r.ok, false)
    if (!r.ok) { assert.equal(r.status, 409); assert.equal(r.code, 'terms_outdated') }
  }
})

test('acceptance time is stamped by the server, a client supplied time is ignored', () => {
  const r = checkTermsAcceptance({ acceptedTerms: true, termsVersion: COIN_TERMS_VERSION, termsAcceptedAt: '1999-01-01T00:00:00Z' }, NOW)
  assert.ok(r.ok && r.acceptedAt === NOW.toISOString())
})

test('webhook validation carries the terms version and time from session metadata', () => {
  const U = '11111111-1111-4111-8111-111111111111'
  const base = {
    id: 'cs_test_abc1234567890', mode: 'payment', payment_status: 'paid', currency: 'usd', amount_total: 500,
    client_reference_id: U, payment_intent: 'pi_1',
  }
  const withTerms = validateCheckoutSession({
    ...base, metadata: { userId: U, packageId: 'player', termsVersion: COIN_TERMS_VERSION, termsAcceptedAt: NOW.toISOString() },
  })
  assert.ok(withTerms.ok)
  if (withTerms.ok) {
    assert.equal(withTerms.purchase.termsVersion, COIN_TERMS_VERSION)
    assert.equal(withTerms.purchase.termsAcceptedAt, NOW.toISOString())
  }
  // a paid session without terms metadata is still credited (customer paid), but recorded as null
  const without = validateCheckoutSession({ ...base, metadata: { userId: U, packageId: 'player' } })
  assert.ok(without.ok)
  if (without.ok) { assert.equal(without.purchase.termsVersion, null); assert.equal(without.purchase.termsAcceptedAt, null) }
  assert.equal(parseAcceptedAt('not a date'), null)
  assert.equal(parseAcceptedAt(undefined), null)
})

test('terms wording: says the three things plainly and uses no dashes', () => {
  assert.match(COIN_TERMS_SUMMARY, /final/i)
  assert.match(COIN_TERMS_SUMMARY, /no refunds/i)
  assert.match(COIN_TERMS_SUMMARY, /no cash value/i)

  const page = readFileSync(new URL('../src/app/terms/page.tsx', import.meta.url), 'utf8')
  const start = page.indexOf("id: 'coins'")
  const end = page.indexOf("title: '5. SUBSCRIPTIONS'")
  assert.ok(start > 0 && end > start, 'coin section not found')
  const section = page.slice(start, end)
  // the visible text lives in the template literal
  const text = section.slice(section.indexOf('`'), section.lastIndexOf('`'))
  assert.match(text, /ALL COIN PURCHASES ARE FINAL/)
  assert.match(text, /do not give refunds/i)
  assert.match(text, /no cash value/i)
  assert.doesNotMatch(text, /[\u2012-\u2015\u2212]/, 'no em/en dashes')
  assert.doesNotMatch(text, /[A-Za-z]-[A-Za-z]/, 'no hyphenated words')
  assert.doesNotMatch(COIN_TERMS_SUMMARY, /[-\u2012-\u2015]/)
})

test('route and store page enforce the terms', () => {
  const route = readFileSync(new URL('../src/app/api/coins/purchase/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('checkTermsAcceptance(body)') > 0)
  // acceptance is checked before Stripe is touched
  assert.ok(route.indexOf('checkTermsAcceptance(body)') < route.indexOf('checkout.sessions.create'))
  assert.match(route, /termsVersion: terms\.version/)
  assert.match(route, /termsAcceptedAt: terms\.acceptedAt/)
  const store = readFileSync(new URL('../src/app/store/page.tsx', import.meta.url), 'utf8')
  assert.match(store, /type="checkbox"/)
  assert.match(store, /disabled=\{!!loading \|\| !acceptedTerms\}/)
  assert.match(store, /acceptedTerms: true, termsVersion: COIN_TERMS_VERSION/)
})
