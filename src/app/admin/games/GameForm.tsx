'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { Game } from '@/types/game'

interface GameFormProps {
  mode: 'create' | 'edit'
  game?: Game
}

const GENRES = ['Action', 'Puzzle', 'RPG', 'Platformer', 'Strategy', 'Arcade', 'Adventure', 'Sports', 'Racing', 'Simulation']

export default function GameForm({ mode, game }: GameFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadingLabel, setUploadingLabel] = useState(false)
  const [uploadingGame, setUploadingGame] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    slug: game?.slug ?? '',
    title: game?.title ?? '',
    description: game?.description ?? '',
    long_description: game?.long_description ?? '',
    genre: game?.genre ?? '',
    game_type: game?.game_type ?? 'external',
    game_url: game?.game_url ?? '',
    cover_art_url: game?.cover_art_url ?? '',
    cartridge_label_url: game?.cartridge_label_url ?? '',
    sort_order: game?.sort_order ?? 0,
    is_active: game?.is_active ?? true,
  })

  function set(key: string, value: string | number | boolean) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function uploadAsset(file: File, path: string, onProgress?: (pct: number) => void) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)

    const res = await fetch('/api/admin/upload-asset', {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Upload failed')
    return json.url as string
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form.slug) { alert('Set the slug first'); return }
    setUploadingCover(true)
    try {
      const url = await uploadAsset(file, `covers/${form.slug}.${file.name.split('.').pop()}`)
      set('cover_art_url', url)
    } catch (err) {
      setError(String(err))
    } finally {
      setUploadingCover(false)
    }
  }

  async function handleLabelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form.slug) { alert('Set the slug first'); return }
    setUploadingLabel(true)
    try {
      const url = await uploadAsset(file, `labels/${form.slug}.${file.name.split('.').pop()}`)
      set('cartridge_label_url', url)
    } catch (err) {
      setError(String(err))
    } finally {
      setUploadingLabel(false)
    }
  }

  async function handleGameUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !form.slug) { alert('Set the slug first'); return }
    setUploadingGame(true)
    setUploadProgress(0)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('slug', form.slug)
      const res = await fetch('/api/admin/upload-game', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      set('game_url', json.url)
      set('game_type', 'supabase')
    } catch (err) {
      setError(String(err))
    } finally {
      setUploadingGame(false)
      setUploadProgress(100)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(
        mode === 'create' ? '/api/admin/games' : `/api/admin/games/${game!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      router.push('/admin/games')
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--console-dark)',
    border: '1px solid #2a2a5e',
    borderRadius: 6,
    padding: '10px 14px',
    color: '#fff',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    letterSpacing: '0.12em',
    display: 'block',
    marginBottom: 6,
  }

  const fieldStyle: React.CSSProperties = { marginBottom: 20 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 4 }}>
            ADMIN / GAMES
          </div>
          <h1 className="neon-green" style={{ margin: 0, fontSize: 22, letterSpacing: '0.15em' }}>
            {mode === 'create' ? 'ADD NEW GAME' : `EDIT: ${game?.title}`}
          </h1>
        </div>
        <a href="/admin/games" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none' }}>
          ← Back
        </a>
      </div>

      {error && (
        <div style={{
          background: 'rgba(255,68,68,0.1)', border: '1px solid #ff4444',
          borderRadius: 6, padding: '12px 16px', marginBottom: 20, color: '#ff6666', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
          background: 'var(--console-body)', border: '1px solid #1a1a3e',
          borderRadius: 10, padding: 28, marginBottom: 24,
        }}>
          {/* Left column */}
          <div>
            <div style={fieldStyle}>
              <label style={labelStyle}>TITLE *</label>
              <input required style={inputStyle} value={form.title}
                onChange={e => set('title', e.target.value)} placeholder="Game title" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>SLUG * (URL-safe, e.g. my-game)</label>
              <input required style={inputStyle} value={form.slug}
                onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="my-game" />
              {form.slug && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  URL: /play/{form.slug}
                </div>
              )}
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>SHORT DESCRIPTION</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="One or two sentences shown on the TV screen" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>GENRE</label>
              <select style={inputStyle} value={form.genre}
                onChange={e => set('genre', e.target.value)}>
                <option value="">Select genre</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>SORT ORDER</label>
                <input type="number" style={inputStyle} value={form.sort_order}
                  onChange={e => set('sort_order', parseInt(e.target.value) || 0)} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>STATUS</label>
                <select style={inputStyle} value={form.is_active ? 'active' : 'hidden'}
                  onChange={e => set('is_active', e.target.value === 'active')}>
                  <option value="active">Live</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div>
            {/* Game hosting type */}
            <div style={{ ...fieldStyle, background: 'var(--console-dark)', borderRadius: 8, padding: 16 }}>
              <label style={labelStyle}>GAME TYPE</label>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {(['external', 'supabase'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => set('game_type', t)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 6, fontSize: 11,
                      fontFamily: 'inherit', fontWeight: 'bold', letterSpacing: '0.1em', cursor: 'pointer',
                      background: form.game_type === t ? 'var(--accent-green)' : 'var(--console-body)',
                      color: form.game_type === t ? '#000' : 'var(--text-muted)',
                      border: form.game_type === t ? 'none' : '1px solid #333',
                    }}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {form.game_type === 'external' ? (
                <div>
                  <label style={labelStyle}>EXTERNAL GAME URL *</label>
                  <input required={form.game_type === 'external'} style={inputStyle}
                    value={form.game_url} onChange={e => set('game_url', e.target.value)}
                    placeholder="https://yourgame.com/play" />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                    userId and platform params will be appended automatically.
                  </div>
                </div>
              ) : (
                <div>
                  <label style={labelStyle}>UPLOAD GAME FILES (ZIP)</label>
                  <input type="file" accept=".zip" onChange={handleGameUpload}
                    style={{ fontSize: 12, color: '#fff' }} />
                  {uploadingGame && (
                    <div style={{ marginTop: 8, height: 4, background: '#1a1a3e', borderRadius: 2 }}>
                      <div className="neon-green" style={{
                        height: '100%', width: `${uploadProgress}%`,
                        background: 'var(--accent-green)', transition: 'width 0.3s', borderRadius: 2,
                      }} />
                    </div>
                  )}
                  {form.game_url && form.game_type === 'supabase' && (
                    <div style={{ fontSize: 10, color: 'var(--accent-green)', marginTop: 6 }}>
                      ✓ Uploaded: {form.game_url.split('/').slice(-2).join('/')}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
                    ZIP must contain index.html at root. Max 100MB.
                  </div>
                </div>
              )}
            </div>

            {/* Cover art */}
            <div style={fieldStyle}>
              <label style={labelStyle}>COVER ART (800×600 PNG/WebP)</label>
              {form.cover_art_url && (
                <div style={{ marginBottom: 8, position: 'relative', width: 120, height: 90, borderRadius: 4, overflow: 'hidden' }}>
                  <Image src={form.cover_art_url} alt="Cover" fill style={{ objectFit: 'cover' }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleCoverUpload}
                style={{ fontSize: 12, color: '#fff', marginBottom: 6 }} />
              {uploadingCover && <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Uploading...</div>}
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Or paste URL: <input style={{ ...inputStyle, display: 'inline', width: 'auto', fontSize: 11, padding: '4px 8px' }}
                  value={form.cover_art_url} onChange={e => set('cover_art_url', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>

            {/* Cartridge label */}
            <div style={fieldStyle}>
              <label style={labelStyle}>CARTRIDGE LABEL (200×120 PNG)</label>
              {form.cartridge_label_url && (
                <div style={{ marginBottom: 8, position: 'relative', width: 80, height: 48, borderRadius: 3, overflow: 'hidden' }}>
                  <Image src={form.cartridge_label_url} alt="Label" fill style={{ objectFit: 'cover' }} />
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleLabelUpload}
                style={{ fontSize: 12, color: '#fff', marginBottom: 6 }} />
              {uploadingLabel && <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Uploading...</div>}
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Or paste URL: <input style={{ ...inputStyle, display: 'inline', width: 'auto', fontSize: 11, padding: '4px 8px' }}
                  value={form.cartridge_label_url} onChange={e => set('cartridge_label_url', e.target.value)}
                  placeholder="https://..." />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" disabled={saving} style={{
            background: saving ? '#333' : 'var(--accent-green)',
            color: '#000', fontWeight: 'bold', fontSize: 13, letterSpacing: '0.12em',
            padding: '12px 32px', borderRadius: 6, border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>
            {saving ? 'SAVING...' : mode === 'create' ? 'CREATE GAME' : 'SAVE CHANGES'}
          </button>
          {mode === 'edit' && (
            <button type="button" onClick={async () => {
              if (!confirm('Delete this game? This cannot be undone.')) return
              await fetch(`/api/admin/games/${game!.id}`, { method: 'DELETE' })
              router.push('/admin/games')
            }} style={{
              background: 'transparent', color: '#ff4444', border: '1px solid #ff4444',
              fontSize: 12, padding: '12px 20px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              DELETE GAME
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
