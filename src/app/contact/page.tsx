'use client'

import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import { useState } from 'react'

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    // Simple mailto fallback — replace with API route when backend email is wired
    const mailto = `mailto:witprod@gmail.com?subject=${encodeURIComponent(`[HowGamersGame] ${form.subject}`)}&body=${encodeURIComponent(`From: ${form.name} <${form.email}>\n\n${form.message}`)}`
    window.location.href = mailto
    setTimeout(() => {
      setSending(false)
      setSubmitted(true)
    }, 800)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1, maxWidth: 640, margin: '0 auto', padding: '48px 24px', width: '100%' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 8 }}>
            // CONTACT
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: '0.08em', color: 'var(--accent-green)', margin: '0 0 8px' }}>
            GET IN TOUCH
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7 }}>
            Questions, partnership inquiries, bug reports, or general feedback — we read everything.
          </p>
        </div>

        {submitted ? (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--accent-green)',
            borderRadius: 8,
            padding: 32,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
            <h2 style={{ color: 'var(--accent-green)', fontSize: 16, letterSpacing: '0.1em', margin: '0 0 12px' }}>
              MESSAGE SENT
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
              Thanks for reaching out. We typically respond within 1-2 business days.
            </p>
            <button
              onClick={() => { setSubmitted(false); setForm({ name: '', email: '', subject: '', message: '' }) }}
              style={{
                background: 'transparent',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
                padding: '10px 24px',
                fontSize: 12,
                letterSpacing: '0.1em',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              SEND ANOTHER
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
                  NAME *
                </label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid #1a1a3e',
                    borderRadius: 4,
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
                  EMAIL *
                </label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-secondary)',
                    border: '1px solid #1a1a3e',
                    borderRadius: 4,
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
                SUBJECT *
              </label>
              <select
                required
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid #1a1a3e',
                  borderRadius: 4,
                  padding: '10px 12px',
                  color: form.subject ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">Select a subject...</option>
                <option value="General Question">General Question</option>
                <option value="Bug Report">Bug Report</option>
                <option value="Developer Application">Developer Application</option>
                <option value="Partnership Inquiry">Partnership Inquiry</option>
                <option value="Billing / Account">Billing / Account</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
                MESSAGE *
              </label>
              <textarea
                required
                rows={7}
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Tell us what's on your mind..."
                style={{
                  width: '100%',
                  background: 'var(--bg-secondary)',
                  border: '1px solid #1a1a3e',
                  borderRadius: 4,
                  padding: '10px 12px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              style={{
                width: '100%',
                background: sending ? 'var(--text-muted)' : 'var(--accent-green)',
                color: '#000',
                fontWeight: 'bold',
                fontSize: 13,
                letterSpacing: '0.15em',
                padding: '14px',
                border: 'none',
                borderRadius: 4,
                cursor: sending ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s',
              }}
            >
              {sending ? 'SENDING...' : 'SEND MESSAGE'}
            </button>
          </form>
        )}

        <div style={{
          marginTop: 40,
          padding: 20,
          background: 'var(--bg-secondary)',
          border: '1px solid #1a1a3e',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 12 }}>
            // QUICK LINKS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/developer', label: 'Developer Program', desc: 'Submit your game for the platform' },
              { href: '/subscribe', label: 'Gamer Passes', desc: 'Early access, bonus coins, ad-free play' },
              { href: '/privacy', label: 'Privacy Policy', desc: 'How we handle your data' },
              { href: '/terms', label: 'Terms of Service', desc: 'Rules and responsibilities' },
            ].map(({ href, label, desc }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-green)', fontSize: 13 }}>{label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{desc}</span>
              </Link>
            ))}
          </div>
        </div>

      </main>

      <footer style={{
        borderTop: '1px solid #1a1a3e',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
        letterSpacing: '0.05em',
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/about" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>ABOUT</Link>
          <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>PRIVACY POLICY</Link>
          <Link href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>TERMS OF SERVICE</Link>
        </div>
        &copy; {new Date().getFullYear()} Haven Command LLC. All rights reserved.
      </footer>
    </div>
  )
}
