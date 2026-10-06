import { test } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { COIN_PACKAGES, getPackageById } from '../src/lib/coins/packs.ts'
import { validateCheckoutSession } from '../src/lib/coins/checkout.ts'
import { handleStripeEvent } from '../src/lib/coins/webhook.ts'
import type { CreditResult, WebhookDeps } from '../src/lib/coins/webhook.ts'
import type { ValidPurchase } from '../src/lib/coins/checkout.ts'
import { escapeHtml } from '../src/lib/coins/html.ts'
import { isPlausibleSessionId, toPurchaseHistoryItem } from '../src/lib/coins/history.ts'

const USER = '11111111-1111-4111-8111-111111111111'

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_abc1234567890',
    mode: 'payment',
    payment_status: 'paid',
    currency: 'usd',
    amount_total: 500,
    client_reference_id: USER,
    payment_intent: 'pi_123',
    metadata: { userId: USER, packageId: 'player', coins: '550' },
    customer_email: 'buyer@example.test',
    customer_details: { email: 'buyer@example.test', name: 'Buyer' },
    ...over,
  }
}
function event(id: string, obj: unknown, type = 'checkout.session.completed') {
  return { id, type, data: { object: obj } }
}

// In-memory stand-in for credit_coin_purchase(): same rules as the SQL function.
function fakeLedger() {
  const events = new Set<string>()
  const sessions = new Set<string>()
  const balances = new Map<string, number>([[USER, 0]])
  const rows = { tx: 0, revenue: 0 }
  let failNext = false
  return {
    balances, rows,
    failOnce() { failNext = true },
    async creditPurchase(eventId: string, _t: string, p: ValidPurchase): Promise<CreditResult> {
      await Promise.resolve() // yield, so concurrent calls interleave
      if (failNext) { failNext = false; throw new Error('db down') }
      if (events.has(eventId)) return { status: 'duplicate_event' }
      if (sessions.has(p.sessionId)) return { status: 'duplicate_session' }
      if (!balances.has(p.userId)) throw new Error('profile_not_found')
      events.add(eventId); sessions.add(p.sessionId)
      const after = balances.get(p.userId)! + p.coins
      balances.set(p.userId, after)
      rows.tx++; rows.revenue++
      return { status: 'credited', balanceAfter: after }
    },
  }
}
function deps(ledger = fakeLedger()) {
  const emails: ValidPurchase[] = []
  const logs: string[] = []
  const d: WebhookDeps = {
    creditPurchase: ledger.creditPurchase,
    sendEmail: async p => { emails.push(p) },
    log: (_l, m) => { logs.push(m) },
  }
  return { d, ledger, emails, logs }
}

test('pack table matches ROADMAP prices and bonus math', () => {
  assert.deepEqual(COIN_PACKAGES.map(p => [p.id, p.priceCents, p.coins]), [
    ['player', 500, 550], ['gamer', 1000, 1200], ['pro', 2000, 2500], ['elite', 4000, 5200], ['legend', 10000, 14000],
  ])
  for (const p of COIN_PACKAGES) {
    const pct = (p.bonusCoins / (p.coins - p.bonusCoins)) * 100
    assert.ok([10, 20, 25, 30, 40].includes(Math.round(pct)), `${p.id} bonus pct ${pct}`)
    assert.equal(p.coins - p.bonusCoins, p.priceCents) // 1 coin = $0.01 base value
  }
})

test('getPackageById rejects non-strings and unknown ids', () => {
  assert.equal(getPackageById('player')?.coins, 550)
  for (const bad of [undefined, null, 5, {}, ['player'], 'PLAYER', '__proto__', 'free']) {
    assert.equal(getPackageById(bad), undefined)
  }
})

test('valid paid session is accepted and uses SERVER coins, not metadata', () => {
  const r = validateCheckoutSession(session({ metadata: { userId: USER, packageId: 'player', coins: '999999' } }))
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.purchase.coins, 550)
    assert.equal(r.purchase.bonusCoins, 50)
    assert.equal(r.purchase.grossCents, 500)
    assert.equal(r.purchase.paymentIntentId, 'pi_123')
  }
})

test('rejections: unpaid is skipped, mismatches are flagged invalid', () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ payment_status: 'unpaid' }, 'not_paid'],
    [{ payment_status: 'no_payment_required' }, 'not_paid'],
    [{ mode: 'subscription' }, 'not_ours'],
    [{ metadata: {} }, 'not_ours'],
    [{ metadata: { userId: USER, packageId: 'mega' } }, 'invalid'],
    [{ metadata: { userId: 'not-a-uuid', packageId: 'player' } }, 'invalid'],
    [{ metadata: { packageId: 'player' } }, 'invalid'],
    [{ amount_total: 100 }, 'invalid'],        // paid $1 for the $5 pack
    [{ amount_total: null }, 'invalid'],
    [{ currency: 'eur' }, 'invalid'],
    [{ client_reference_id: '22222222-2222-4222-8222-222222222222' }, 'invalid'],
    [{ id: null }, 'invalid'],
  ]
  for (const [over, reason] of cases) {
    const r = validateCheckoutSession(session(over))
    assert.equal(r.ok, false, JSON.stringify(over))
    if (!r.ok) assert.equal(r.reason, reason, JSON.stringify(over))
  }
})

test('webhook credits once and emails once', async () => {
  const { d, ledger, emails } = deps()
  const out = await handleStripeEvent(event('evt_1', session()), d)
  assert.equal(out.status, 200)
  assert.equal(out.body.credited, 550)
  assert.equal(ledger.balances.get(USER), 550)
  assert.equal(emails.length, 1)
})

test('duplicate delivery of the same event does not double credit', async () => {
  const { d, ledger, emails } = deps()
  await handleStripeEvent(event('evt_1', session()), d)
  const again = await handleStripeEvent(event('evt_1', session()), d)
  assert.equal(again.status, 200)
  assert.equal(again.body.skipped, 'duplicate_event')
  assert.equal(ledger.balances.get(USER), 550)
  assert.equal(emails.length, 1)
})

test('completed + async_payment_succeeded for one session credit once', async () => {
  const { d, ledger } = deps()
  await handleStripeEvent(event('evt_1', session()), d)
  const second = await handleStripeEvent(event('evt_2', session(), 'checkout.session.async_payment_succeeded'), d)
  assert.equal(second.body.skipped, 'duplicate_session')
  assert.equal(ledger.balances.get(USER), 550)
})

test('concurrent deliveries credit exactly once', async () => {
  const { d, ledger } = deps()
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => handleStripeEvent(event(`evt_${i % 3}`, session()), d)),
  )
  assert.equal(results.filter(r => r.body.credited).length, 1)
  assert.ok(results.every(r => r.status === 200))
  assert.equal(ledger.balances.get(USER), 550)
  assert.deepEqual(ledger.rows, { tx: 1, revenue: 1 })
})

test('DB failure returns 500 and the retry then succeeds exactly once', async () => {
  const { d, ledger, emails, logs } = deps()
  ledger.failOnce()
  const first = await handleStripeEvent(event('evt_1', session()), d)
  assert.equal(first.status, 500)
  assert.equal(ledger.balances.get(USER), 0)
  assert.equal(emails.length, 0)
  assert.ok(logs.some(l => l.includes('Stripe will retry')))
  const retry = await handleStripeEvent(event('evt_1', session()), d)
  assert.equal(retry.status, 200)
  assert.equal(ledger.balances.get(USER), 550)
})

test('unknown user: 500 so Stripe keeps retrying, nothing credited', async () => {
  const { d, ledger } = deps()
  const other = '33333333-3333-4333-8333-333333333333'
  const out = await handleStripeEvent(event('evt_9', session({ metadata: { userId: other, packageId: 'player' }, client_reference_id: other })), d)
  assert.equal(out.status, 500)
  assert.equal(ledger.balances.get(USER), 0)
})

test('mismatched paid session is 400, logged loudly, and never credited', async () => {
  const { d, ledger, logs } = deps()
  const out = await handleStripeEvent(event('evt_1', session({ amount_total: 100 })), d)
  assert.equal(out.status, 400)
  assert.equal(ledger.balances.get(USER), 0)
  assert.ok(logs.some(l => l.includes('manual review')))
})

test('unpaid (async pending) and unrelated events are 200 with no credit', async () => {
  const { d, ledger } = deps()
  const pending = await handleStripeEvent(event('evt_1', session({ payment_status: 'unpaid' })), d)
  assert.equal(pending.status, 200)
  const other = await handleStripeEvent(event('evt_2', { id: 'in_1' }, 'invoice.paid'), d)
  assert.equal(other.status, 200)
  assert.equal(ledger.balances.get(USER), 0)
})

test('email failure never fails the webhook (coins already credited)', async () => {
  const { d, ledger } = deps()
  d.sendEmail = async () => { throw new Error('resend down') }
  const out = await handleStripeEvent(event('evt_1', session()), d)
  assert.equal(out.status, 200)
  assert.equal(ledger.balances.get(USER), 550)
})

test('real Stripe signature verification: valid, tampered, wrong secret', () => {
  const stripe = new Stripe('sk_test_placeholder_not_real')
  const secret = 'whsec_test_placeholder'
  const payload = JSON.stringify(event('evt_sig', session()))
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, 'evt_sig')
  assert.throws(() => stripe.webhooks.constructEvent(payload + ' ', header, secret))
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_other'))
})

test('escapeHtml neutralises markup in names', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;')
})

test('purchase history item exposes only user-safe fields', () => {
  const item = toPurchaseHistoryItem({
    created_at: '2026-10-04T10:00:00Z', package_id: 'gamer', gross_cents: 1000, currency: 'usd',
    coins_credited: 1200, bonus_coins: 200, stripe_checkout_session_id: 'cs_test_abc1234567890',
  })
  assert.deepEqual(Object.keys(item).sort(),
    ['bonusCoins', 'coins', 'createdAt', 'currency', 'grossCents', 'packageId', 'packageName', 'sessionId'])
  assert.equal(item.packageName, 'Gamer')
  assert.ok(isPlausibleSessionId('cs_test_abc1234567890'))
  for (const bad of [null, '', 'cs_', 'pi_123', "cs_test_x'; drop table", 'cs_test_abc1234567890,id.eq.1']) {
    assert.equal(isPlausibleSessionId(bad), false)
  }
})
