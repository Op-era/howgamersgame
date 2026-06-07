import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkAdmin } from '@/lib/auth/adminCheck'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/upload-game
 * Body: FormData { file: File (zip), slug: string }
 *
 * Accepts a ZIP of game files, extracts them, and uploads to the "games" bucket
 * under games/{slug}/.
 *
 * Returns { url: string } pointing to games/{slug}/index.html
 *
 * NOTE: ZIP extraction is handled client-side via browser FileReader + JSZip,
 * or server-side using the 'jszip' npm package. This route does raw ZIP upload
 * for V1; file-by-file extraction can be added later.
 *
 * For now: uploads the entire zip as a single file. The game must be
 * pre-extracted and uploaded file-by-file via the Supabase dashboard,
 * or the developer can provide a direct index.html URL.
 *
 * TODO (Phase 2): Server-side ZIP extraction with jszip, upload each file individually.
 */
export async function POST(request: NextRequest) {
  const { error } = await checkAdmin()
  if (error) return error

  const form = await request.formData()
  const file = form.get('file') as File | null
  const slug = form.get('slug') as string | null

  if (!file || !slug) {
    return NextResponse.json({ error: 'file and slug are required' }, { status: 400 })
  }

  if (!file.name.endsWith('.zip')) {
    return NextResponse.json({ error: 'Only ZIP files accepted' }, { status: 400 })
  }

  const MAX_MB = 100
  if (file.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `Max ${MAX_MB}MB` }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const supabase = await createAdminClient()

  /* Upload the zip itself — in Phase 2 this will extract first */
  const storagePath = `${slug}/${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('games')
    .upload(storagePath, arrayBuffer, {
      contentType: 'application/zip',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('games')
    .getPublicUrl(storagePath)

  return NextResponse.json({
    url: publicUrl,
    storagePath,
    note: 'ZIP uploaded. Extract and upload individual files via Supabase Storage dashboard, then update game_url to point to index.html.',
  })
}
