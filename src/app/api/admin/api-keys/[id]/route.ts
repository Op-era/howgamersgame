import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await checkAdmin()
  if (error) return error

  const { id } = await params
  const supabase = await createAdminClient()
  await supabase.from('game_api_keys').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}
