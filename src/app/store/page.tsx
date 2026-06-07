'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import type { User } from '@supabase/supabase-js'

const PACKAGES = [
  { id: 'starter', name: 'Starter',  price: '$1',   priceCents: 100,   coins: 100,   bonus: 0,    description: 'Try it out' },
  { id: 'player',  name: 'Player',   price: '$5',   priceCents: 500,   coins: 550,   bonus: 50,   description: '10% bonus' },
  { id: 'gamer',   name: 'Gamer',    price: '$10',  priceCents: 1000,  coins: 1200,  bonus: 200,  description: '20% bonus' },
  { id: 'pro',     name: 'Pro',      price: '$20',  priceCents: 2000,  coins: 2200,  bonus: 200,  description: 'Save $2' },
  { id: 'elite',   name: 'Elite',    price: '$40',  priceCents: 4000,  coins: 5000,  bonus: 1000, description: '25% bonus — Best value' },
  { id: 'legend',  name: 'Legend',   price: '$100', priceCents: 10000, coins: 14000, bonus: 4000, description: '40% bonus — Max savings' },
]

export default function StorePage() {
  const [user, setUser] = useState<User | null>(null)
  const [coinBalance, setCoinBalance] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Array<{ id: string; type: string; amount: number; description: string | null; created_at: string }>>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) loadProfile(data.user.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile(userId: string) {
    const [profileRes, txRes] = await Promise.all([
      supabase.from('profiles').select('coin_balance').eq('id', userId).single(),
      supabase.from('coin_transactions').select('id, type, amount, description, created_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    ])
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
      if (error) throw new Error(error)
      window.location.href = checkoutUrl
    } catch (err) {
      console.error(err)
      alert('Payment error. Please try again.')
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
