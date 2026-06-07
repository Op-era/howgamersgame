import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await checkAdmin()
  if (error) return error

  const { id: gameId } = await params
  const { name } = await request.json()

  /* Generate a secure random key: hgg_ prefix + 40 hex chars */
  const rawKey = `hgg_${crypto.randomBytes(20).toString('hex')}`
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 12)

  const supabase = await createAdminClient()
  const { data: record, error: dbError } = await supabase
    .from('game_api_keys')
    .insert({
      game_id: gameId,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      name: name ?? 'Default',
      is_active: true,
    })
    .select('id, key_prefix, name, is_active, last_used_at, created_at')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

  /* Return the raw key once — never stored */
  return NextResponse.json({ key: rawKey, record }, { status: 201 })
}
