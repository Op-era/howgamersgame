'use client'

import { useEffect, useRef } from 'react'
import type { Game } from '@/types/game'

interface TVScreenProps {
  game: Game | null
  isOn: boolean
  onGameLoad?: () => void
}

export default function TVScreen({ game, isOn, onGameLoad }: TVScreenProps) {
  const screenRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!screenRef.current) return
    if (isOn) {
      screenRef.current.classList.remove('tv-power-on')
      void screenRef.current.offsetWidth
      screenRef.current.classList.add('tv-power-on')
    }
  }, [isOn])

  return (
    <div style={{
      width: '100%',
      aspectRatio: '16/9',
      background: 'var(--tv-frame)',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 0 60px rgba(0,0,0,0.8), inset 0 0 0 2px #2a2a4a',
      position: 'relative',
    }}>
      {/* TV bezel details */}
      <div style={{
        position: 'absolute',
        top: 8, left: 8,
        width: 8, height: 8,
        borderRadius: '50%',
        background: isOn ? 'var(--accent-green)' : '#333',
        boxShadow: isOn ? '0 0 8px var(--accent-green)' : 'none',
        transition: 'all 0.3s',
      }} />
      <div style={{
        position: 'absolute',
        bottom: 10, right: 20,
        fontSize: 9,
        color: '#333',
        letterSpacing: '0.2em',
        fontWeight: 'bold',
      }}>
        HOW GAMERS GAME
      </div>

      {/* The screen */}
      <div
        ref={screenRef}
        className={isOn ? 'screen-active' : ''}
        style={{
          width: '100%',
          height: '100%',
          background: isOn ? 'var(--tv-screen)' : '#000',
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.3s',
        }}
      >
        <div className="crt-overlay" />

        {!isOn ? (
          /* TV off state */
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              width: 2,
              height: 2,
              background: '#fff',
              borderRadius: '50%',
              boxShadow: '0 0 8px 2px rgba(255,255,255,0.3)',
            }} />
          </div>
        ) : game ? (
          /* Game info screen */
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-end',
            padding: 24,
            background: game.cover_art_url
              ? `linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 60%, transparent 100%),
                 url(${game.cover_art_url}) center/cover no-repeat`
              : 'linear-gradient(135deg, #0a0a2e 0%, #1a0a3e 50%, #0a1a2e 100%)',
          }}>
            {game.genre && (
              <span style={{
                fontSize: 10,
                color: 'var(--accent-green)',
                letterSpacing: '0.2em',
                marginBottom: 8,
                textTransform: 'uppercase',
              }}>
                {game.genre}
              </span>
            )}
            <h2 style={{
              margin: '0 0 8px',
              fontSize: 28,
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
              letterSpacing: '0.05em',
            }}>
              {game.title}
            </h2>
            {game.description && (
              <p style={{
                margin: 0,
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
                maxWidth: 400,
                lineHeight: 1.5,
              }}>
                {game.description}
              </p>
            )}
            <div style={{
              marginTop: 16,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <span style={{
                fontSize: 12,
                color: 'var(--accent-gold)',
                letterSpacing: '0.1em',
              }}>
                ⬡ {game.play_count.toLocaleString()} plays
              </span>
              <span style={{ color: '#333' }}>|</span>
              <span style={{
                fontSize: 11,
                color: 'var(--accent-green)',
                letterSpacing: '0.1em',
              }}>
                INSERT CARTRIDGE TO PLAY
              </span>
            </div>
          </div>
        ) : (
          /* No game state */
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}>
            <div className="neon-green" style={{ fontSize: 14, letterSpacing: '0.3em' }}>
              SELECT A GAME
            </div>
            <div style={{ color: '#333', fontSize: 11, letterSpacing: '0.2em' }}>
              ↑ SCROLL CARTRIDGES ↑
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
