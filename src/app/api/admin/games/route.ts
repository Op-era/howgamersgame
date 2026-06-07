import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { error } = await checkAdmin()
  if (error) return error

  const body = await request.json()
  const supabase = await createAdminClient()

  const { data, error: dbError } = await supabase
    .from('games')
    .insert({
      slug: body.slug,
      title: body.title,
      description: body.description || null,
      long_description: body.long_description || null,
      genre: body.genre || null,
      game_type: body.game_type ?? 'external',
      game_url: body.game_url,
      cover_art_url: body.cover_art_url || null,
      cartridge_label_url: body.cartridge_label_url || null,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ game: data }, { status: 201 })
}
