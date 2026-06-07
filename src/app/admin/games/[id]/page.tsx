import { requireAdmin } from '@/lib/auth/adminGuard'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import GameForm from '../GameForm'
import ApiKeyManager from './ApiKeyManager'
import type { Game } from '@/types/game'

export const dynamic = 'force-dynamic'

export default async function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: game } = await supabase.from('games').select('*').eq('id', id).single()
  if (!game) notFound()

  const { data: apiKeys } = await supabase
    .from('game_api_keys')
    .select('id, key_prefix, name, is_active, last_used_at, created_at')
    .eq('game_id', id)
    .order('created_at')

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <GameForm mode="edit" game={game as Game} />
      <div style={{ marginTop: 48 }}>
        <ApiKeyManager gameId={id} apiKeys={apiKeys ?? []} />
      </div>
    </div>
  )
}
