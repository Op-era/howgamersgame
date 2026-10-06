import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client. Safe to call during `next build` / prerender even when
 * NEXT_PUBLIC_SUPABASE_* are unset (Vercel Preview currently has no Preview env vars).
 * Real auth calls still fail at the network layer until the vars are configured.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-missing'
  return createBrowserClient(url, key)
}
