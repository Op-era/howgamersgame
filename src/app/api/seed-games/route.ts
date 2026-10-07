import { NextResponse } from 'next/server'
import { query } from '@/lib/db/pg'

/** Temporary seed endpoint — removes after use */
export async function POST() {
  try {
    // Activate Neon Snake
    await query(
      "UPDATE games SET is_active = TRUE, game_url = $1, sort_order = 2 WHERE slug = $2",
      ['/games/snake/index.html', 'neon-snake']
    )

    // Add Chris's Tic Tactical Toe
    await query(
      `INSERT INTO games (slug, title, description, game_url, game_type, is_active, sort_order, play_count, status)
       VALUES ($1, $2, $3, $4, $5, TRUE, 1, 0, $6)
       ON CONFLICT (slug) DO UPDATE SET
         is_active = TRUE,
         game_url = $4,
         sort_order = 1`,
      [
        'chris-tic-tactical-toe',
        "Chris's Tic Tactical Toe",
        'Strategic grid battles with AI opponents. Place and move pieces on a tactical grid.',
        '/games/tic-tactical-toe/index.html',
        'external',
        'live',
      ]
    )

    const r = await query("SELECT slug, title, is_active, sort_order FROM games ORDER BY sort_order")
    return NextResponse.json({ ok: true, games: r.rows })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 })
  }
}
