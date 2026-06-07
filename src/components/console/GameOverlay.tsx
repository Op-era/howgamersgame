'use client'

import { useEffect, useRef } from 'react'
import type { Game } from '@/types/game'

interface GameOverlayProps {
  game: Game
  onClose: () => void
}

export default function GameOverlay({ game, onClose }: GameOverlayProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  /* Track play count */
  useEffect(() => {
    fetch(`/api/games/${game.id}/play`, { method: 'POST' }).catch(() => {})
  }, [game.id])

  /* Escape key closes the overlay */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="game-overlay" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Thin header bar */}
      <div style={{
        height: 40,
        background: 'var(--console-dark)',
        borderBottom: '1px solid #1a1a3e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: 'var(--accent-green)', letterSpacing: '0.2em' }}>
          NOW PLAYING: <strong>{game.title.toUpperCase()}</strong>
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>ESC to exit</span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #ff4444',
              color: '#ff4444',
              fontSize: 12,
              padding: '4px 12px',
              borderRadius: 4,
              cursor: 'pointer',
              letterSpacing: '0.1em',
            }}
          >
            ✕ EXIT
          </button>
        </div>
      </div>

      {/* Game iframe */}
      <iframe
        ref={iframeRef}
        src={game.game_url}
        style={{ flex: 1, border: 'none', background: '#000' }}
        allow="fullscreen; autoplay; microphone; gamepad"
        title={game.title}
      />
    </div>
  )
}
