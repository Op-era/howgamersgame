import { Pool } from 'pg'

/**
 * Plain Postgres pool for howgamersgame on Fly.io.
 * Replaces @supabase/supabase-js (removed 2026-10-06 — Supabase deleted for cost).
 * Uses DATABASE_URL (set via flyctl secrets from the attached Fly Postgres).
 */

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured')
  }
  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  pool.on('error', (err) => {
    console.error('[pg] unexpected pool error', err)
  })
  return pool
}

/** One-off query helper. */
export async function query<T = unknown>(text: string, params?: unknown[]) {
  const p = getPool()
  return p.query(text, params as never[])
}
