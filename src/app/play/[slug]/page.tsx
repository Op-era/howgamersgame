import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/types/game'
import PlayClient from './PlayClient'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('games').select('title, description').eq('slug', slug).single()
  if (!data) return {}
  return {
    title: `${data.title} — HowGamersGame`,
    description: data.description ?? undefined,
  }
}

export default async function PlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!data) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  let coinBalance = 0
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('coin_balance')
      .eq('id', user.id)
      .single()
    coinBalance = profile?.coin_balance ?? 0
  }

  return (
    <PlayClient
      game={data as Game}
      userId={user?.id ?? null}
      initialCoins={coinBalance}
    />
  )
}
