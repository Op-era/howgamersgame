import { requireAdmin } from '@/lib/auth/adminGuard'
import { createClient } from '@/lib/supabase/server'
import { gamePlayUrl, gameTestUrl } from '@/types/game'
import Link from 'next/link'
import type { Game } from '@/types/game'
import PromoteButton from './PromoteButton'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<Game['status'], { label: string; bg: string; color: string }> = {
  draft: { label: 'DRAFT', bg: 'rgba(255,255,255,0.08)', color: '#aaa' },
  testing: { label: 'TESTING', bg: 'rgba(255,184,0,0.15)', color: 'var(--accent-gold)' },
  live: { label: 'LIVE', bg: 'rgba(0,255,136,0.15)', color: 'var(--accent-green)' },
}

export default async function AdminGamesPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .order('sort_order')

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.2em', marginBottom: 4 }}>
            ADMIN
          </div>
          <h1 className="neon-green" style={{ margin: 0, fontSize: 24, letterSpacing: '0.15em' }}>
            GAME MANAGEMENT
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/" style={{ color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', padding: '10px 16px' }}>
            ← Back to site
          </Link>
          <Link href="/admin/payouts" style={{
            color: 'var(--accent-gold)',
            fontSize: 12,
            textDecoration: 'none',
            padding: '10px 16px',
            border: '1px solid var(--accent-gold)',
            borderRadius: 6,
          }}>
            PAYOUTS
          </Link>
          <Link href="/admin/games/new" style={{
            background: 'var(--accent-green)',
            color: '#000',
            fontWeight: 'bold',
            fontSize: 12,
            padding: '10px 20px',
            borderRadius: 6,
            textDecoration: 'none',
            letterSpacing: '0.1em',
          }}>
            + ADD GAME
          </Link>
        </div>
      </div>

      {/* Games table */}
      <div style={{
        background: 'var(--console-body)',
        border: '1px solid #1a1a3e',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 90px 70px 90px 170px',
          padding: '10px 20px',
          borderBottom: '1px solid #1a1a3e',
          fontSize: 10,
          color: 'var(--text-muted)',
          letterSpacing: '0.15em',
        }}>
          <span>TITLE</span>
          <span>TYPE</span>
          <span>GENRE</span>
          <span>PLAYS</span>
          <span>STATUS</span>
          <span style={{ textAlign: 'right' }}>ACTIONS</span>
        </div>

        {!games?.length && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No games yet. <Link href="/admin/games/new" style={{ color: 'var(--accent-green)' }}>Add your first game →</Link>
          </div>
        )}

        {games?.map((game: Game, i: number) => {
          const status = STATUS_STYLES[game.status]
          return (
          <div key={game.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 90px 70px 90px 170px',
            padding: '14px 20px',
            borderBottom: i < games.length - 1 ? '1px solid #0d0d1a' : 'none',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 'bold', marginBottom: 2 }}>
                {game.title}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                /play/{game.slug}{!game.is_active && ' • hidden'}{game.developer_id && ' • dev submission'}
              </div>
            </div>
            <div>
              <span style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 10,
                background: game.game_type === 'supabase' ? 'rgba(0,255,136,0.15)' : 'rgba(124,58,237,0.2)',
                color: game.game_type === 'supabase' ? 'var(--accent-green)' : '#a78bfa',
                letterSpacing: '0.1em',
              }}>
                {game.game_type.toUpperCase()}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {game.genre ?? '—'}
            </div>
            <div style={{ fontSize: 12, color: '#fff' }}>
              {game.play_count.toLocaleString()}
            </div>
            <div>
              <span style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 10,
                background: status.bg,
                color: status.color,
                letterSpacing: '0.1em',
              }}>
                {status.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              {game.status === 'testing' && <PromoteButton gameId={game.id} />}
              <Link href={game.status === 'live' ? gamePlayUrl(game.slug) : gameTestUrl(game.slug)} target="_blank" style={{
                fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none',
                padding: '4px 8px', border: '1px solid #333', borderRadius: 4,
              }}>
                {game.status === 'live' ? 'PLAY' : 'TEST'}
              </Link>
              <Link href={`/admin/games/${game.id}`} style={{
                fontSize: 11, color: 'var(--accent-green)', textDecoration: 'none',
                padding: '4px 8px', border: '1px solid var(--accent-green)', borderRadius: 4,
              }}>
                EDIT
              </Link>
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
