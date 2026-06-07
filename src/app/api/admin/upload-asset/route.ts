import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/upload-asset
 * Body: FormData { file: File, path: string }
 *
 * Uploads a cover art or label image to the "game-assets" Supabase Storage bucket.
 * Returns { url: string }
 */
export async function POST(request: NextRequest) {
  const { error } = await checkAdmin()
  if (error) return error

  const form = await request.formData()
  const file = form.get('file') as File | null
  const path = form.get('path') as string | null

  if (!file || !path) {
    return NextResponse.json({ error: 'file and path are required' }, { status: 400 })
  }

  const allowed = ['image/png', 'image/webp', 'image/jpeg', 'image/gif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, WebP, JPEG, GIF allowed' }, { status: 400 })
  }

  const MAX_MB = 10
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Max ${MAX_MB}MB` }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const supabase = await createAdminClient()

  const { error: uploadError } = await supabase.storage
    .from('game-assets')
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('game-assets')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl })
}
