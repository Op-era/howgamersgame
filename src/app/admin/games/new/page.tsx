import { requireAdmin } from '@/lib/auth/adminGuard'
import GameForm from '../GameForm'

export default async function NewGamePage() {
  await requireAdmin()
  return <GameForm mode="create" />
}
