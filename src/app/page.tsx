import Navigation from '@/components/layout/Navigation'
import GameConsole from '@/components/console/GameConsole'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/types/game'

export const revalidate = 60

export default async function Home() {
  let games: Game[] = []
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let subscriberTier: string | null = null
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_status')
        .eq('id', user.id)
        .single()
      if (profile?.subscription_status === 'active') {
        subscriberTier = profile.subscription_tier ?? null
      }
    }

    // Non-subscribers only see games that are not early_access
    const query = supabase.from('games').select('*').eq('is_active', true)
    const { data } = subscriberTier
      ? await query.order('sort_order', { ascending: true })
      : await query.eq('early_access', false).order('sort_order', { ascending: true })

    games = (data ?? []) as Game[]
  } catch {
    // Missing Supabase env (e.g. Vercel Preview): empty shelf instead of failing the build.
    games = []
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navigation />
      <main style={{ flex: 1 }}>
        <GameConsole games={games} />
      </main>
    </div>
  )
}
