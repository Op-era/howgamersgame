# How Gamers Game Online

## Phased Development and Launch Plan

**Domain:** howgamersgame.online
**Core concept:** A web-based game library where players purchase shared coins, use those coins across participating games, and discover games through a stylized virtual console and cartridge interface.

The platform should be built in layers. The first objective is not to build the complete virtual game room. The first objective is to prove that players can purchase coins, launch games, spend coins safely, and generate trackable revenue.

---

# Phase 0: Business Rules and Technical Foundation

## Goal

Finalize the rules that control money, game access, developer payouts, advertising, and platform responsibility before building the public product.

## Required decisions

Finalize:

* Coin-pack prices.
* Coin quantities.
* Developer revenue share.
* Promotional-coin rules.
* Refund rules.
* Chargeback rules.
* Developer payout schedule.
* Developer payout minimum.
* Earnings hold period.
* Age restrictions.
* Prohibited game categories.
* Game-hosting model.
* Advertising rules.
* Subscription rules.
* Regional-pricing strategy.
* Who is legally considered the seller.
* What happens when a game is removed.
* What happens to permanent purchases when a game closes.

## Initial coin packs

| Pack   | Price |  Coins | Bonus |
| ------ | ----: | -----: | ----: |
| Player |    $5 |    550 |   10% |
| Gamer  |   $10 |  1,200 |   20% |
| Pro    |   $20 |  2,500 |   25% |
| Elite  |   $40 |  5,200 |   30% |
| Legend |  $100 | 14,000 |   40% |

## Initial developer payout model

* Developers begin at approximately 50% of eligible paid coin value spent in their games.
* Developers are paid based on actual paid value, not a fixed cash amount per coin.
* Purchased coin-pack bonuses are included in the proportional value of the coin lot.
* Free promotional coins initially produce no automatic developer payout.
* Developer earnings remain pending before becoming payable.
* Refunds, fraud, and chargebacks may reverse earnings.

## Foundation documents

Create initial versions of:

* Terms of service.
* Privacy policy.
* Coin terms.
* Refund policy.
* Developer agreement.
* Revenue-share agreement.
* Content policy.
* Advertising policy.
* Age policy.
* Security and incident-response plan.

## Completion criteria

Phase 0 is complete when the platform's financial and operating rules are documented clearly enough that the database and APIs can be designed without guessing.

---

# Phase 1: Functional Player Platform

## Goal

Launch a basic website where players can create accounts, purchase coins, browse a small game library, and play games.

This phase proves that the basic business can function.

The website does not need the full animated console room yet. It only needs to be clear, reliable, and usable.

## Player features

Build:

* Home page.
* Game-library page.
* Basic grid of games.
* Search.
* Genre filters.
* Game-detail pages.
* User registration.
* User login.
* Email verification.
* Password reset.
* Player profile.
* Wallet balance.
* Coin store.
* Purchase history.
* Recently played games.
* Basic game-launch page.
* Full-screen game launch.
* Mobile-compatible layout.
* Terms, privacy, and support pages.

## Coin store

Players can purchase:

* Player pack.
* Gamer pack.
* Pro pack.
* Elite pack.
* Legend pack.

Coin purchases must:

1. Create a payment order.
2. Complete through the payment provider.
3. Be confirmed by a server-side payment event.
4. Create a coin lot.
5. Update the wallet ledger.
6. Issue a receipt.
7. Appear in purchase history.

Coins must never be granted solely because the browser reports that payment succeeded.

## Wallet and ledger

Build the financial core first.

Required systems:

* Immutable transaction ledger.
* Coin lots.
* Wallet-balance projection.
* Payment records.
* Purchase receipts.
* Refund records.
* Administrative adjustments.
* Audit logs.
* Idempotent transaction handling.
* Transaction reconciliation.

The first version may use an append-only event table with PostgreSQL projections rather than a large distributed event-sourcing system.

## Initial games

Launch with a small set of games that are:

* Owned by the platform.
* Licensed directly.
* Open-source with appropriate rights.
* Manually integrated.
* Manually reviewed.

The initial goal is approximately three to ten playable games.

## Initial monetization

Phase 1 may include:

* Coin purchases.
* Platform-owned test products.
* Top banner advertisement.
* Side advertisements on wide screens.
* One pre-game advertising placement.
* No advertisements during active full-screen gameplay.

## Basic game purchases

At least one initial game should demonstrate:

* Extra-life purchase.
* Permanent unlock.
* Cosmetic purchase.
* Insufficient-balance flow.
* Purchase confirmation.
* Receipt creation.
* Entitlement restoration.

## Basic administration

Build a private administrator panel with:

* User lookup.
* Wallet lookup.
* Coin-lot lookup.
* Transaction lookup.
* Payment lookup.
* Refund initiation.
* Account suspension.
* Game enable and disable controls.
* Advertisement enable and disable controls.
* Audit log.

## Visual design

Keep Phase 1 visually clean but simple.

Use:

* Standard game cards.
* Basic navigation.
* Basic brand identity.
* Responsive layout.
* Fast-loading pages.

Do not delay Phase 1 for:

* A fully modeled television.
* Animated cartridges.
* Complex console animation.
* Elaborate room environments.
* Advanced recommendations.
* Social features.

## Phase 1 completion criteria

Phase 1 is complete when:

* Users can register.
* Users can purchase coins.
* Purchased coins appear correctly.
* Users can launch games.
* A game can request a purchase.
* Coins are deducted correctly.
* The entitlement is granted correctly.
* The transaction is fully traceable.
* Refund and reversal tests work.
* The ledger always balances.
* The site works on desktop and mobile.
* At least three games are publicly playable.

---

# Phase 2: Developer Integration System

## Goal

Allow selected outside developers to submit games, integrate platform purchases, and earn revenue.

## Developer accounts

Build:

* Developer registration.
* Developer organization profiles.
* Identity verification.
* Tax-information collection.
* Payment-account connection.
* Team members.
* Roles and permissions.
* Two-factor authentication.
* Developer agreement acceptance.

## Developer portal

Developers can:

* Create a game listing.
* Upload game artwork.
* Upload screenshots.
* Upload trailers.
* Add descriptions.
* Select genres.
* Add age ratings.
* Provide support information.
* Upload an HTML5 game build.
* Create products.
* Configure coin prices.
* Submit the game for review.
* View review status.
* Upload updates.
* View launches.
* View coin spending.
* View estimated revenue.
* View pending payouts.

## Game-upload system

Developers upload versioned game builds.

Recommended format:

* ZIP archive.
* `index.html` entry point.
* Game manifest.
* Required assets.
* SDK integration.
* Declared external network access.
* Privacy declaration.

Games should be hosted on an isolated game domain such as:

```text
play.howgamersgame.online/games/{game-id}/{version}/
```

## Game manifest

Require:

* Game ID.
* Title.
* Version.
* Entry point.
* Developer.
* Genre.
* Age rating.
* Screen orientation.
* Input support.
* Full-screen support.
* SDK version.
* External-network permissions.
* Privacy-policy URL.
* Support URL.

## Developer SDK

Build the first public SDK with:

* Session initialization.
* Player identity.
* Wallet balance.
* Product list.
* Purchase request.
* Purchase receipt.
* Entitlement lookup.
* Entitlement consumption.
* Entitlement restoration.
* Analytics events.
* Game-start and game-exit events.
* Error reporting.

Example developer flow:

```javascript
const hgg = await HowGamersGame.initialize({
    gameId: "example-game"
});

const purchase = await hgg.purchase({
    productId: "extra_life",
    quantity: 1,
    idempotencyKey: crypto.randomUUID()
});

if (purchase.success) {
    grantExtraLife();
}
```

Developers must request registered products by product ID. They cannot send arbitrary prices to the platform.

## Developer starter kit

Create:

* SDK documentation.
* Example game.
* Example products.
* Manifest template.
* Integration checklist.
* Testing checklist.
* Local SDK emulator.
* Test-wallet controls.
* Fake-purchase mode.
* Refund simulation.
* Entitlement-restoration example.

A future command-line tool may include:

```text
npx create-hgg-game
hgg dev
hgg validate
hgg build
hgg upload
```

## Review system

Build a formal game-review workflow:

* Draft.
* Submitted.
* Automated scan.
* Human review.
* Changes requested.
* Approved.
* Published.
* Suspended.
* Removed.

## Developer revenue tracking

Track:

* Eligible paid coins spent.
* Promotional coins spent.
* Paid value represented.
* Developer revenue share.
* Pending earnings.
* Available earnings.
* Held earnings.
* Reversed earnings.
* Paid earnings.

## Phase 2 completion criteria

Phase 2 is complete when:

* An external developer can create an account.
* The developer can upload a game.
* The game can pass review.
* The SDK can initialize correctly.
* A player can spend coins in the game.
* The purchase can be verified.
* The developer's revenue is calculated correctly.
* The developer can view basic analytics.
* The administrator can approve a payout.
* A game update can be reviewed and deployed safely.

---

# Phase 3: Core Marketplace Launch

## Goal

Open the platform to a wider group of developers and build the systems required to operate a real marketplace.

## Phase 3 completion criteria

Phase 3 is complete when:

* Developers can apply without direct invitation.
* Approved developers can publish through a controlled process.
* Automated payouts work.
* Regional pricing is supported.
* The catalog can support dozens of games.
* Discovery does not rely entirely on manual placement.
* Fraud and moderation queues are manageable.
* Financial reconciliation is reliable.

---

# Phase 4: Visual Game Room Experience

## Goal

Replace the basic game-grid experience on desktop with the full How Gamers Game visual identity.

## Virtual room design

Build the primary interface containing:

* Large television.
* Console below the television.
* Scrollable cartridge wheel.
* Game cartridges.
* Game title display.
* Gameplay trailers.
* Promotional television commercials.
* Wallet display.
* Search controls.
* Game information panel.
* Top advertising area.
* Side advertising areas.

## Cartridge behavior

Players can:

* Scroll through cartridges.
* Use keyboard arrows.
* Use a mouse wheel.
* Drag with a mouse.
* Swipe on touch devices where appropriate.
* Search directly.
* Filter by genre.
* Jump to recently played games.
* Open a standard grid at any time.

## Selection animation

When a game is selected:

1. Cartridge rises from the wheel.
2. Cartridge moves toward the console.
3. Cartridge enters the console.
4. Console powers on.
5. Television displays the game.
6. Game assets begin loading.
7. A pre-game ad may appear.
8. Play Game becomes available.
9. Player starts the game.
10. Game enters full-screen mode.

## Phase 4 completion criteria

Phase 4 is complete when:

* The game-room interface works smoothly on supported desktops.
* Quick Launch is available.
* Grid mode remains accessible.
* Animations can be shortened or disabled.
* The interface does not delay game launching excessively.
* Advertisements remain separated from controls.
* Full-screen gameplay remains clean.

---

# Phases 5–10 (Summary)

* **Phase 5:** Full advertising system, pre-game ads, developer TV promotions.
* **Phase 6:** Game Room Pass subscription (~$6.99/mo), ad-free, monthly coins.
* **Phase 7:** Social discovery — favorites, ratings, trending, post-game screen.
* **Phase 8:** Developer growth programs — performance revenue share tiers, creator fund.
* **Phase 9:** Platform features — achievements, cloud saves, game room parties, recommendations.
* **Phase 10:** Scaling and international expansion.

---

# Recommended Immediate Build Order

1. Finalize coin and payout rules.
2. Create the database.
3. Build authentication.
4. Build the payment flow.
5. Build coin lots.
6. Build the immutable ledger.
7. Build wallet display.
8. Build the coin store.
9. Add basic game listings.
10. Add game launching.
11. Build one test game purchase.
12. Build entitlements.
13. Build transaction administration.
14. Add three to ten initial games.
15. Add one pre-game advertisement.
16. Launch the functional Phase 1 site.
17. Begin developer SDK and portal work.
18. Invite developers.
19. Improve the marketplace.
20. Build the full visual game room.

---

# Overall Development Principle

```
Make money work
→ Make games work
→ Make developers work
→ Make the marketplace work
→ Make advertising work
→ Make it visually impressive
→ Add subscriptions and retention
→ Scale the ecosystem
```

The virtual console, television, and cartridge wheel are the defining public presentation, but they should be added after the platform has proven that players can purchase coins, games can consume coins safely, and developers can earn reliable revenue.
