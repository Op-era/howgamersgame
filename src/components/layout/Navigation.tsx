'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'

type SessionUser = { id: string; email: string; coin_balance: number } | null

export default function Navigation() {
  const [user, setUser] = useState<SessionUser>(null)
  const [coins, setCoins] = useState<number>(0)

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUser(d.user)
          setCoins(d.user.coin_balance ?? 0)
        } else {
          setUser(null)
          setCoins(0)
        }
      })
      .catch(() => {
        setUser(null)
        setCoins(0)
      })
  }, [])

  async function signOut() {
    await fetch('/api/auth/login', { method: 'DELETE' }).catch(() => {})
    setUser(null)
    setCoins(0)
    window.location.href = '/'
  }

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      background: 'var(--console-dark)',
      borderBottom: '1px solid #1a1a3e',
      position: 'relative',
      zIndex: 100,
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: '0.15em' }}>
          <span className="neon-green">HOW</span>
          <span style={{ color: '#fff' }}>GAMERS</span>
          <span className="neon-gold">GAME</span>
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/about" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', letterSpacing: '0.05em' }}>
          ABOUT
        </Link>
        {user ? (
          <>
            <Link href="/store" style={{ textDecoration: 'none' }}>
              <span style={{
                background: '#1a1a2e',
                border: '1px solid var(--accent-gold)',
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span className="neon-gold">⬡</span>
                <span className="coin-shimmer" style={{ fontWeight: 'bold' }}>
                  {coins.toLocaleString()}
                </span>
              </span>
            </Link>
            <Link href="/developer" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
              DEV
            </Link>
            <Link href="/profile" style={{ color: 'var(--accent-green)', fontSize: 13, textDecoration: 'none' }}>
              PROFILE
            </Link>
            <button
              onClick={signOut}
              style={{
                background: 'transparent',
                border: '1px solid #333',
                color: 'var(--text-muted)',
                fontSize: 12,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              SIGN OUT
            </button>
          </>
        ) : (
          <>
            <Link href="/subscribe" style={{ color: 'var(--accent-green)', fontSize: 13, textDecoration: 'none', letterSpacing: '0.05em' }}>
              PASSES
            </Link>
            <Link href="/store" style={{ color: 'var(--accent-gold)', fontSize: 13, textDecoration: 'none' }}>
              GET COINS
            </Link>
            <Link
              href="/auth/login"
              style={{
                background: 'var(--accent-green)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 4,
                textDecoration: 'none',
                letterSpacing: '0.05em',
              }}
            >
              SIGN IN
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
