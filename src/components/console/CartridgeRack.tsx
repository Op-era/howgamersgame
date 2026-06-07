'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Game } from '@/types/game'
import Cartridge from './Cartridge'

interface CartridgeRackProps {
  games: Game[]
  activeIndex: number
  onActiveChange: (index: number) => void
  onGameLaunch: (game: Game) => void
}

export default function CartridgeRack({
  games,
  activeIndex,
  onActiveChange,
  onGameLaunch,
}: CartridgeRackProps) {
  const [insertingIndex, setInsertingIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ITEM_HEIGHT = 80

  /* Scroll-driven active index */
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(idx, games.length - 1))
    onActiveChange(clamped)
  }, [games.length, onActiveChange])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])

  /* Snap active item into view when changed externally */
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const targetScroll = activeIndex * ITEM_HEIGHT
    if (Math.abs(el.scrollTop - targetScroll) > 4) {
      el.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
  }, [activeIndex])

  function handleCartridgeClick(game: Game, index: number) {
    if (index !== activeIndex) return
    setInsertingIndex(index)
    setTimeout(() => {
      setInsertingIndex(null)
      onGameLaunch(game)
    }, 750)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: 172,
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Rack header */}
      <div style={{
        padding: '8px 10px',
        fontSize: 9,
        color: 'var(--accent-green)',
        letterSpacing: '0.25em',
        borderBottom: '1px solid #1a1a3e',
        textAlign: 'right',
      }}>
        GAMES
      </div>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        style={{
          overflowY: games.length > 4 ? 'scroll' : 'hidden',
          height: Math.min(games.length, 5) * ITEM_HEIGHT,
          scrollSnapType: 'y mandatory',
          paddingTop: 8,
          paddingBottom: 8,
          scrollbarWidth: 'none',
        }}
      >
        {/* Spacers for snap centering */}
        <div style={{ height: 0 }} />

        {games.map((game, i) => (
          <div
            key={game.id}
            style={{
              height: ITEM_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              scrollSnapAlign: 'start',
              paddingRight: 0,
            }}
          >
            <Cartridge
              game={game}
              isActive={i === activeIndex}
              isInserting={insertingIndex === i}
              onClick={() => handleCartridgeClick(game, i)}
              index={i}
            />
          </div>
        ))}

        <div style={{ height: 0 }} />
      </div>

      {/* Scroll hint arrows */}
      {games.length > 1 && (
        <>
          <button
            onClick={() => onActiveChange(Math.max(0, activeIndex - 1))}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeIndex > 0 ? 'var(--accent-green)' : '#222',
              fontSize: 16,
              cursor: activeIndex > 0 ? 'pointer' : 'default',
              padding: 4,
              textAlign: 'center',
            }}
          >
            ▲
          </button>
          <button
            onClick={() => onActiveChange(Math.min(games.length - 1, activeIndex + 1))}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeIndex < games.length - 1 ? 'var(--accent-green)' : '#222',
              fontSize: 16,
              cursor: activeIndex < games.length - 1 ? 'pointer' : 'default',
              padding: 4,
              textAlign: 'center',
            }}
          >
            ▼
          </button>
        </>
      )}

      {/* Rack frame decorations */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 32,
        bottom: 0,
        width: 4,
        background: 'linear-gradient(to bottom, #1a1a3e, #0a0a1e)',
        borderRadius: '0 2px 2px 0',
      }} />
    </div>
  )
}
