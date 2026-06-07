import Navigation from '@/components/layout/Navigation'
import GameConsole from '@/components/console/GameConsole'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/types/game'

export const revalidate = 60

export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const games: Game[] = data ?? []

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1 }}>
        <GameConsole games={games} />
      </main>
    </div>
  )
}
