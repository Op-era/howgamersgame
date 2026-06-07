import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export interface AuthResult {
  ok: boolean
  gameId?: string
  gameName?: string
}

export async function verifyGameApiKey(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return { ok: false }

  const rawKey = authHeader.slice(7).trim()
  if (!rawKey) return { ok: false }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const supabase = await createAdminClient()

  const { data } = await supabase
    .from('game_api_keys')
    .select('id, game_id, games(title), is_active')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single()

  if (!data) return { ok: false }

  // Update last_used_at without blocking the response
  supabase
    .from('game_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {})

  const games = data.games as unknown as { title: string } | null
  return {
    ok: true,
    gameId: data.game_id,
    gameName: games?.title,
  }
}
