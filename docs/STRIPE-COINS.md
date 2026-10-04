# Stripe coin purchases: setup, webhook, and live test

How buying coins works, what you must configure before real money moves, and the exact steps for the first live $5 test.

> **Status:** code is complete and tested locally. **Not done:** live Stripe keys, webhook registration, running the SQL migration on production Supabase, and a live charge. Do these in the order below.
>
> `COIN-ECONOMY-DECISIONS.md` was not found in this repo. Pack prices, coins, and bonuses follow `ROADMAP.md` (Player $5/550, Gamer $10/1,200, Pro $20/2,500, Elite $40/5,200, Legend $100/14,000).

## Flow

1. Signed-in user clicks a pack on `/store`. The browser calls `POST /api/coins/purchase { packageId }`.
2. The server looks the pack up in `src/lib/coins/packs.ts` (the only source of price and coin amounts), and creates a Stripe Checkout Session (`mode: payment`, USD). Metadata `{userId, packageId}` is attached to the Session and the PaymentIntent, and `client_reference_id` is the user id.
3. Stripe redirects to `/store/success?session_id=cs_...`. The page polls `GET /api/coins/purchases?session_id=...` and shows "Confirming payment" until the webhook has credited the coins. It never claims success on its own.
4. Stripe calls `POST /api/webhooks/stripe`. After signature verification, the handler checks the Session really is a paid USD payment for exactly the pack's price, then calls the SQL function `credit_coin_purchase()`.
5. `credit_coin_purchase()` runs as one database transaction: dedupe on Stripe event id, dedupe on Checkout Session id, add coins to the wallet with a single `UPDATE`, write the `coin_transactions` row, write the `revenue_events` row. A failure rolls back everything, including the dedupe marker, so Stripe's retry works.

Return codes: `200` credited / already processed / unrelated event / payment still pending, `400` bad signature or a *paid* session that doesn't match what we sell (logged as `manual review needed`), `500` database failure (Stripe retries for up to 3 days), `503` server missing its Stripe config.

## Environment variables

Set in the hosting environment (Fly secrets or equivalent). Never commit values.

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | `sk_test_...` for testing, `sk_live_...` for production |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` of the webhook endpoint (test and live endpoints have different secrets) |
| `NEXT_PUBLIC_APP_URL` | `https://howgamersgame.online`. **Required in production**; checkout returns 503 without it (no more localhost fallback) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Used by the webhook and the purchase-history API. Server only |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Purchase confirmation email (best effort; failure does not affect crediting) |

`NEXT_PUBLIC_*` values are baked in at build time for client code, so set them before building the image.

## Database setup (Supabase SQL Editor)

Run in this order. Both files are safe to re-run.

1. `src/lib/supabase/migrations/2026-10-04-a-coin-purchase-ledger.sql` creates `stripe_events`, `revenue_events` (append-only), the `stripe_checkout_session_id` column, and `credit_coin_purchase()` (executable by `service_role` only). The same SQL is mirrored at the end of `schema.sql` for fresh installs.
2. `src/lib/supabase/migrations/2026-10-04-protect-wallet-columns.sql` (**strongly recommended before real money**). The existing RLS policy "Users can update own profile" lets any signed-in user edit their own `coin_balance` from the browser with the public anon key. This trigger blocks that. The service role and SQL editor are unaffected. Existing server routes (spend, award, balance) use the admin client, so they keep working.

Verified against a scratch PostgreSQL 18 with `schema.sql` plus both migrations applied: `tests/sql/coin-purchase.sql` and `tests/sql/concurrency.sh` (see "Tests").

## Stripe Dashboard setup

1. Developers > Webhooks > Add endpoint.
2. Endpoint URL: `https://howgamersgame.online/api/webhooks/stripe`
3. Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`. (Nothing else is handled; extra events are acknowledged and ignored.)
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Do this once in **test mode** first (test keys + test endpoint), then again in live mode.

### Local testing with the Stripe CLI (test mode, no real money)

```sh
stripe login
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # prints a whsec_... for .env.local
npm run dev
# sign in, buy a pack with card 4242 4242 4242 4242, any future expiry, any CVC
```

Then check the three tables below. Re-send the same event from the Dashboard (Developers > Events > Resend) and confirm the balance does not change.

## Exact steps for the first live $5 test charge

Do **only** with Shane's go-ahead. Costs $5 plus Stripe's fee, refundable.

1. Run both SQL files on production Supabase (above). Confirm `select proname from pg_proc where proname = 'credit_coin_purchase';` returns a row.
2. Set live `STRIPE_SECRET_KEY`, live `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_APP_URL`. Deploy this branch.
3. Create the **live** webhook endpoint (section above). Dashboard "Send test webhook" events carry no coin metadata and are skipped, which is correct, so they cannot replace the real purchase below.
4. Use a dedicated test account. Note its user id and starting balance:
   `select id, coin_balance, total_coins_purchased from profiles where id = '<USER_ID>';`
5. On `/store`, buy the **Player** pack ($5, 550 coins) with a real card. You should land on "Confirming payment", then "Coins loaded: 550".
6. Verify in Supabase:
   ```sql
   select type, amount, balance_after, stripe_checkout_session_id from coin_transactions where user_id = '<USER_ID>' order by created_at desc limit 1;
   select event_type, package_id, gross_cents, coins_credited, bonus_coins, stripe_event_id from revenue_events where user_id = '<USER_ID>' order by created_at desc limit 1;
   select * from stripe_events order by processed_at desc limit 3;
   select coin_balance, total_coins_purchased from profiles where id = '<USER_ID>';  -- +550 on both
   ```
   Expect exactly one row each, `gross_cents = 500`, `coins_credited = 550`, `bonus_coins = 50`. In Stripe, Developers > Webhooks > the endpoint should show `200` responses.
7. In the Dashboard, Resend the event once more. Confirm still exactly one row and unchanged balance.
8. Refund the payment in Stripe Dashboard (Payments > the $5 payment > Refund).
9. **Refunds do not reverse coins automatically** (see below). Reverse the test account by hand:
   ```sql
   begin;
   update profiles set coin_balance = greatest(coin_balance - 550, 0), total_coins_purchased = greatest(total_coins_purchased - 550, 0) where id = '<TEST_USER_ID>';
   insert into coin_transactions (user_id, type, amount, balance_after, description)
     select id, 'refund', -550, coin_balance, 'Manual reversal of live test purchase' from profiles where id = '<TEST_USER_ID>';
   insert into revenue_events (event_type, user_id, package_id, gross_cents, currency, coins_credited, bonus_coins, stripe_event_id, stripe_checkout_session_id)
     values ('refund', '<TEST_USER_ID>', 'player', 500, 'usd', -550, -50, 'manual_refund_<ANY_UNIQUE_STRING>', '<cs_live_... of the test>');
   commit;
   ```
   Only for the test account; if the balance was already spent, decide separately.

## Known gaps and follow-ups (not done here)

- **Refunds and chargebacks** do not claw back coins or write `refund` / `chargeback` ledger rows. `ROADMAP.md` lists refund and chargeback rules as undecided, so the table already allows those event types but nothing writes them. Subscribe to `charge.refunded` / `charge.dispute.created` once the policy is decided. Until then, watch the Stripe Dashboard for disputes.
- **Spend and award routes** (`/api/coins/spend`, `/api/coins/award`) are out of scope but have the same class of problem the webhook had. `spend` relies on an "optimistic lock" whose failure branch can never fire (a zero-row update returns no error), so concurrent spends can overdraw or double-spend, and there is no idempotency key. `award` is a plain read-modify-write. Both should become atomic SQL functions like `credit_coin_purchase()`.
- Other emails (`sendConfirmationEmail`, password reset) still interpolate `displayName` into HTML without escaping.
- The store page footer says coins are non-refundable; make sure your terms page agrees before launch.
- Connect/payouts, subscriptions, and ad-watch rewards are intentionally not touched.

## Tests

```sh
npm test    # node --test "tests/**/*.test.ts": 16 tests, no network, no keys needed
```

Covers pack/price table, session validation (unpaid, wrong amount, wrong currency, forged metadata, bad user id), duplicate/concurrent delivery against an in-memory model of the SQL function, failure then retry, email failure isolation, real Stripe signature verification with a fake secret, HTML escaping, and the history payload.

SQL (needs a scratch Postgres; never run against production):

```sh
psql -d scratch -v ON_ERROR_STOP=1 -f tests/sql/coin-purchase.sql
PSQL="psql -d scratch" sh tests/sql/concurrency.sh
```

The scratch DB needs `schema.sql` and both migrations applied, plus stand-ins for Supabase's `auth.users`, `auth.uid()`, `auth.role()`, and the `anon` / `authenticated` / `service_role` roles.
