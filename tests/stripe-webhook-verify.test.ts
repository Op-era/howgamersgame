import { test } from 'node:test'
import assert from 'node:assert/strict'
import Stripe from 'stripe'
import { verifyStripeWebhookRequest } from '../src/lib/stripe/verify-webhook.ts'

const FIXTURE_SECRET = 'whsec_test_fixture_secret_1234567890'
const WRONG_SECRET = 'whsec_wrong_secret_0987654321'

const EVENT_PAYLOAD = JSON.stringify({
  id: 'evt_fixture_1',
  object: 'event',
  type: 'ping.test',
  data: { object: {} },
})

function signedRequest(secret: string, payload: string = EVENT_PAYLOAD, timestamp?: number): Request {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: ts,
  })
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  })
}

function signedRequestWithHeader(secret: string, header: string, payload: string = EVENT_PAYLOAD): Request {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header },
    body: payload,
  })
}

test('valid signature passes', async () => {
  const result = await verifyStripeWebhookRequest(signedRequest(FIXTURE_SECRET), FIXTURE_SECRET)
  assert.ok(result.ok)
  if (result.ok) assert.equal(result.event.type, 'ping.test')
})

test('unsigned request is rejected with 401', async () => {
  const request = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: EVENT_PAYLOAD,
  })
  const result = await verifyStripeWebhookRequest(request, FIXTURE_SECRET)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 401)
})

test('forged signature (wrong secret) is rejected with 401', async () => {
  const result = await verifyStripeWebhookRequest(signedRequest(WRONG_SECRET), FIXTURE_SECRET)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 401)
})

test('tampered body is rejected with 401', async () => {
  const tamperedPayload = JSON.stringify({
    id: 'evt_fixture_1',
    object: 'event',
    type: 'ping.tampered',
    data: { object: {} },
  })
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: EVENT_PAYLOAD,
    secret: FIXTURE_SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  })
  const request = signedRequestWithHeader(FIXTURE_SECRET, header, tamperedPayload)
  const result = await verifyStripeWebhookRequest(request, FIXTURE_SECRET)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 401)
})

test('stale timestamp (10 minutes) is rejected with 401', async () => {
  const stale = Math.floor(Date.now() / 1000) - 600
  const result = await verifyStripeWebhookRequest(signedRequest(FIXTURE_SECRET, EVENT_PAYLOAD, stale), FIXTURE_SECRET)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 401)
})

test('malformed header is rejected with 401', async () => {
  const request = new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'not-a-valid-signature' },
    body: EVENT_PAYLOAD,
  })
  const result = await verifyStripeWebhookRequest(request, FIXTURE_SECRET)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 401)
})

test('unset secret fails closed with 503', async () => {
  const result = await verifyStripeWebhookRequest(signedRequest(FIXTURE_SECRET), undefined)
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 503)
})

test('empty-string secret fails closed with 503', async () => {
  const result = await verifyStripeWebhookRequest(signedRequest(''), '')
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.response.status, 503)
})
