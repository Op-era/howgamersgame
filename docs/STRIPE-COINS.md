# Stripe coin purchases: setup, webhook, and live test

How buying coins works, what you must configure before real money moves, and the exact steps for the first live $5 test.

> **Status:** code is complete and tested locally (scratch Postgres, unit tests, build). **Not done:** live Stripe keys, webhook registration, running the SQL migration on production Supabase, and a live charge. Do these in the order below.
>
> `COIN-ECONOMY-DECISIONS.md` was not found in this repo. Pack prices, coins, and bonuses follow `ROADMAP.md` (Player $5/550, Gamer $10/1,200, Pro $20/2,500, Elite $40/5,200, Legend $100/14,000).

## Flow

1. Signed-in user ticks the **coin purchase terms** checkbox on `/store` (all coin purchases are final, no refunds, coins have no cash value), then clicks a pack. Buy buttons stay disabled until the box is ticked. The browser calls `POST /api/coins/purchase { packageId, acceptedTerms: true, termsVersion }`. The server refuses (400 `terms_required`, or 409 `terms_outdated` if the version is old) without a valid acceptance, and stamps the acceptance time itself.
2. The server looks the pack up in `src/lib/coins/packs.ts` (the only source of price and coin amounts), and creates a Stripe Checkout Session (`mode: payment`, USD). Metadata `{userId, packageId, termsVersion, termsAcceptedAt}` is attached to the Session and the PaymentIntent, `client_reference_id` is the user id, and the terms summary is shown next to Stripe's pay button.
3. Stripe redirects to `/store/success?session_id=cs_...`. The page polls `GET /api/coins/purchases?session_id=...` and shows "Confirming payment" until the webhook has credited the coins. It never claims success on its own.
4. Stripe calls `POST /api/webhooks/stripe`. After signature verification, the handler checks the Session really is a paid USD payment for exactly the pack's price, then calls the SQL function `credit_coin_purchase()`, which also stores the terms version and acceptance time on the `revenue_events` row.
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
| `COINS_REQUIRE_IDEMPOTENCY_KEY` | Optional. `true` makes games send an idempotency key on spend and award (recommended once games are updated) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Purchase confirmation email (best effort; failure does not affect crediting) |

`NEXT_PUBLIC_*` values are baked in at build time for client code, so set them before building the image.

## Database setup (Supabase SQL Editor)

Run all three files **in this order**. All are safe to re-run. For a brand new database, `schema.sql` already contains them (regenerate with `python3 scripts/sync-schema.py` after editing a migration).

1. `src/lib/supabase/migrations/2026-10-04-a-coin-purchase-ledger.sql`: `stripe_events`, `revenue_events` (append only, includes terms version and acceptance time), the `stripe_checkout_session_id` column, and `credit_coin_purchase()`.
2. `src/lib/supabase/migrations/2026-10-04-b-wallet-protection.sql` (**required, not optional**): players can never change their own coins.
3. `src/lib/supabase/migrations/2026-10-04-c-spend-award.sql`: atomic, idempotent `spend_coins()` and `award_coins()`, and the `idempotency_key` ledger column.

**Run order warning:** deploy the code only after all three are applied. The new routes call functions that do not exist before the migrations, and `/store` needs `revenue_events`.

### Wallet protection (file b): who can change what

Before this, the RLS policy "Users can update own profile" let any signed-in user set their own `coin_balance` with the public anon key, and `game_api_keys` had no RLS, so a player could read key hashes or insert a key they knew and then award themselves coins. Now, three layers:

| Layer | Effect |
| --- | --- |
| Privileges | `anon` / `authenticated` lose INSERT and DELETE on `profiles` and may UPDATE only `username`, `display_name`, `avatar_url`. They lose all writes on `coin_transactions`, `coin_packages`, `games`, and all access to `revenue_events`, `stripe_events`, `game_api_keys`. |
| RLS | Enabled on `game_api_keys` (no policies, service role only) and `coin_packages` (public read of active packs). |
| Trigger | `profiles_protect_wallet` blocks changes to `coin_balance` / `total_coins_purchased` (and inserts with a non zero balance) whenever the database role is `anon` or `authenticated`, even if someone re-grants privileges later. |

Only the service role key (server routes), the SECURITY DEFINER functions, and the SQL editor can change wallet or ledger data. Side effects to know: the admin game page now reads API keys with the admin client (it is behind `requireAdmin()`), and clients can no longer upsert into `profiles` (the app never did; the profile row is created by the signup trigger).

## Spend and award (game API)

`POST /api/coins/spend` and `POST /api/coins/award` now call `spend_coins()` / `award_coins()`: one transaction, a row lock on the player's profile, a single `UPDATE`, never below zero, one `coin_transactions` ledger row with the `game_id`. The `Authorization: Bearer <game key>` contract in `GAME_API_GUIDE.md` is unchanged.

- **Who can call:** only a holder of a valid, active game API key. Admins create keys per game, and the key must stay on the game's server. Players have no key and cannot read or create one (see wallet protection). The SQL functions themselves are executable by `service_role` only.
- **Idempotency:** send `Idempotency-Key: <unique per operation>` (or `idempotencyKey` in the body). The first call applies; a retry with the same key returns the original result with `"replayed": true` and changes nothing. Keys are scoped per game and per spend/award. The same key with a different user or amount returns `409`.
- The key is **optional by default so existing games keep working**, but without one a retry is a new spend. Set `COINS_REQUIRE_IDEMPOTENCY_KEY=true` to make it mandatory once games send it.
- Limits: award max 10,000 per call (also enforced in SQL), spend max 1,000,000 per call, whole numbers only.
- Spends and awards are recorded in `coin_transactions` (type `spend` / `award`, with `game_id`), which is the wallet ledger. `revenue_events` stays purchase revenue only. Developer revenue share can be computed from `spend` rows by `game_id`.
- Changed responses: `409` now means idempotency key conflict (it used to mean "concurrent update, retry", which can no longer happen).

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

1. Run all three SQL files on production Supabase (above). Confirm `select proname from pg_proc where proname = 'credit_coin_purchase';` returns a row.
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

- **Refunds and chargebacks** do not claw back coins or write ledger rows, by decision (see the terms section). `revenue_events` allows `refund` / `chargeback` types for later. Watch the Stripe Dashboard for disputes; a lost dispute costs money plus a fee.
- Spent and awarded coins are not tracked as "paid" versus "free" lots. ROADMAP's developer payout model (paid value of the coin lot) needs that before payouts exist.
- Games can award up to 10,000 coins per call with no daily cap per game or per player. Consider caps before opening the API to outside developers.
- `verifyGameApiKey` accepts keys of games that are marked inactive.
- Other emails (`sendConfirmationEmail`, password reset) still interpolate `displayName` into HTML without escaping.
- Connect/payouts, subscriptions, and ad-watch rewards are intentionally not touched. Terms section 5 still describes subscriptions that do not exist yet.

## Coin purchase terms (no refunds)

Wording lives on `/terms` section 4 ("Coin economy and coin purchases") and in `src/lib/coins/terms.ts`:

- Summary shown at checkout: "All coin purchases are final. No refunds. Coins have no cash value."
- The store page requires a ticked checkbox linking to `/terms#coins`; the server re-checks it in `POST /api/coins/purchase`.
- `COIN_TERMS_VERSION` (currently `2026-10-04`) is stored with each purchase together with the server side acceptance time (Stripe Session and PaymentIntent metadata, then `revenue_events.terms_version` and `terms_accepted_at`). **Bump the version whenever the wording changes**; buyers then get a "terms changed, reload" message and must accept again.

**Legal review needed.** This wording is a plain language draft written by engineering. The Chief of Staff has legal drafts for the howgamersgame Terms of Service (task 8549551d); Legal should replace or approve the section 4 text before launch, and then the version should be bumped. Open questions for Legal: the "law where you live" carve out, the chargeback sentence ("we may suspend your account while we look into it"), and whether minors (13 to 17) can be bound.

Refund reversal is **not implemented** (by decision): the app never takes coins back after a refund or chargeback, and no `refund` / `chargeback` rows are written. If you refund someone in the Stripe Dashboard anyway, only the test account steps above remove coins.

## Tests

```sh
npm test    # node --test "tests/**/*.test.ts": 28 tests, no network, no keys needed
```

Covers pack/price table, session validation, duplicate/concurrent delivery against an in memory model of the SQL function, failure then retry, real Stripe signature verification with a fake secret, HTML escaping, history payload, spend/award request parsing and result mapping, and the terms rules (acceptance, stale version, server stamped time, wording has no dashes, route and store page enforce it).

SQL, against a **scratch** Postgres only (never production). One command builds the scratch database (Supabase stand-ins, `schema.sql`, then every migration again to prove they re-run):

```sh
export PSQL_BASE="psql -h /tmp -p 54329 -U postgres"
sh tests/sql/setup-scratch.sh scratch
for f in coin-purchase wallet-protection spend-award; do $PSQL_BASE -d scratch -q -v ON_ERROR_STOP=1 -f tests/sql/$f.sql; done
PSQL="$PSQL_BASE -d scratch" sh tests/sql/concurrency.sh
PSQL="$PSQL_BASE -d scratch" sh tests/sql/spend-award-concurrency.sh
```

- `wallet-protection.sql`: as `anon` and `authenticated` (real `SET ROLE`), every direct write to `coin_balance`, `total_coins_purchased`, profile inserts and upserts (`INSERT .. ON CONFLICT DO UPDATE`), other players' rows, `coin_transactions`, `revenue_events`, `stripe_events`, `game_api_keys`, `coin_packages` and `games` is refused; reading key hashes and revenue is refused; display name edits and reading your own balance still work; the service role still works; and with privileges deliberately re-granted, the trigger alone still blocks the balance change.
- `spend-award.sql`: ledger rows, replay, key conflicts, insufficient funds, caps, validation, `anon` / `authenticated` cannot call the functions.
- `spend-award-concurrency.sh`: 25 parallel spends against a balance of 100 (exactly 3 apply, balance 10, never negative), 12 parallel retries with one key (applied once), 12 parallel award retries (applied once), 40 mixed parallel operations (balance equals the ledger), purchases and spends in parallel.

The scratch DB needs the stand-ins in `tests/sql/supabase-stub.sql` for `auth.users`, `auth.uid()`, `auth.role()` and the three Supabase roles.
