export type GameType = 'supabase' | 'external'
export type GameStatus = 'draft' | 'testing' | 'live'

export interface Game {
  id: string
  slug: string
  title: string
  description: string | null
  long_description: string | null
  cover_art_url: string | null
  cartridge_label_url: string | null
  game_url: string
  game_type: GameType
  storage_path: string | null
  genre: string | null
  is_active: boolean
  sort_order: number
  play_count: number
  developer_id: string | null
  status: GameStatus
  revenue_share_pct: number
}

/** The canonical play URL for any game — both hosted and external go through this page */
export function gamePlayUrl(slug: string) {
  return `/play/${slug}`
}

/** Private preview URL for draft/testing games — only visible to the owning developer or an admin */
export function gameTestUrl(slug: string) {
  return `/test/${slug}`
}

/** Public Supabase Storage URL for a game's entry point */
export function storageGameUrl(storagePath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return `${base}/storage/v1/object/public/games/${storagePath}`
}

/** Public Supabase Storage URL for an asset */
export function storageAssetUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  return `${base}/storage/v1/object/public/game-assets/${path}`
}
