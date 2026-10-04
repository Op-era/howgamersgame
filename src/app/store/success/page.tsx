'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import { Suspense } from 'react'

type Status = 'confirming' | 'confirmed' | 'delayed'

const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 30 // about a minute

function SuccessContent() {
  const params = useSearchParams()
  const sessionId = params.get('session_id')
  const [balance, setBalance] = useState<number | null>(null)
  // Without a session id (old links) we cannot verify anything, so show the neutral state.
  const [status, setStatus] = useState<Status>(sessionId ? 'confirming' : 'delayed')
  const [credited, setCredited] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout> | undefined

    async function loadBalance() {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (!data.user || cancelled) return
      const { data: p } = await supabase
        .from('profiles')
        .select('coin_balance')
        .eq('id', data.user.id)
        .single()
      if (p && !cancelled) setBalance(p.coin_balance)
    }

    async function poll() {
      polls += 1
      try {
        const res = await fetch(`/api/coins/purchases?session_id=${encodeURIComponent(sessionId!)}`, { cache: 'no-store' })
        if (res.ok) {
          const { purchases } = await res.json() as { purchases: Array<{ coins: number }> }
          if (purchases.length > 0 && !cancelled) {
            setCredited(purchases[0].coins)
            setStatus('confirmed')
            await loadBalance()
            return
          }
        }
      } catch {
        // network blip: keep polling
      }
      if (cancelled) return
      if (polls >= MAX_POLLS) {
        setStatus('delayed')
        await loadBalance()
        return
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    if (sessionId) poll()
    else loadBalance()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [sessionId])

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
        {status === 'confirmed' ? 'COINS LOADED!' : status === 'confirming' ? 'CONFIRMING PAYMENT…' : 'PAYMENT RECEIVED'}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }} role="status">
        {status === 'confirmed' && `${(credited ?? 0).toLocaleString()} coins have been added to your wallet.`}
        {status === 'confirming' && 'Hang tight, we are waiting for the payment to be confirmed.'}
        {status === 'delayed' && 'Your coins can take a few minutes to show up. Check your wallet shortly or contact support if they do not appear.'}
      </p>
      {balance !== null && status !== 'confirming' && (
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
