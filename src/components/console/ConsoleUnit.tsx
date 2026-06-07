'use client'

interface ConsoleUnitProps {
  hasCartridge: boolean
  isRunning: boolean
  onPower: () => void
}

export default function ConsoleUnit({ hasCartridge, isRunning, onPower }: ConsoleUnitProps) {
  return (
    <div style={{
      width: '100%',
      background: 'var(--console-body)',
      borderRadius: '0 0 16px 16px',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      border: '1px solid #1a1a3e',
      borderTop: '2px solid #2a2a5e',
      position: 'relative',
    }}>
      {/* Cartridge slot */}
      <div style={{
        width: 80,
        height: 44,
        background: hasCartridge ? 'var(--cartridge-body)' : 'var(--console-dark)',
        borderRadius: 4,
        border: '2px solid #0d0d1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)',
      }}>
        {hasCartridge && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 60,
            height: 8,
            background: '#3d3d6e',
            borderRadius: '0 0 4px 4px',
          }} />
        )}
        <div style={{
          fontSize: 8,
          color: hasCartridge ? 'var(--accent-green)' : '#333',
          letterSpacing: '0.15em',
        }}>
          {hasCartridge ? 'LOADED' : 'EMPTY'}
        </div>
      </div>

      {/* Controls group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        {/* Power button */}
        <button
          onClick={onPower}
          disabled={!hasCartridge}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: isRunning ? '#1a0000' : '#001a00',
            border: `2px solid ${isRunning ? '#ff4444' : 'var(--accent-green)'}`,
            color: isRunning ? '#ff4444' : 'var(--accent-green)',
            fontSize: 11,
            cursor: hasCartridge ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isRunning
              ? '0 0 12px rgba(255,68,68,0.5)'
              : hasCartridge
                ? '0 0 12px rgba(0,255,136,0.4)'
                : 'none',
            transition: 'all 0.2s',
            opacity: hasCartridge ? 1 : 0.4,
          }}
        >
          {isRunning ? '⏹' : '▶'}
        </button>

        {/* LED indicators */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div className={isRunning ? 'led-active' : ''} style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isRunning ? 'var(--accent-green)' : '#1a1a1a',
            color: 'var(--accent-green)',
          }} />
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hasCartridge ? 'var(--accent-gold)' : '#1a1a1a',
            boxShadow: hasCartridge ? '0 0 6px var(--accent-gold)' : 'none',
            transition: 'all 0.3s',
          }} />
        </div>

        {/* Decorative vents */}
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              width: 2,
              height: 20,
              background: '#0d0d1a',
              borderRadius: 1,
            }} />
          ))}
        </div>
      </div>

      {/* Branding */}
      <div style={{
        position: 'absolute',
        right: 24,
        bottom: 8,
        fontSize: 8,
        color: '#2a2a5e',
        letterSpacing: '0.3em',
        fontWeight: 'bold',
      }}>
        HGG-1
      </div>

      {/* Console art — swap this div for a PNG once you have the asset */}
      {/* Asset: /public/assets/console/console.png — replace with <Image> tag */}
    </div>
  )
}
