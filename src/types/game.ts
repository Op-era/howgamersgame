export interface Game {
  id: string
  slug: string
  title: string
  description: string | null
  long_description: string | null
  cover_art_url: string | null
  cartridge_label_url: string | null
  game_url: string
  genre: string | null
  sort_order: number
  play_count: number
}
