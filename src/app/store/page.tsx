'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import type { User } from '@supabase/supabase-js'
import { COIN_PACKAGES } from '@/lib/coins/packs'
import type { PurchaseHistoryItem } from '@/lib/coins/history'

// Derived from the shared server pack table so the store can never drift from what is charged.
const PACKAGES = COIN_PACKAGES.map(p => {
  const pct = Math.round((p.bonusCoins / (p.coins - p.bonusCoins)) * 100)
  const note = p.id === 'elite' ? ' — Best value' : p.id === 'legend' ? ' — Max savings' : ''
  return {
    id: p.id,
    name: p.name,
    price: `$${p.priceCents / 100}`,
    priceCents: p.priceCents,
    coins: p.coins,
    bonus: p.bonusCoins,
    description: `+${pct}% bonus${note}`,
  }
})

export default function StorePage() {
  const [user, setUser] = useState<User | null>(null)
  const [coinBalance, setCoinBalance] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Array<{ id: string; type: string; amount: number; description: string | null; created_at: string }>>([])
  const [purchases, setPurchases] = useState<PurchaseHistoryItem[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) loadProfile(data.user.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(userId: string) {
    const [profileRes, txRes, purchasesRes] = await Promise.all([
      supabase.from('profiles').select('coin_balance').eq('id', userId).single(),
      supabase.from('coin_transactions').select('id, type, amount, description, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      fetch('/api/coins/purchases', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { purchases: [] }))
        .catch(() => ({ purchases: [] })),
    ])
    setPurchases((purchasesRes.purchases ?? []) as PurchaseHistoryItem[])
    if (profileRes.data) setCoinBalance(profileRes.data.coin_balance)
    if (txRes.data) setTransactions(txRes.data)
  }

  async function handlePurchase(pkg: typeof PACKAGES[number]) {
    if (!user) {
      window.location.href = '/auth/login'
      return
    }

    setLoading(pkg.id)
    try {
      const res = await fetch('/api/coins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const { checkoutUrl, error } = await res.json()
      if (error || !checkoutUrl) throw new Error(error ?? 'No checkout URL returned')
      window.location.href = checkoutUrl
    } catch (err) {
      console.error(err)
      alert('Payment error. You have not been charged. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navigation />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 32, letterSpacing: '0.15em' }}>
            <span className="coin-shimmer">COIN STORE</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Buy coins to spend on upgrades, unlocks, and more inside any game.
          </p>

          {user && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--console-dark)',
              border: '1px solid var(--accent-gold)',
              borderRadius: 8,
              padding: '8px 20px',
              marginTop: 16,
            }}>
              <span style={{ fontSize: 20 }}>⬡</span>
              <span className="neon-gold" style={{ fontSize: 22, fontWeight: 'bold' }}>
                {coinBalance.toLocaleString()}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>YOUR BALANCE</span>
            </div>
          )}
        </div>

        {/* Coin packages */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 48,
        }}>
          {PACKAGES.map((pkg, i) => {
            const isPopular = pkg.id === 'elite'
            return (
              <div
                key={pkg.id}
                style={{
                  background: 'var(--console-body)',
                  border: isPopular ? '2px solid var(--accent-gold)' : '1px solid #1a1a3e',
                  borderRadius: 12,
                  padding: 24,
                  position: 'relative',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(-2px)'
                  el.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.transform = 'translateY(0)'
                  el.style.boxShadow = 'none'
                }}
              >
                {isPopular && (
                  <div style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--accent-gold)',
                    color: '#000',
                    fontSize: 9,
                    fontWeight: 'bold',
                    letterSpacing: '0.15em',
                    padding: '2px 12px',
                    borderRadius: 10,
                  }}>
                    BEST VALUE
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 4 }}>
                      {pkg.name.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 'bold', color: '#fff' }}>
                      {pkg.price}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 'bold' }} className="neon-gold">
                      {pkg.coins.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--accent-gold)' }}>COINS</div>
                  </div>
                </div>

                {pkg.bonus > 0 && (
                  <div style={{
                    background: 'rgba(0,255,136,0.1)',
                    border: '1px solid rgba(0,255,136,0.2)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 12,
                    marginBottom: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span className="neon-green">+ {pkg.bonus.toLocaleString()} BONUS</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{pkg.description}</span>
                  </div>
                )}
                {!pkg.bonus && (
                  <div style={{ height: 12, marginBottom: 12 }} />
                )}

                <button
                  onClick={() => handlePurchase(pkg)}
                  disabled={!!loading}
                  style={{
                    width: '100%',
                    background: loading === pkg.id
                      ? '#333'
                      : isPopular
                        ? 'var(--accent-gold)'
                        : 'var(--accent-green)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 6,
                    padding: '12px',
                    fontSize: 12,
                    fontWeight: 'bold',
                    letterSpacing: '0.1em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'opacity 0.2s',
                  }}
                >
                  {loading === pkg.id ? 'REDIRECTING...' : `BUY ${pkg.coins.toLocaleString()} COINS`}
                </button>
              </div>
            )
          })}
        </div>

        {/* Purchase history (coin purchases only; confirmed by Stripe) */}
        {user && purchases.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 16 }}>
              PURCHASE HISTORY
            </h2>
            <div style={{
              background: 'var(--console-body)',
              border: '1px solid #1a1a3e',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {purchases.map((p, i) => (
                <div key={p.sessionId} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: i < purchases.length - 1 ? '1px solid #1a1a3e' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>
                      {p.packageName} pack · ${(p.grossCents / 100).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--accent-green)' }}>
                    +{p.coins.toLocaleString()} ⬡
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction history */}
        {user && transactions.length > 0 && (
          <div>
            <h2 style={{ fontSize: 16, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 16 }}>
              RECENT TRANSACTIONS
            </h2>
            <div style={{
              background: 'var(--console-body)',
              border: '1px solid #1a1a3e',
              borderRadius: 8,
              overflow: 'hidden',
            }}>
              {transactions.map((tx, i) => (
                <div key={tx.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: i < transactions.length - 1 ? '1px solid #1a1a3e' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#fff', marginBottom: 2 }}>
                      {tx.description ?? tx.type}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {new Date(tx.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 'bold',
                    color: tx.amount > 0 ? 'var(--accent-green)' : '#ff4444',
                  }}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} ⬡
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info footer */}
        <div style={{
          marginTop: 48,
          padding: 20,
          background: 'var(--console-dark)',
          border: '1px solid #1a1a3e',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.8,
        }}>
          <strong style={{ color: '#fff' }}>About Coins:</strong> 1 coin = $0.01 base value.
          Coins are used inside games for upgrades, cosmetics, unlocks, and other in-game purchases.
          Coins are non-refundable and have no cash value. Each game determines what coins can be used for.
        </div>
      </div>
    </div>
  )
}
