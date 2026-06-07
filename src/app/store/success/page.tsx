'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function SuccessContent() {
  const params = useSearchParams()
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase
          .from('profiles')
          .select('coin_balance')
          .eq('id', data.user.id)
          .single()
          .then(({ data: p }) => { if (p) setBalance(p.coin_balance) })
      }
    })
  }, [])

  const pkg = params.get('pkg') ?? ''

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 41px)',
      textAlign: 'center',
      padding: 24,
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🎮</div>
      <h1 className="neon-green" style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '0.15em' }}>
        COINS LOADED!
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Your coins have been added to your wallet.
      </p>
      {balance !== null && (
        <div style={{
          background: 'var(--console-body)',
          border: '1px solid var(--accent-gold)',
          borderRadius: 8,
          padding: '16px 32px',
          marginBottom: 32,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 4 }}>
            NEW BALANCE
          </div>
          <div className="coin-shimmer" style={{ fontSize: 32, fontWeight: 'bold' }}>
            {balance.toLocaleString()} ⬡
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/" style={{
          background: 'var(--accent-green)',
          color: '#000',
          fontWeight: 'bold',
          fontSize: 12,
          padding: '12px 24px',
          borderRadius: 6,
          textDecoration: 'none',
          letterSpacing: '0.1em',
        }}>
          PLAY NOW →
        </Link>
        <Link href="/store" style={{
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 12,
          padding: '12px 24px',
          borderRadius: 6,
          textDecoration: 'none',
          border: '1px solid #333',
        }}>
          BACK TO STORE
        </Link>
      </div>
    </div>
  )
}

export default function StoreSucessPage() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Navigation />
      <Suspense>
        <SuccessContent />
      </Suspense>
    </div>
  )
}
