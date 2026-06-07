import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await checkAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json()
  const supabase = await createAdminClient()

  const { data, error: dbError } = await supabase
    .from('games')
    .update({
      slug: body.slug,
      title: body.title,
      description: body.description || null,
      long_description: body.long_description || null,
      genre: body.genre || null,
      game_type: body.game_type,
      game_url: body.game_url,
      cover_art_url: body.cover_art_url || null,
      cartridge_label_url: body.cartridge_label_url || null,
      sort_order: body.sort_order,
      is_active: body.is_active,
    })
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ game: data })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await checkAdmin()
  if (error) return error

  const { id } = await params
  const supabase = await createAdminClient()

  await supabase.from('games').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
