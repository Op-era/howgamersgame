import { getPackageById } from './packs.ts'

export interface RevenueRow {
  created_at: string
  package_id: string
  gross_cents: number
  currency: string
  coins_credited: number
  bonus_coins: number
  stripe_checkout_session_id: string
}

export interface PurchaseHistoryItem {
  sessionId: string
  packageId: string
  packageName: string
  grossCents: number
  currency: string
  coins: number
  bonusCoins: number
  createdAt: string
}

/** Only fields safe to show the purchasing user. No event ids, no payment intent ids. */
export function toPurchaseHistoryItem(row: RevenueRow): PurchaseHistoryItem {
  return {
    sessionId: row.stripe_checkout_session_id,
    packageId: row.package_id,
    packageName: getPackageById(row.package_id)?.name ?? row.package_id,
    grossCents: row.gross_cents,
    currency: row.currency,
    coins: row.coins_credited,
    bonusCoins: row.bonus_coins,
    createdAt: row.created_at,
  }
}

export function isPlausibleSessionId(value: string | null): value is string {
  return !!value && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(value)
}
