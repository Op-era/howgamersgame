'use client'

import { useState, useEffect } from 'react'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import { COIN_PACKAGES } from '@/lib/coins/packs'
import { COIN_TERMS_SUMMARY, COIN_TERMS_VERSION } from '@/lib/coins/terms'
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

interface SessionUser {
  id: string
  email: string
  coin_balance: number
}

export default function StorePage() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [coinBalance, setCoinBalance] = useState(0)
  const [loading, setLoading] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Array<{ id: string; type: string; amount: number; description: string | null; created_at: string }>>([])
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [purchases, setPurchases] = useState<PurchaseHistoryItem[]>([])
  const [email, setEmail] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setUser(d.user)
          setCoinBalance(d.user.coin_balance ?? 0)
          loadLists()
        }
      })
      .catch(() => {})
  }, [])

  async function loadLists() {
    const [txRes, purchasesRes] = await Promise.all([
      fetch('/api/coins/transactions', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { transactions: [] }))
        .catch(() => ({ transactions: [] })),
      fetch('/api/coins/purchases', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { purchases: [] }))
        .catch(() => ({ purchases: [] })),
    ])
    setTransactions(txRes.transactions ?? [])
    setPurchases((purchasesRes.purchases ?? []) as PurchaseHistoryItem[])
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) throw new Error(d.error ?? 'Sign in failed')
      const me = await fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json())
      if (me.user) {
        setUser(me.user)
        setCoinBalance(me.user.coin_balance ?? 0)
        loadLists()
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoginBusy(false)
    }
  }

  async function handlePurchase(pkg: typeof PACKAGES[number]) {
    if (!user) return
    if (!acceptedTerms) return

    setLoading(pkg.id)
    try {
      const res = await fetch('/api/coins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, acceptedTerms: true, termsVersion: COIN_TERMS_VERSION }),
      })
      const { checkoutUrl, error } = await res.json()
      if (error || !checkoutUrl) throw new Error(error ?? 'No checkout URL returned')
      window.location.href = checkoutUrl
    } catch (err) {
      console.error(err)
      const message = err instanceof Error && /terms/i.test(err.message)
        ? err.message
        : 'Payment error. You have not been charged. Please try again.'
      alert(message)
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

          {user ? (
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
          ) : (
            <form onSubmit={handleLogin} style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  border: '1px solid #1a1a3e',
                  background: 'var(--console-dark)',
                  color: '#fff',
                  fontSize: 14,
                  minWidth: 240,
                }}
              />
              <button
                type="submit"
                disabled={loginBusy}
                style={{
                  padding: '10px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--accent-green)',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  cursor: loginBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {loginBusy ? 'SIGNING IN...' : 'SIGN IN TO BUY'}
              </button>
              {loginError && <div style={{ width: '100%', color: '#ff4444', fontSize: 12 }}>{loginError}</div>}
            </form>
          )}
        </div>

        {/* Required acceptance of the coin purchase terms before any checkout */}
        <label
          htmlFor="accept-coin-terms"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            maxWidth: 640,
            margin: '0 auto 24px',
            padding: '14px 18px',
            background: 'var(--console-dark)',
            border: `1px solid ${acceptedTerms ? 'var(--accent-green)' : 'var(--accent-gold)'}`,
            borderRadius: 8,
            fontSize: 13,
            lineHeight: 1.6,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          <input
            id="accept-coin-terms"
            type="checkbox"
            checked={acceptedTerms}
            onChange={e => setAcceptedTerms(e.target.checked)}
            style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
          />
          <span>
            I have read and agree to the{' '}
            <Link href="/terms#coins" target="_blank" style={{ color: 'var(--accent-green)' }}>
              coin purchase terms
            </Link>
            . {COIN_TERMS_SUMMARY}
          </span>
        </label>

        {/* Coin packages */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginBottom: 48,
        }}>
          {PACKAGES.map((pkg) => {
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
                  disabled={!!loading || !acceptedTerms || !user}
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
                    cursor: loading || !acceptedTerms || !user ? 'not-allowed' : 'pointer',
                    opacity: acceptedTerms && user ? 1 : 0.5,
                    fontFamily: 'inherit',
                    transition: 'opacity 0.2s',
                  }}
                >
                  {loading === pkg.id ? 'REDIRECTING...' : !user ? 'SIGN IN TO BUY' : acceptedTerms ? `BUY ${pkg.coins.toLocaleString()} COINS` : 'ACCEPT TERMS TO BUY'}
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
          {COIN_TERMS_SUMMARY} Each game determines what coins can be used for.
        </div>
      </div>
    </div>
  )
}
