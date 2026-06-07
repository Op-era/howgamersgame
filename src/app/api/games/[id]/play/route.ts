import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createAdminClient()

  const { data: game } = await supabase
    .from('games')
    .select('play_count')
    .eq('id', id)
    .single()

  if (game) {
    await supabase
      .from('games')
      .update({ play_count: game.play_count + 1 })
      .eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
