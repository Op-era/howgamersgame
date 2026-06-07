import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
})

export const COIN_PACKAGES = [
  { id: 'starter',  name: 'Starter', priceCents: 100,   coins: 100,   bonusCoins: 0,    label: '100 Coins' },
  { id: 'player',   name: 'Player',  priceCents: 500,   coins: 550,   bonusCoins: 50,   label: '550 Coins (+50 bonus)' },
  { id: 'gamer',    name: 'Gamer',   priceCents: 1000,  coins: 1200,  bonusCoins: 200,  label: '1,200 Coins (+200 bonus)' },
  { id: 'pro',      name: 'Pro',     priceCents: 2000,  coins: 2200,  bonusCoins: 200,  label: '2,200 Coins (+200 bonus)' },
  { id: 'elite',    name: 'Elite',   priceCents: 4000,  coins: 5000,  bonusCoins: 1000, label: '5,000 Coins (+1,000 bonus)' },
  { id: 'legend',   name: 'Legend',  priceCents: 10000, coins: 14000, bonusCoins: 4000, label: '14,000 Coins (+4,000 bonus)' },
] as const

export type CoinPackageId = typeof COIN_PACKAGES[number]['id']

export function getPackageById(id: string) {
  return COIN_PACKAGES.find(p => p.id === id)
}
