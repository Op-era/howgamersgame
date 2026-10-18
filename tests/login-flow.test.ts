import { test } from "node:test"
import assert from "node:assert/strict"
import { scrypt as scryptCallback, randomBytes } from "node:crypto"
import { promisify } from "node:util"
import {
  handleLogin,
  LOGIN_FAILED_MESSAGE,
  type LoginDeps,
  type LoginRow,
} from "../src/lib/auth/loginFlow.ts"
import {
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
  dummyVerify,
} from "../src/lib/auth/passwords.ts"

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>

function makeLegacyHash(password: string): Promise<string> {
  const salt = randomBytes(16)
  return scryptAsync(password, salt, 64).then(
    (derived) => `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`
  )
}

function makeDeps(overrides: Partial<LoginDeps> = {}): LoginDeps & {
  dummyCalls: number
  updateCalls: Array<{ userId: string; oldHash: string; newHash: string }>
} {
  const deps: LoginDeps & {
    dummyCalls: number
    updateCalls: Array<{ userId: string; oldHash: string; newHash: string }>
  } = {
    findByEmail: async () => undefined,
    updatePasswordHash: async () => {},
    verify: verifyPassword,
    dummyVerify: async () => {
      deps.dummyCalls++
    },
    needsRehash: passwordNeedsRehash,
    rehash: hashPassword,
    dummyCalls: 0,
    updateCalls: [],
    ...overrides,
  }
  if (overrides.updatePasswordHash) {
    const original = overrides.updatePasswordHash
    deps.updatePasswordHash = async (userId, oldHash, newHash) => {
      deps.updateCalls.push({ userId, oldHash, newHash })
      await original(userId, oldHash, newHash)
    }
  } else {
    deps.updatePasswordHash = async (userId, oldHash, newHash) => {
      deps.updateCalls.push({ userId, oldHash, newHash })
    }
  }
  return deps
}

test("unknown email returns generic failure and calls dummyVerify", async () => {
  const deps = makeDeps({ findByEmail: async () => undefined })
  const result = await handleLogin(deps, { email: "nobody@example.com", password: "whatever123" })
  assert.deepEqual(result, { status: 401, body: { error: LOGIN_FAILED_MESSAGE } })
  assert.equal(deps.dummyCalls, 1)
})

test("legacy row with null password_hash returns generic failure and calls dummyVerify", async () => {
  const row: LoginRow = { id: "u1", password_hash: null, email_verified_at: null }
  const deps = makeDeps({ findByEmail: async () => row })
  const result = await handleLogin(deps, { email: "legacy@example.com", password: "whatever123" })
  assert.deepEqual(result, { status: 401, body: { error: LOGIN_FAILED_MESSAGE } })
  assert.equal(deps.dummyCalls, 1)
})

test("wrong password returns generic failure and does not call dummyVerify", async () => {
  const passwordHash = await hashPassword("correct-password-123")
  const row: LoginRow = { id: "u1", password_hash: passwordHash, email_verified_at: new Date() }
  const deps = makeDeps({ findByEmail: async () => row })
  const result = await handleLogin(deps, { email: "user@example.com", password: "wrong-password" })
  assert.deepEqual(result, { status: 401, body: { error: LOGIN_FAILED_MESSAGE } })
  assert.equal(deps.dummyCalls, 0)
})

test("correct password + verified returns 200 with userId and no update for current hash", async () => {
  const password = "correct-password-123"
  const passwordHash = await hashPassword(password)
  const row: LoginRow = { id: "u1", password_hash: passwordHash, email_verified_at: new Date() }
  const deps = makeDeps({ findByEmail: async () => row })
  const result = await handleLogin(deps, { email: "user@example.com", password })
  assert.deepEqual(result, { status: 200, body: { ok: true }, userId: "u1" })
  assert.equal(deps.updateCalls.length, 0)
})

test("correct password + unverified returns 403 and no rehash", async () => {
  const password = "correct-password-123"
  const passwordHash = await hashPassword(password)
  const row: LoginRow = { id: "u1", password_hash: passwordHash, email_verified_at: null }
  const deps = makeDeps({ findByEmail: async () => row })
  const result = await handleLogin(deps, { email: "user@example.com", password })
  assert.deepEqual(result, {
    status: 403,
    body: { error: "Please confirm your email first. Check your inbox for the confirmation link." },
  })
  assert.equal(deps.updateCalls.length, 0)
})

test("legacy-format hash with right password logs in and upgrades", async () => {
  const password = "legacy-password-123"
  const legacyHash = await makeLegacyHash(password)
  const row: LoginRow = { id: "u1", password_hash: legacyHash, email_verified_at: new Date() }
  const deps = makeDeps({ findByEmail: async () => row })
  const result = await handleLogin(deps, { email: "user@example.com", password })
  assert.deepEqual(result, { status: 200, body: { ok: true }, userId: "u1" })
  assert.equal(deps.updateCalls.length, 1)
  assert.equal(deps.updateCalls[0].userId, "u1")
  assert.equal(deps.updateCalls[0].oldHash, legacyHash)
  assert.ok(deps.updateCalls[0].newHash.startsWith("scrypt2$"))
  assert.equal(await verifyPassword(password, deps.updateCalls[0].newHash), true)
})

test("throwing updatePasswordHash still returns 200", async () => {
  const password = "legacy-password-123"
  const legacyHash = await makeLegacyHash(password)
  const row: LoginRow = { id: "u1", password_hash: legacyHash, email_verified_at: new Date() }
  const deps = makeDeps({
    findByEmail: async () => row,
    updatePasswordHash: async () => {
      throw new Error("db down")
    },
  })
  const result = await handleLogin(deps, { email: "user@example.com", password })
  assert.deepEqual(result, { status: 200, body: { ok: true }, userId: "u1" })
})

test("invalid email returns 400", async () => {
  const deps = makeDeps()
  const result = await handleLogin(deps, { email: "not-an-email", password: "whatever123" })
  assert.deepEqual(result, { status: 400, body: { error: "Valid email required" } })
})

test("missing password returns 400", async () => {
  const deps = makeDeps()
  const result = await handleLogin(deps, { email: "user@example.com", password: "" })
  assert.deepEqual(result, { status: 400, body: { error: "Password required" } })
})
