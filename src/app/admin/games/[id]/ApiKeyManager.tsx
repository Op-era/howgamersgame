'use client'

import { useState } from 'react'

interface ApiKey {
  id: string
  key_prefix: string
  name: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

interface ApiKeyManagerProps {
  gameId: string
  apiKeys: ApiKey[]
}

export default function ApiKeyManager({ gameId, apiKeys: initial }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState(initial)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)

  async function createKey() {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/admin/games/${gameId}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setNewKeyValue(json.key)
      setKeys(prev => [...prev, json.record])
      setNewKeyName('')
    } catch (err) {
      alert(String(err))
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? Games using it will stop working immediately.')) return
    await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
    setKeys(prev => prev.filter(k => k.id !== id))
  }

  return (
    <div>
      <h2 style={{ fontSize: 16, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 20 }}>
        GAME API KEYS
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
        These keys allow this game to call the coin API (check balance, spend, award).
        Store keys securely — they are shown only once at creation.
      </p>

      {/* Shown once after creation */}
      {newKeyValue && (
        <div style={{
          background: 'rgba(0,255,136,0.08)', border: '1px solid var(--accent-green)',
          borderRadius: 8, padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: 'var(--accent-green)', marginBottom: 8, letterSpacing: '0.15em' }}>
            NEW API KEY — COPY NOW, NOT SHOWN AGAIN
          </div>
          <code style={{
            display: 'block', background: '#000', padding: '10px 14px',
            borderRadius: 4, fontSize: 13, color: '#fff', wordBreak: 'break-all',
          }}>
            {newKeyValue}
          </code>
          <button onClick={() => { navigator.clipboard.writeText(newKeyValue); alert('Copied!') }}
            style={{
              marginTop: 10, background: 'var(--accent-green)', color: '#000',
              border: 'none', borderRadius: 4, padding: '6px 16px',
              fontSize: 11, fontWeight: 'bold', cursor: 'pointer', fontFamily: 'inherit',
            }}>
            COPY TO CLIPBOARD
          </button>
          <button onClick={() => setNewKeyValue(null)} style={{
            marginTop: 10, marginLeft: 8, background: 'transparent',
            color: 'var(--text-muted)', border: 'none', fontSize: 11, cursor: 'pointer',
          }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Create new key */}
      <div style={{
        background: 'var(--console-body)', border: '1px solid #1a1a3e',
        borderRadius: 8, padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. Production)"
            style={{
              flex: 1, background: 'var(--console-dark)', border: '1px solid #2a2a5e',
              borderRadius: 6, padding: '8px 12px', color: '#fff', fontSize: 13,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={createKey} disabled={creating || !newKeyName.trim()} style={{
            background: 'var(--accent-green)', color: '#000', border: 'none',
            borderRadius: 6, padding: '8px 20px', fontSize: 12, fontWeight: 'bold',
            cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', letterSpacing: '0.1em',
          }}>
            {creating ? 'CREATING...' : 'CREATE KEY'}
          </button>
        </div>
      </div>

      {/* Key list */}
      {keys.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16 }}>
          No API keys yet. Create one above.
        </div>
      )}
      {keys.map(key => (
        <div key={key.id} style={{
          background: 'var(--console-body)', border: '1px solid #1a1a3e',
          borderRadius: 6, padding: '14px 20px', marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13, color: '#fff', marginBottom: 2 }}>
              {key.name}
              {!key.is_active && <span style={{ color: '#ff4444', fontSize: 10, marginLeft: 8 }}>REVOKED</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {key.key_prefix}•••••••• &nbsp;|&nbsp; Created {new Date(key.created_at).toLocaleDateString()}
              {key.last_used_at && ` | Last used ${new Date(key.last_used_at).toLocaleDateString()}`}
            </div>
          </div>
          {key.is_active && (
            <button onClick={() => revokeKey(key.id)} style={{
              background: 'transparent', color: '#ff4444', border: '1px solid #ff4444',
              borderRadius: 4, padding: '4px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              REVOKE
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
