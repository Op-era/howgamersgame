'use client'

import { useState } from 'react'

export default function PromoteButton({ gameId }: { gameId: string }) {
  const [loading, setLoading] = useState(false)

  async function promote() {
    if (!confirm('Promote this game to live?')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'live' }),
      })
      if (!res.ok) throw new Error('Promote failed')
      window.location.reload()
    } catch (err) {
      console.error(err)
      alert('Could not promote the game. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={promote}
      disabled={loading}
      style={{
        fontSize: 11, color: '#0a0a0a', background: 'var(--accent-gold)',
        border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer',
        fontWeight: 'bold', opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'PROMOTING' : 'PROMOTE'}
    </button>
  )
}
