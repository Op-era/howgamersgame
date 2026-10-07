import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'
import LandingPage from '@/components/landing/LandingPage'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Logged-in users go straight to the console room
  const user = await getSessionUser().catch(() => null)
  if (user) {
    redirect('/console')
  }

  return <LandingPage />
}
