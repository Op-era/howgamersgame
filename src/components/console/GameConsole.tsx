'use client'

import { useState, useEffect, useRef } from 'react'
import type { Game } from '@/types/game'
import TVScreen from './TVScreen'
import ConsoleUnit from './ConsoleUnit'
import CartridgeRack from './CartridgeRack'
import GameOverlay from './GameOverlay'
import AdBanner from '@/components/layout/AdBanner'

interface GameConsoleProps {
  games: Game[]
}

export default function GameConsole({ games }: GameConsoleProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [tvOn, setTvOn] = useState(false)
  const [hasCartridge, setHasCartridge] = useState(false)
  const [runningGame, setRunningGame] = useState<Game | null>(null)
  const prevIndexRef = useRef(-1)

  const activeGame = games[activeIndex] ?? null

  /* Turn TV on when cartridge changes selection */
  useEffect(() => {
    if (games.length === 0) return
    if (prevIndexRef.current !== activeIndex) {
      prevIndexRef.current = activeIndex
      setTvOn(false)
      const t = setTimeout(() => setTvOn(true), 150)
      return () => clearTimeout(t)
    }
  }, [activeIndex, games.length])

  /* Initial TV on */
  useEffect(() => {
    if (games.length > 0) {
      const t = setTimeout(() => setTvOn(true), 600)
      return () => clearTimeout(t)
    }
  }, [games.length])

  function handleGameLaunch(game: Game) {
    setHasCartridge(true)
    setTimeout(() => {
      setRunningGame(game)
    }, 400)
  }

  function handleGameClose() {
    setRunningGame(null)
    setHasCartridge(false)
  }

  function handlePower() {
    if (hasCartridge && runningGame) {
      handleGameClose()
    } else if (hasCartridge) {
      setRunningGame(activeGame)
    }
  }

  return (
    <>
      {/* Fullscreen game overlay */}
      {runningGame && (
        <GameOverlay game={runningGame} onClose={handleGameClose} />
      )}

      {/* Main layout */}
      <div style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: '160px 1fr 160px',
        minHeight: 'calc(100vh - 40px)',
        gridTemplateAreas: `
          "top    top    top"
          "left   main   right"
        `,
      }}>
        {/* Top ad */}
        <div style={{ gridArea: 'top' }}>
          <AdBanner position="top" />
        </div>

        {/* Left ad */}
        <div style={{ gridArea: 'left' }}>
          <AdBanner position="left" />
        </div>

        {/* Main content */}
        <div style={{
          gridArea: 'main',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px 24px',
          gap: 0,
          minHeight: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            width: '100%',
            maxWidth: 900,
          }}>
            {/* TV + Console stack */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <TVScreen
                game={activeGame}
                isOn={tvOn}
              />
              <ConsoleUnit
                hasCartridge={hasCartridge}
                isRunning={!!runningGame}
                onPower={handlePower}
              />
            </div>

            {/* Cartridge rack */}
            {games.length > 0 ? (
              <CartridgeRack
                games={games}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
                onGameLaunch={handleGameLaunch}
              />
            ) : (
              <div style={{
                width: 172,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 16,
                border: '1px dashed #1a1a3e',
                borderRadius: 8,
                height: 200,
              }}>
                <div style={{ color: '#333', fontSize: 24 }}>📦</div>
                <div style={{ color: '#333', fontSize: 11, textAlign: 'center' }}>
                  NO GAMES YET
                </div>
              </div>
            )}
          </div>

          {/* Footer instructions */}
          <div style={{
            marginTop: 12,
            display: 'flex',
            gap: 24,
            fontSize: 10,
            color: 'var(--text-muted)',
            letterSpacing: '0.15em',
          }}>
            <span>↕ SCROLL TO BROWSE</span>
            <span>•</span>
            <span>CLICK CARTRIDGE TO INSERT</span>
            <span>•</span>
            <span>▶ PRESS PLAY TO START</span>
          </div>
        </div>

        {/* Right ad */}
        <div style={{ gridArea: 'right' }}>
          <AdBanner position="right" />
        </div>
      </div>
    </>
  )
}
