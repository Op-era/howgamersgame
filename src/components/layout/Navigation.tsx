'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export default function Navigation() {
  const [user, setUser] = useState<User | null>(null)
  const [coins, setCoins] = useState<number>(0)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) fetchCoins(data.user.id)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchCoins(session.user.id)
      else setCoins(0)
    })
    return () => listener.subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchCoins(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('coin_balance')
      .eq('id', userId)
      .single()
    if (data) setCoins(data.coin_balance)
  }

  async function signOut() {
    await supabase.auth.signOut()
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
