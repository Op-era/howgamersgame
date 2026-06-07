import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/games
 * Returns all active games (public endpoint).
 */
export async function GET() {
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('games')
    .select('id, slug, title, description, genre, cover_art_url, cartridge_label_url, sort_order, play_count')
    .eq('is_active', true)
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ games: data })
}
