import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import { query } from '@/lib/db/pg'
import type { Game } from '@/types/game'
import ConsoleRoom from '@/components/console/ConsoleRoom'
import Navigation from '@/components/layout/Navigation'

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  const user = await getSessionUser().catch(() => null)
  if (!user) {
    redirect('/')
  }

  let games: Game[] = []
  try {
    const r = await query(
      "SELECT * FROM games WHERE is_active = TRUE ORDER BY sort_order ASC"
    )
    games = r.rows as Game[]
  } catch {
    games = []
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1 }}>
        <ConsoleRoom games={games} />
      </main>
    </div>
  )
}
