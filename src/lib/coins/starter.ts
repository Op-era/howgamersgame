// One-time starter grant of free promo coins for new accounts.
// Promo coins raise both promo_balance and coin_balance; no coin lot is
// created, so developer earnings are untouched.

/** Price of one power up in coins, currently hard coded as 50 in public/games/snake/index.html (also the extra life price); keep in sync. */
export const POWER_UP_PRICE_COINS = 50
export const STARTER_POWER_UPS = 3
export const STARTER_GRANT_COINS = STARTER_POWER_UPS * POWER_UP_PRICE_COINS

export async function grantStarterCoins(
  query: (sql: string, params: unknown[]) => Promise<unknown>,
  userId: string
): Promise<void> {
  try {
    await query('SELECT grant_starter_coins($1, $2)', [userId, STARTER_GRANT_COINS])
  } catch (err) {
    // Signup must never fail because of the grant.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[starter-grant] failed', message)
  }
}
