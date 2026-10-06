import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server Supabase client. When NEXT_PUBLIC_SUPABASE_* are missing (e.g. Vercel Preview
 * with production-only env), we still construct a client so static generation does not
 * crash; fetches against the placeholder fail and callers should treat empty data as OK.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-missing'

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}

export async function createAdminClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Admin paths are dynamic / behind auth; throwing here is fine and preferred to
  // silently acting with a placeholder service role.
  if (!url || !key) throw new Error('Supabase service role is not configured')

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {}
      },
    },
  })
}
