'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { Game } from '@/types/game'
import { gamePlayUrl } from '@/types/game'

interface ConsoleRoomProps {
  games: Game[]
}

/**
 * Console room: retro console + TV hero, horizontal infinite carousel below.
 * - Current game centered, next peeking right, previous peeking left
 * - Infinite loop (with 2 games, the other appears on both sides)
 * - Swipe or arrows to navigate, click centered cartridge to play
 * - Click: cartridge animates into slot, TV zooms to fullscreen, game loads
 */
export default function ConsoleRoom({ games }: ConsoleRoomProps) {
  const router = useRouter()
  const [activeIndex, setActiveIndex] = useState(0)
  const [isInserting, setIsInserting] = useState(false)
  const [isZooming, setIsZooming] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const count = games.length
  const activeGame = count > 0 ? games[activeIndex] : null

  // Infinite loop indices
  const prevIndex = count > 0 ? (activeIndex - 1 + count) % count : 0
  const nextIndex = count > 0 ? (activeIndex + 1) % count : 0

  const goPrev = useCallback(() => {
    if (count > 0) setActiveIndex((i) => (i - 1 + count) % count)
  }, [count])

  const goNext = useCallback(() => {
    if (count > 0) setActiveIndex((i) => (i + 1) % count)
  }, [count])

  // Touch swipe
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      if (dx > 0) goPrev()
      else goNext()
    }
    touchStartX.current = null
  }

  // Keyboard arrows
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  function handlePlay() {
    if (!activeGame || isInserting) return
    setIsInserting(true)
    // Cartridge slides into slot
    setTimeout(() => {
      setIsZooming(true)
      // TV zooms to fullscreen as game loads
      setTimeout(() => {
        router.push(gamePlayUrl(activeGame.slug))
      }, 800)
    }, 700)
  }

  function cartridgeImage(game: Game): string {
    // Use cartridge_label_url if set, else fall back to generated art by slug
    if (game.cartridge_label_url) return game.cartridge_label_url
    if (game.slug === 'neon-snake' || game.slug.includes('snake')) {
      return '/images/console/cartridge-snake.png'
    }
    return '/images/console/cartridge-tictacticaltoe.png'
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 60px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* TV zoom overlay */}
      {isZooming && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'tv-zoom-in 0.8s ease-in forwards',
        }}>
          <div className="neon-green" style={{ fontSize: 18, letterSpacing: '0.3em' }}>
            LOADING {activeGame?.title.toUpperCase()}
          </div>
        </div>
      )}

      {/* Console + TV hero */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 640,
        marginBottom: 8,
      }}>
        <Image
          src="/images/console/hero-console.webp"
          alt="Retro console with TV"
          width={1200}
          height={800}
          style={{ width: '100%', height: 'auto', borderRadius: 12 }}
          priority
        />
        {/* Inserting cartridge animation */}
        {isInserting && activeGame && (
          <div style={{
            position: 'absolute',
            top: '8%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 90,
            animation: 'cartridge-drop-in 0.7s ease-in forwards',
            zIndex: 10,
          }}>
            <Image
              src={cartridgeImage(activeGame)}
              alt={activeGame.title}
              width={224}
              height={448}
              style={{ width: '100%', height: 'auto' }}
            />
          </div>
        )}
      </div>

      {/* Carousel */}
      {count > 0 ? (
        <div style={{ width: '100%', maxWidth: 700 }}>
          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              padding: '20px 0',
              userSelect: 'none',
            }}
          >
            {/* Previous (left) */}
            <button
              onClick={goPrev}
              aria-label="Previous game"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 28, color: 'var(--accent-green)', padding: 8,
              }}
            >
              ◀
            </button>

            {/* Prev cartridge (peek) */}
            <div style={{ opacity: 0.45, transform: 'scale(0.72)', transition: 'all 0.3s', pointerEvents: 'none' }}>
              <CartridgeCard game={games[prevIndex]} small />
            </div>

            {/* Active cartridge (center) */}
            <div
              onClick={handlePlay}
              style={{
                transform: 'scale(1)', transition: 'transform 0.3s',
                cursor: 'pointer',
                filter: 'drop-shadow(0 0 24px rgba(0,255,136,0.35))',
              }}
            >
              <CartridgeCard game={activeGame!} />
              <div style={{
                textAlign: 'center', marginTop: 12,
                fontSize: 13, letterSpacing: '0.1em', color: 'var(--accent-green)',
                animation: 'led-blink 1.5s ease-in-out infinite',
              }}>
                CLICK TO PLAY ▶
              </div>
            </div>

            {/* Next cartridge (peek) */}
            <div style={{ opacity: 0.45, transform: 'scale(0.72)', transition: 'all 0.3s', pointerEvents: 'none' }}>
              <CartridgeCard game={games[nextIndex]} small />
            </div>

            {/* Next (right) */}
            <button
              onClick={goNext}
              aria-label="Next game"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 28, color: 'var(--accent-green)', padding: 8,
              }}
            >
              ▶
            </button>
          </div>

          {/* Dots */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            {games.map((g, i) => (
              <button
                key={g.id}
                onClick={() => setActiveIndex(i)}
                aria-label={g.title}
                style={{
                  width: 8, height: 8, borderRadius: '50%', border: 'none',
                  background: i === activeIndex ? 'var(--accent-green)' : '#333',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
          </div>

          {/* Active game title */}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {activeGame?.title}
            </div>
            {activeGame?.description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                {activeGame.description}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 40 }}>
          No games available yet. Check back soon.
        </div>
      )}

      <style>{`
        @keyframes cartridge-drop-in {
          from { transform: translateX(-50%) translateY(-120px); opacity: 0; }
          60% { opacity: 1; }
          to { transform: translateX(-50%) translateY(10px); opacity: 1; }
        }
        @keyframes tv-zoom-in {
          from { transform: scale(0.4); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

function CartridgeCard({ game, small }: { game: Game; small?: boolean }) {
  const src = game.cartridge_label_url
    || (game.slug.includes('snake') ? '/images/console/cartridge-snake.png' : '/images/console/cartridge-tictacticaltoe.png')
  const w = small ? 110 : 170
  return (
    <Image
      src={src}
      alt={game.title}
      width={224}
      height={448}
      style={{ width: w, height: 'auto' }}
    />
  )
}
