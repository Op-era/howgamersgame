'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'

type Mode = 'signin' | 'signup' | 'reset'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/')
        router.refresh()
      }

    } else if (mode === 'signup') {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Signup failed')
      } else {
        setNotice('Account created! Check your email to confirm, then sign in.')
        setMode('signin')
        setPassword('')
      }

    } else if (mode === 'reset') {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Reset failed')
      } else {
        setNotice('Password reset link sent — check your email.')
      }
    }

    setLoading(false)
  }

  const tabStyle = (active: boolean) => ({
    flex: 1,
    padding: '10px 0',
    background: active ? 'var(--accent-green)' : 'transparent',
    color: active ? '#000' : 'var(--text-muted)',
    border: 'none',
    borderBottom: active ? 'none' : '1px solid #1a1a3e',
    fontSize: 11,
    fontWeight: 'bold' as const,
    letterSpacing: '0.15em',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  })

  const inputStyle = {
    width: '100%',
    background: 'var(--console-dark)',
    border: '1px solid #2a2a5e',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
    display: 'block' as const,
    marginBottom: 6,
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
          overflow: 'hidden',
        }}>

          {/* Tabs */}
          {mode !== 'reset' && (
            <div style={{ display: 'flex', borderBottom: '1px solid #1a1a3e' }}>
              <button style={tabStyle(mode === 'signin')} onClick={() => { setMode('signin'); setError(''); setNotice('') }}>
                SIGN IN
              </button>
              <button style={tabStyle(mode === 'signup')} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>
                CREATE ACCOUNT
              </button>
            </div>
          )}

          <div style={{ padding: 32 }}>
            {mode === 'reset' && (
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => { setMode('signin'); setError(''); setNotice('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-green)', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'inherit' }}
                >
                  ← BACK TO SIGN IN
                </button>
                <h2 style={{ margin: '12px 0 4px', fontSize: 18, color: '#fff', letterSpacing: '0.1em' }}>RESET PASSWORD</h2>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>We&apos;ll email you a reset link.</p>
              </div>
            )}

            {notice && (
              <div style={{
                background: 'rgba(0,255,136,0.1)',
                border: '1px solid var(--accent-green)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                fontSize: 12,
                color: 'var(--accent-green)',
                letterSpacing: '0.05em',
              }}>
                {notice}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {mode === 'signup' && (
                <div>
                  <label style={labelStyle}>USERNAME</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Player1"
                    style={inputStyle}
                  />
                </div>
              )}

              <div>
                <label style={labelStyle}>EMAIL ADDRESS</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>

              {mode !== 'reset' && (
                <div>
                  <label style={labelStyle}>PASSWORD</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="••••••••"
                    style={inputStyle}
                  />
                </div>
              )}

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
                {loading ? '...' : mode === 'signin' ? 'SIGN IN' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SEND RESET LINK'}
              </button>

              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('reset'); setError(''); setNotice('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: 'inherit', letterSpacing: '0.1em' }}
                >
                  FORGOT PASSWORD?
                </button>
              )}

            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
