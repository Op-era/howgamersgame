'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [callsign, setCallsign] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      setError('Please enter a valid email address.')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName: callsign || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Signup failed. Please try again.')
      } else {
        router.push('/console')
        router.refresh()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 20px',
    }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: 800, marginBottom: 32 }}>
        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 48px)',
          fontWeight: 'bold',
          letterSpacing: '0.1em',
          margin: '0 0 16px',
        }}>
          <span className="neon-green">HOW</span>
          <span style={{ color: '#fff' }}>GAMERS</span>
          <span className="neon-gold">GAME</span>
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          margin: 0,
        }}>
          A retro arcade where gamers play and game devs get discovered.
          Pick a cartridge, plug it in, and play.
        </p>
      </div>

      {/* Console hero image */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 700,
        marginBottom: 40,
      }}>
        <Image
          src="/images/console/hero-console.webp"
          alt="Retro game console with TV"
          width={1200}
          height={800}
          style={{ width: '100%', height: 'auto', borderRadius: 12 }}
          priority
        />
      </div>

      {/* Signup form */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'var(--bg-secondary)',
        border: '1px solid #1a1a3e',
        borderRadius: 12,
        padding: 32,
      }}>
        <h2 style={{
          fontSize: 18,
          letterSpacing: '0.15em',
          margin: '0 0 8px',
          textAlign: 'center',
          color: 'var(--accent-green)',
        }}>
          INSERT COIN TO START
        </h2>
        <p style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          textAlign: 'center',
          margin: '0 0 24px',
        }}>
          Sign up free to enter the console room
        </p>

        <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                background: '#0a0a1e',
                border: '1px solid #2a2a4a',
                borderRadius: 6,
                color: '#fff',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              CALLSIGN (OPTIONAL)
            </label>
            <input
              type="text"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="Your gamer tag"
              maxLength={30}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                background: '#0a0a1e',
                border: '1px solid #2a2a4a',
                borderRadius: 6,
                color: '#fff',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#ff5555', fontSize: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px',
              fontSize: 14,
              fontWeight: 'bold',
              letterSpacing: '0.15em',
              background: loading ? '#333' : 'var(--accent-green)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'POWERING ON...' : '▶ START PLAYING'}
          </button>
        </form>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <Link href="/developers/signup" style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}>
            Are you a game developer? List your game →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        © 2026 Haven Command LLC
      </div>
    </div>
  )
}
