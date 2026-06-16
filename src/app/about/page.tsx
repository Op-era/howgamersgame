import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About — HowGamersGame',
  description: 'HowGamersGame is a free arcade game platform with a real coin economy. Play classics, earn coins, and compete on leaderboards.',
}

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1, maxWidth: 800, margin: '0 auto', padding: '48px 24px', width: '100%' }}>

        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 8 }}>
            // ABOUT
          </div>
          <h1 style={{
            fontSize: 32,
            fontWeight: 'bold',
            letterSpacing: '0.1em',
            margin: 0,
          }}>
            <span style={{ color: 'var(--accent-green)' }}>HOW</span>
            <span style={{ color: '#fff' }}>GAMERS</span>
            <span style={{ color: 'var(--accent-gold)' }}>GAME</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
            Haven Command LLC &bull; Est. 2024
          </p>
        </div>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // WHAT WE ARE
          </h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            HowGamersGame is a free-to-play arcade platform built for players who grew up on joysticks and cartridges.
            We host a growing library of browser-based games — everything from classic strategy titles to fast-twitch
            arcade challenges — all playable directly in your browser without downloads or installs.
          </p>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: 0 }}>
            Our platform is designed around a real coin economy. Play games to earn coins, then spend them on boosts,
            power-ups, and premium features across any game in the library. No pay-to-win — just play-to-earn.
          </p>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // THE COIN ECONOMY
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { icon: '🎮', title: 'PLAY', desc: 'Play any game free, any time, no account required.' },
              { icon: '⬡', title: 'EARN', desc: 'Win coins by scoring well, hitting leaderboards, and completing challenges.' },
              { icon: '⚡', title: 'SPEND', desc: 'Use coins on in-game boosts, cosmetics, and early-access games.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{
                background: 'var(--bg-secondary)',
                border: '1px solid #1a1a3e',
                borderRadius: 8,
                padding: 20,
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                <div style={{ color: 'var(--accent-gold)', fontSize: 11, letterSpacing: '0.15em', marginBottom: 8 }}>{title}</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // GAME LIBRARY
          </h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            Our library launches with handcrafted original games built specifically for this platform. Every game is
            optimized for browser play with no lag, no ads mid-game, and mobile-friendly controls.
          </p>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            Current titles include:
          </p>
          <ul style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 2, margin: 0, paddingLeft: 20 }}>
            <li><span style={{ color: 'var(--accent-gold)' }}>Chris&apos;s Tic-Tactical-Toe</span> — Strategic grid battles with AI opponents, online ranked play, and tactical boosts</li>
            <li><span style={{ color: 'var(--accent-gold)' }}>More coming soon</span> — We add new games regularly as our developer program grows</li>
          </ul>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // FOR DEVELOPERS
          </h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            HowGamersGame is also an open platform for independent game developers. If you&apos;ve built a browser-based
            game and want it featured alongside an engaged gaming audience, apply through our developer program.
            We handle hosting, distribution, and the coin economy integration — you keep creative control.
          </p>
          <Link href="/developer" style={{
            display: 'inline-block',
            background: 'transparent',
            border: '1px solid var(--accent-green)',
            color: 'var(--accent-green)',
            padding: '10px 24px',
            fontSize: 12,
            letterSpacing: '0.15em',
            borderRadius: 4,
            textDecoration: 'none',
          }}>
            APPLY AS A DEVELOPER
          </Link>
        </section>

        <section style={{ marginBottom: 40 }}>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // SUBSCRIPTION PASSES
          </h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            All games are free to play. Players who want early access to new titles, bonus coin multipliers,
            and ad-free sessions can subscribe to one of our Gamer Passes. Passes are billed monthly and
            can be cancelled at any time.
          </p>
          <Link href="/subscribe" style={{
            display: 'inline-block',
            background: 'transparent',
            border: '1px solid var(--accent-gold)',
            color: 'var(--accent-gold)',
            padding: '10px 24px',
            fontSize: 12,
            letterSpacing: '0.15em',
            borderRadius: 4,
            textDecoration: 'none',
          }}>
            VIEW PASSES
          </Link>
        </section>

        <section>
          <h2 style={{ color: 'var(--accent-green)', fontSize: 14, letterSpacing: '0.15em', marginBottom: 16 }}>
            // CONTACT
          </h2>
          <p style={{ color: 'var(--text-primary)', lineHeight: 1.8, fontSize: 14, margin: '0 0 16px' }}>
            Questions, partnership inquiries, or feedback? We read every message.
          </p>
          <Link href="/contact" style={{
            display: 'inline-block',
            background: 'var(--accent-green)',
            color: '#000',
            fontWeight: 'bold',
            padding: '10px 24px',
            fontSize: 12,
            letterSpacing: '0.15em',
            borderRadius: 4,
            textDecoration: 'none',
          }}>
            GET IN TOUCH
          </Link>
        </section>

      </main>

      <footer style={{
        borderTop: '1px solid #1a1a3e',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: 12,
        letterSpacing: '0.05em',
      }}>
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>PRIVACY POLICY</Link>
          <Link href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>TERMS OF SERVICE</Link>
          <Link href="/contact" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>CONTACT</Link>
        </div>
        &copy; {new Date().getFullYear()} Haven Command LLC. All rights reserved.
      </footer>
    </div>
  )
}
