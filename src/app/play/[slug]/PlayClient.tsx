'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { Game } from '@/types/game'
import { storageAssetUrl } from '@/types/game'

interface PlayClientProps {
  game: Game
  userId: string | null
  initialCoins: number
}

/* Resolve the actual iframe src for this game */
function resolveGameUrl(game: Game, userId: string | null): string {
  const base = game.game_url
  if (!userId) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}userId=${userId}&platform=howgamersgame`
}

export default function PlayClient({ game, userId, initialCoins }: PlayClientProps) {
  const [phase, setPhase] = useState<'intro' | 'loading' | 'playing'>('intro')
  const [coins, setCoins] = useState(initialCoins)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const gameUrl = resolveGameUrl(game, userId)

  /* Auto-advance from intro → loading after the "insert" animation */
  useEffect(() => {
    const t = setTimeout(() => setPhase('loading'), 900)
    return () => clearTimeout(t)
  }, [])

  /* Track play count once */
  useEffect(() => {
    fetch(`/api/games/${game.id}/play`, { method: 'POST' }).catch(() => {})
  }, [game.id])

  /* Listen for coin updates from the game iframe */
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'hgg:coinsUpdated' && typeof e.data.balance === 'number') {
        setCoins(e.data.balance)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const blankCartridge = storageAssetUrl('cartridges/blank.png')
  const coverArt = game.cover_art_url ?? null

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* ── Top HUD bar ──────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        background: 'var(--console-dark)',
        borderBottom: '1px solid #1a1a3e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 13, color: 'var(--accent-green)', letterSpacing: '0.2em' }}>
            ← CONSOLE
          </span>
        </Link>

        {/* Cartridge label strip — title goes here */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--console-body)',
          border: '1px solid #2a2a5e',
          borderRadius: 4,
          padding: '4px 16px',
        }}>
          {game.cartridge_label_url && (
            <Image
              src={game.cartridge_label_url}
              alt=""
              width={24}
              height={24}
              style={{ objectFit: 'contain', borderRadius: 2 }}
            />
          )}
          <span style={{
            fontSize: 13,
            fontWeight: 'bold',
            letterSpacing: '0.15em',
            color: '#fff',
          }}>
            {game.title.toUpperCase()}
          </span>
          {game.genre && (
            <span style={{
              fontSize: 9,
              color: 'var(--accent-green)',
              letterSpacing: '0.15em',
              marginLeft: 4,
            }}>
              {game.genre.toUpperCase()}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {userId && (
            <span style={{
              fontSize: 13,
              color: 'var(--accent-gold)',
              letterSpacing: '0.1em',
            }}>
              ⬡ <strong>{coins.toLocaleString()}</strong>
            </span>
          )}
          {!userId && (
            <Link href="/auth/login" style={{
              fontSize: 11,
              color: 'var(--accent-green)',
              textDecoration: 'none',
              letterSpacing: '0.1em',
            }}>
              SIGN IN FOR COINS
            </Link>
          )}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {/* Intro: cartridge insert animation */}
        {phase === 'intro' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-primary)',
            zIndex: 20,
          }}>
            <CartridgeIntroAnimation
              game={game}
              blankCartridge={blankCartridge}
              coverArt={coverArt}
            />
          </div>
        )}

        {/* Loading: brief "NOW LOADING" screen */}
        {phase === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#000',
            zIndex: 20,
          }}>
            <div className="neon-green" style={{ fontSize: 14, letterSpacing: '0.4em', marginBottom: 24 }}>
              NOW LOADING
            </div>
            <LoadingBar onComplete={() => setPhase('playing')} />
            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em' }}>
              {game.title.toUpperCase()}
            </div>
          </div>
        )}

        {/* Game iframe — always mounted once loading starts so it preloads */}
        {(phase === 'loading' || phase === 'playing') && (
          <iframe
            ref={iframeRef}
            src={gameUrl}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              border: 'none',
              background: '#000',
              opacity: phase === 'playing' ? 1 : 0,
              transition: 'opacity 0.4s',
            }}
            allow="fullscreen; autoplay; microphone; gamepad"
            title={game.title}
            onLoad={() => {
              if (phase === 'loading') {
                setTimeout(() => setPhase('playing'), 300)
              }
            }}
          />
        )}
      </div>

      {/* ── Cartridge-style bottom trim ───────────────────────────────── */}
      <div style={{
        height: 8,
        background: 'linear-gradient(to right, #0d0d1a, #1a1a3e, #0d0d1a)',
        flexShrink: 0,
      }} />
    </div>
  )
}

/* Cartridge intro animation — shows the cartridge dropping into the slot */
function CartridgeIntroAnimation({
  game, blankCartridge, coverArt,
}: { game: Game; blankCartridge: string; coverArt: string | null }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    }}>
      {/* Cartridge graphic */}
      <div
        className="cartridge-inserting"
        style={{
          width: 160,
          height: 120,
          position: 'relative',
          animation: 'none', /* override — use our own below */
        }}
        data-animate="insert"
      >
        <style>{`
          [data-animate="insert"] {
            animation: cart-drop 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          @keyframes cart-drop {
            0%   { transform: translateY(-80px); opacity: 0; }
            50%  { opacity: 1; }
            85%  { transform: translateY(8px); }
            100% { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        {/* Blank cartridge shell */}
        <div style={{
          width: '100%',
          height: '100%',
          background: 'var(--cartridge-body)',
          borderRadius: '6px 6px 12px 12px',
          border: '2px solid rgba(255,255,255,0.08)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        }}>
          {/* Cover art overlay */}
          {coverArt ? (
            <Image
              src={coverArt}
              alt={game.title}
              fill
              style={{ objectFit: 'cover', opacity: 0.9 }}
              priority
            />
          ) : (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #1a1a3e 0%, #2d2d5e 100%)',
            }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 8 }}>
                {game.title}
              </span>
            </div>
          )}

          {/* Title strip at bottom of cartridge */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            padding: '6px 8px',
            background: 'linear-gradient(to top, rgba(0,0,0,0.95), transparent)',
            fontSize: 9,
            fontWeight: 'bold',
            color: '#fff',
            letterSpacing: '0.2em',
            textAlign: 'center',
          }}>
            {game.title.toUpperCase()}
          </div>

          {/* Connector pins */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 100, height: 8,
            display: 'flex', gap: 3, padding: '0 4px',
          }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 8, background: '#b8860b', borderRadius: '0 0 1px 1px' }} />
            ))}
          </div>
        </div>
      </div>

      <div className="neon-green" style={{ fontSize: 11, letterSpacing: '0.3em', marginTop: 8 }}>
        INSERTING...
      </div>
    </div>
  )
}

/* Fake loading bar that completes and calls onComplete */
function LoadingBar({ onComplete }: { onComplete: () => void }) {
  const [pct, setPct] = useState(0)

  useEffect(() => {
    const steps = [15, 35, 55, 72, 88, 100]
    let i = 0
    const tick = () => {
      if (i >= steps.length) { onComplete(); return }
      setPct(steps[i])
      i++
      setTimeout(tick, 180 + Math.random() * 120)
    }
    const t = setTimeout(tick, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ width: 240, height: 4, background: '#1a1a3e', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: 'var(--accent-green)',
        boxShadow: '0 0 8px var(--accent-green)',
        transition: 'width 0.2s ease-out',
        borderRadius: 2,
      }} />
    </div>
  )
}
