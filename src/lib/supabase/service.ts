import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client with no cookie/session handling. Use for server-to-server work
 * (Stripe webhook, ledger reads) where no user session must ever influence the call.
 * Bypasses RLS. Never import from client components.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service role is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
