import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scryptAsync = promisify(scrypt)
const KEYLEN = 64

/**
 * Password hashing for player accounts (Fly Postgres users table).
 * scrypt from node:crypto with a per-password random salt.
 * Stored format: "scrypt:<saltHex>:<hashHex>".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":")
  if (parts.length !== 3 || parts[0] !== "scrypt") return false
  const salt = Buffer.from(parts[1], "hex")
  const expected = Buffer.from(parts[2], "hex")
  if (expected.length === 0) return false
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/**
 * One-time action tokens (email verification, password reset).
 * The raw value travels in the emailed link; only its SHA-256 hash is stored.
 */
export function createActionToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex")
  return { raw, hash: hashToken(raw) }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}
