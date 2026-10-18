import Stripe from 'stripe'

export async function verifyStripeWebhookRequest(
  request: Request,
  secret: string | undefined
): Promise<{ ok: true; event: Stripe.Event } | { ok: false; response: Response }> {
  if (!secret) {
    return {
      ok: false,
      response: Response.json({ error: 'Webhook not configured' }, { status: 503 }),
    }
  }

  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return {
      ok: false,
      response: Response.json({ error: 'Missing signature' }, { status: 401 }),
    }
  }

  try {
    const event = Stripe.webhooks.constructEvent(body, sig, secret)
    return { ok: true, event }
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid signature' }, { status: 401 }),
    }
  }
}
