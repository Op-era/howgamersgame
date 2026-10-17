import { createHash, randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promisify } from "util"

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options?: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>
const KEYLEN = 64

const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 3
const SCRYPT_MAXMEM = 64 * 1024 * 1024

const COMMON_PASSWORDS = [
  "password123",
  "password1234",
  "password12345",
  "password123456",
  "1234567890",
  "0123456789",
  "12345678901",
  "123456789012",
  "qwertyuiop",
  "qwertyuiop1",
  "qwertyuiop12",
  "qwertyuiop123",
  "iloveyou12",
  "iloveyou123",
  "letmein123",
  "letmein1234",
  "welcome123",
  "welcome1234",
  "1q2w3e4r5t",
  "1q2w3e4r5t6y",
  "1q2w3e4r5t6y7u",
  "1q2w3e4r5t6y7u8i",
  "abc1234567",
  "abcd123456",
  "abcdefg123",
  "abcdefgh123",
  "monkey1234",
  "dragon1234",
  "master1234",
  "shadow1234",
  "superman123",
  "batman1234",
  "football123",
  "baseball123",
  "soccer1234",
  "hockey1234",
  "charlie123",
  "donald1234",
  "michael123",
  "jordan1234",
  "princess123",
  "sunshine123",
  "trustno123",
  "whatever123",
  "freedom123",
  "computer123",
  "internet123",
  "howgamersgame",
  "howgamersgame1",
  "howgamersgame12",
  "howgamersgame123",
  "hgg1234567",
  "hgg12345678",
  "hggpassword",
  "hggpassword1",
]

/**
 * Password hashing for player accounts (Fly Postgres users table).
 * scrypt from node:crypto with a per-password random salt.
 * Stored format: "scrypt2:<N>:<r>:<p>:<saltHex>:<hashHex>".
 * Legacy format: "scrypt:<saltHex>:<hashHex>" (node default cost).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  return `scrypt2$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.startsWith("scrypt2$")) {
      const parts = stored.split("$")
      if (parts.length !== 6) return false
      const N = Number(parts[1])
      const r = Number(parts[2])
      const p = Number(parts[3])
      const saltHex = parts[4]
      const hashHex = parts[5]
      if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
      if (N < 1024 || N > 131072 || (N & (N - 1)) !== 0) return false
      if (r < 1 || r > 16) return false
      if (p < 1 || p > 8) return false
      if (!saltHex || !hashHex) return false
      const salt = Buffer.from(saltHex, "hex")
      const expected = Buffer.from(hashHex, "hex")
      if (salt.length === 0 || expected.length === 0) return false
      const derived = await scryptAsync(password, salt, expected.length, {
        N,
        r,
        p,
        maxmem: SCRYPT_MAXMEM,
      })
      return derived.length === expected.length && timingSafeEqual(derived, expected)
    }

    if (stored.startsWith("scrypt:")) {
      const parts = stored.split(":")
      if (parts.length !== 3) return false
      const salt = Buffer.from(parts[1], "hex")
      const expected = Buffer.from(parts[2], "hex")
      if (salt.length === 0 || expected.length === 0) return false
      const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
      return derived.length === expected.length && timingSafeEqual(derived, expected)
    }

    return false
  } catch {
    return false
  }
}

export function passwordNeedsRehash(stored: string): boolean {
  if (!stored.startsWith("scrypt2$")) return true
  const parts = stored.split("$")
  if (parts.length !== 6) return true
  const N = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return true
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return true
  if (!parts[4] || !parts[5]) return true
  return false
}

export function validatePassword(password: string, email?: string): string | null {
  if (password.length < 10) {
    return "Password must be at least 10 characters."
  }
  if (password.length > 128) {
    return "Password must be 128 characters or fewer."
  }

  const lower = password.toLowerCase()
  if (COMMON_PASSWORDS.some((p) => p.toLowerCase() === lower)) {
    return "That password is too common. Choose a less guessable one."
  }

  if (password.split("").every((c) => c === password[0])) {
    return "That password is too common. Choose a less guessable one."
  }

  if (email) {
    const lowerEmail = email.toLowerCase()
    const localPart = lowerEmail.split("@")[0]
    if (lower === lowerEmail || lower === localPart) {
      return "Password cannot be your email address."
    }
  }

  return null
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

let dummyHashPromise: Promise<string> | null = null

/**
 * Verifies the supplied password against a lazily created, module-cached
 * scrypt2 hash of a random string, so unknown-account logins do equal work.
 */
export async function dummyVerify(password: string): Promise<void> {
  try {
    if (!dummyHashPromise) {
      dummyHashPromise = hashPassword(randomBytes(32).toString("hex"))
    }
    const stored = await dummyHashPromise
    await verifyPassword(password, stored)
  } catch {
    // never throw
  }
}
