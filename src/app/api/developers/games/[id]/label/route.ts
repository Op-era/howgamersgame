import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import sharp from 'sharp'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { query } from '@/lib/db/pg'
import { getSessionUser } from '@/lib/auth/session'

/**
 * POST /api/developers/games/[id]/label
 * Upload cartridge label art (900x1670px minimum, PNG or JPG).
 * Composites it onto the blank cartridge template and updates
 * the game's cartridge_label_url.
 */

// Label area on the 1120x2240 blank template
const LABEL_X0 = 108
const LABEL_Y0 = 293
const LABEL_X1 = 1011
const LABEL_Y1 = 1967
const LABEL_W = LABEL_X1 - LABEL_X0
const LABEL_H = LABEL_Y1 - LABEL_Y0

const MIN_W = 900
const MIN_H = 1670

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth: must be logged in
  const user = await getSessionUser().catch(() => null)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify the game belongs to this developer (or user is admin)
  const gameCheck = await query(
    "SELECT id, slug, developer_id FROM games WHERE id = $1",
    [id]
  ).catch(() => ({ rows: [] as unknown[] }))
  const game = (gameCheck.rows[0] as { id: string; slug: string; developer_id: string | null } | undefined)
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }
  // TODO: check developer_id matches user.id or user is admin
  // For now, any logged-in user can update (admin check to be added)

  // Parse the upload
  let buffer: Buffer
  let mimetype: string
  try {
    const formData = await request.formData()
    const file = formData.get('label') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No label file uploaded' }, { status: 400 })
    }
    mimetype = file.type
    if (!['image/png', 'image/jpeg'].includes(mimetype)) {
      return NextResponse.json({ error: 'Label must be PNG or JPG' }, { status: 400 })
    }
    buffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Failed to read upload' }, { status: 400 })
  }

  // Validate dimensions
  let metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    return NextResponse.json({ error: 'Invalid image file' }, { status: 400 })
  }
  if (!metadata.width || !metadata.height || metadata.width < MIN_W || metadata.height < MIN_H) {
    return NextResponse.json(
      { error: `Label art must be at least ${MIN_W}x${MIN_H}px (portrait). Got ${metadata.width}x${metadata.height}.` },
      { status: 400 }
    )
  }

  // Composite onto blank template
  // 1. Resize label art to cover the label area (center-crop)
  const labelResized = await sharp(buffer)
    .resize(LABEL_W, LABEL_H, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer()

  // 2. Load blank template and composite
  const templatePath = join(process.cwd(), 'public', 'images', 'console', 'cartridge-blank.png')
  const composited = await sharp(templatePath)
    .composite([{ input: labelResized, left: LABEL_X0, top: LABEL_Y0 }])
    .png()
    .toBuffer()

  // 3. Save to public/images/cartridges/{slug}.png
  const outDir = join(process.cwd(), 'public', 'images', 'cartridges')
  await mkdir(outDir, { recursive: true })
  const outPath = join(outDir, `${game.slug}.png`)
  await writeFile(outPath, composited)

  // 4. Update DB
  const labelUrl = `/images/cartridges/${game.slug}.png`
  await query("UPDATE games SET cartridge_label_url = $1 WHERE id = $2", [labelUrl, id])

  return NextResponse.json({ ok: true, cartridge_label_url: labelUrl })
}
