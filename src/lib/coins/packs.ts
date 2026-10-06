// Single source of truth for coin packs. Pure module (no framework imports) so it
// can be shared by the store UI, the checkout route, the webhook, and the tests.
// Prices and coin counts come from ROADMAP.md. The bonus is part of `coins`.

export const COIN_PACKAGES = [
  { id: 'player', name: 'Player', priceCents: 500,   coins: 550,   bonusCoins: 50,   label: '550 Coins (+10% bonus)' },
  { id: 'gamer',  name: 'Gamer',  priceCents: 1000,  coins: 1200,  bonusCoins: 200,  label: '1,200 Coins (+20% bonus)' },
  { id: 'pro',    name: 'Pro',    priceCents: 2000,  coins: 2500,  bonusCoins: 500,  label: '2,500 Coins (+25% bonus)' },
  { id: 'elite',  name: 'Elite',  priceCents: 4000,  coins: 5200,  bonusCoins: 1200, label: '5,200 Coins (+30% bonus)' },
  { id: 'legend', name: 'Legend', priceCents: 10000, coins: 14000, bonusCoins: 4000, label: '14,000 Coins (+40% bonus)' },
] as const

export type CoinPackage = (typeof COIN_PACKAGES)[number]
export type CoinPackageId = CoinPackage['id']

export const COIN_CURRENCY = 'usd'

export function getPackageById(id: unknown): CoinPackage | undefined {
  if (typeof id !== 'string') return undefined
  return COIN_PACKAGES.find(p => p.id === id)
}
