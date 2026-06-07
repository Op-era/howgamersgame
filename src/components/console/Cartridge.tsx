'use client'

import Image from 'next/image'
import type { Game } from '@/types/game'

interface CartridgeProps {
  game: Game
  isActive: boolean
  isInserting: boolean
  onClick: () => void
  index: number
}

/* Palette for cartridge body colors — cycles through games */
const CART_COLORS = [
  '#2d1b69', '#1b3a2d', '#3a1b1b', '#1b2a3a',
  '#2a1b3a', '#1b3a3a', '#3a2a1b', '#1b1b3a',
]

export default function Cartridge({ game, isActive, isInserting, onClick, index }: CartridgeProps) {
  const bodyColor = CART_COLORS[index % CART_COLORS.length]

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        cursor: isActive ? 'pointer' : 'default',
        transition: 'all 0.3s',
      }}
    >
      {/* The pulled-out cartridge body (only visible when active) */}
      <div
        className={
          isInserting
            ? 'cartridge-inserting'
            : isActive
              ? 'cartridge-active'
              : 'cartridge-inactive'
        }
        onClick={isActive ? onClick : undefined}
        style={{
          width: 90,
          height: 64,
          background: bodyColor,
          borderRadius: '4px 4px 8px 8px',
          border: '2px solid rgba(255,255,255,0.1)',
          boxShadow: isActive
            ? '0 0 20px rgba(0,255,136,0.4), -4px 0 12px rgba(0,0,0,0.6)'
            : '-2px 0 8px rgba(0,0,0,0.4)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          transition: 'box-shadow 0.3s',
        }}
      >
        {/* Cartridge connector pins at bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 60,
          height: 8,
          display: 'flex',
          gap: 3,
          alignItems: 'flex-end',
          padding: '0 4px',
        }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{
              flex: 1,
              height: 6,
              background: '#b8860b',
              borderRadius: '0 0 1px 1px',
            }} />
          ))}
        </div>

        {/* Cover art or placeholder */}
        <div style={{
          flex: 1,
          margin: '6px 6px 12px',
          borderRadius: 3,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.4)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {game.cover_art_url ? (
            <Image
              src={game.cover_art_url}
              alt={game.title}
              fill
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span style={{
              fontSize: 8,
              color: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
              padding: 4,
              lineHeight: 1.3,
            }}>
              {game.title}
            </span>
          )}
        </div>

        {/* Active glow overlay */}
        {isActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid var(--accent-green)',
            borderRadius: 'inherit',
            boxShadow: 'inset 0 0 12px rgba(0,255,136,0.2)',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* The rack slot (always visible, cartridge slides out of it) */}
      <div style={{
        width: 72,
        background: 'var(--console-dark)',
        borderRadius: '0 6px 6px 0',
        border: '1px solid #1a1a3e',
        borderLeft: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 10px 0 6px',
        height: 64,
        boxShadow: 'inset -2px 0 8px rgba(0,0,0,0.5)',
        flexShrink: 0,
      }}>
        <div style={{
          writingMode: 'vertical-lr',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          fontSize: 10,
          color: isActive ? 'var(--accent-green)' : 'var(--text-muted)',
          letterSpacing: '0.15em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          maxHeight: 56,
          fontWeight: isActive ? 'bold' : 'normal',
          transition: 'color 0.3s',
        }}>
          {game.title.toUpperCase()}
        </div>
      </div>

      {/* Click-to-play hint */}
      {isActive && !isInserting && (
        <div style={{
          position: 'absolute',
          left: -90,
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: 9,
          color: 'var(--accent-green)',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          animation: 'led-blink 1.5s ease-in-out infinite',
        }}>
          CLICK TO PLAY →
        </div>
      )}
    </div>
  )
}
