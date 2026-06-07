'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navigation />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 41px)',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--console-body)',
          border: '1px solid #1a1a3e',
          borderRadius: 12,
          padding: 32,
        }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, color: '#fff', letterSpacing: '0.1em' }}>
            <span className="neon-green">SIGN IN</span>
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-muted)' }}>
            We&apos;ll send a magic link to your email.
          </p>

          {sent ? (
            <div style={{
              background: 'rgba(0,255,136,0.1)',
              border: '1px solid var(--accent-green)',
              borderRadius: 8,
              padding: 20,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📬</div>
              <div className="neon-green" style={{ fontSize: 14, letterSpacing: '0.1em' }}>
                CHECK YOUR EMAIL
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }}>
                Link sent to {email}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: '100%',
                    background: 'var(--console-dark)',
                    border: '1px solid #2a2a5e',
                    borderRadius: 6,
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </div>
              {error && (
                <p style={{ color: '#ff4444', fontSize: 12, margin: 0 }}>{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: loading ? '#333' : 'var(--accent-green)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '12px 24px',
                  fontSize: 13,
                  fontWeight: 'bold',
                  letterSpacing: '0.15em',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? 'SENDING...' : 'SEND MAGIC LINK'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
