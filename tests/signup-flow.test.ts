import { test } from "node:test"
import assert from "node:assert/strict"
import {
  handleSignup,
  SIGNUP_OK,
  type SignupStore,
  type SignupUserRow,
} from "../src/lib/auth/signupFlow.ts"

interface FakeRow extends SignupUserRow {
  reset_token_hash: string | null
  reset_expires_at: Date | null
}

class FakeStore implements SignupStore {
  rows = new Map<string, FakeRow>()
  private seq = 0

  async findByEmail(email: string): Promise<SignupUserRow | undefined> {
    for (const row of this.rows.values()) {
      if (row.id.startsWith(email)) return row
    }
    return undefined
  }

  async createUser(
    email: string,
    displayName: string,
    resetTokenHash: string,
    resetExpires: Date
  ): Promise<void> {
    const id = `${email}:${++this.seq}`
    this.rows.set(id, {
      id,
      display_name: displayName,
      password_hash: null,
      email_verified_at: null,
      reset_token_hash: resetTokenHash,
      reset_expires_at: resetExpires,
    })
  }

  async setResetToken(userId: string, resetTokenHash: string, resetExpires: Date): Promise<void> {
    const row = this.rows.get(userId)
    if (!row) throw new Error("row not found")
    row.reset_token_hash = resetTokenHash
    row.reset_expires_at = resetExpires
  }
}

function makeDeps(store: FakeStore, emails: { to: string; url: string }[], failEmail = false) {
  let tokenSeq = 0
  return {
    store,
    createToken() {
      tokenSeq++
      return { raw: `raw-token-${tokenSeq}`, hash: `hash-token-${tokenSeq}` }
    },
    async sendEmail(to: string, displayName: string, url: string) {
      if (failEmail) throw new Error("mail down")
      emails.push({ to, url })
    },
    defer(fn: () => Promise<void>) {
      void fn().catch(() => {})
    },
    appUrl: "https://example.test",
    now: () => 1_700_000_000_000,
  }
}

test("new email creates one row with no password and sends one email with token link", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)

  const res = await handleSignup(deps, { email: "New@Example.com", username: "  Neo  " })

  assert.deepEqual(res, SIGNUP_OK)
  assert.equal(store.rows.size, 1)
  const row = [...store.rows.values()][0]
  assert.equal(row.password_hash, null)
  assert.equal(row.display_name, "Neo")
  assert.equal(row.email_verified_at, null)
  assert.equal(row.reset_token_hash, "hash-token-1")
  assert.equal(emails.length, 1)
  assert.equal(emails[0].to, "new@example.com")
  assert.ok(emails[0].url.includes("raw-token-1"))
  assert.ok(emails[0].url.includes("welcome=1"))
})

test("verified existing row is untouched, zero emails, response identical", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)
  const before: FakeRow = {
    id: "a@b.com:1",
    display_name: "Alice",
    password_hash: "scrypt:abc:def",
    email_verified_at: new Date(),
    reset_token_hash: "old-hash",
    reset_expires_at: new Date(1_600_000_000_000),
  }
  store.rows.set(before.id, { ...before })

  const res = await handleSignup(deps, { email: "a@b.com", username: "Attacker" })

  assert.deepEqual(res, SIGNUP_OK)
  assert.deepEqual(store.rows.get(before.id), before)
  assert.equal(emails.length, 0)
})

test("unverified row with password_hash: only reset token changes, one email", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)
  const before: FakeRow = {
    id: "u@b.com:1",
    display_name: "Uma",
    password_hash: "scrypt:old:hash",
    email_verified_at: null,
    reset_token_hash: "old-hash",
    reset_expires_at: new Date(1_600_000_000_000),
  }
  store.rows.set(before.id, { ...before })

  const res = await handleSignup(deps, { email: "u@b.com", username: "Attacker" })

  assert.deepEqual(res, SIGNUP_OK)
  const after = store.rows.get(before.id)!
  assert.equal(after.password_hash, before.password_hash)
  assert.equal(after.display_name, before.display_name)
  assert.equal(after.email_verified_at, before.email_verified_at)
  assert.equal(after.reset_token_hash, "hash-token-1")
  assert.ok(after.reset_expires_at)
  assert.equal(after.reset_expires_at.getTime(), 1_700_000_000_000 + 24 * 60 * 60 * 1000)
  assert.equal(emails.length, 1)
  assert.equal(emails[0].to, "u@b.com")
  assert.ok(emails[0].url.includes("raw-token-1"))
})

test("legacy row with null password_hash: password/display/verified unchanged, only reset token changes", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)
  const before: FakeRow = {
    id: "legacy@b.com:1",
    display_name: null,
    password_hash: null,
    email_verified_at: null,
    reset_token_hash: "old-hash",
    reset_expires_at: new Date(1_600_000_000_000),
  }
  store.rows.set(before.id, { ...before })

  const res = await handleSignup(deps, { email: "legacy@b.com", username: "Attacker" })

  assert.deepEqual(res, SIGNUP_OK)
  const after = store.rows.get(before.id)!
  assert.equal(after.password_hash, null)
  assert.equal(after.display_name, null)
  assert.equal(after.email_verified_at, null)
  assert.equal(after.reset_token_hash, "hash-token-1")
  assert.equal(emails.length, 1)
  assert.equal(emails[0].to, "legacy@b.com")
})

test("invalid email returns 400", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)

  const res = await handleSignup(deps, { email: "not-an-email" })

  assert.equal(res.status, 400)
  assert.deepEqual(res.body, { error: "Please enter a valid email address." })
  assert.equal(store.rows.size, 0)
  assert.equal(emails.length, 0)
})

test("failing sendEmail does not change the response", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails, true)

  const res = await handleSignup(deps, { email: "fail@b.com" })

  assert.deepEqual(res, SIGNUP_OK)
  assert.equal(store.rows.size, 1)
  assert.equal(emails.length, 0)
})

test("email lookup is case-insensitive", async () => {
  const store = new FakeStore()
  const emails: { to: string; url: string }[] = []
  const deps = makeDeps(store, emails)
  const before: FakeRow = {
    id: "a@b.com:1",
    display_name: "Alice",
    password_hash: "scrypt:abc:def",
    email_verified_at: new Date(),
    reset_token_hash: "old-hash",
    reset_expires_at: new Date(1_600_000_000_000),
  }
  store.rows.set(before.id, { ...before })

  const res = await handleSignup(deps, { email: "A@B.com" })

  assert.deepEqual(res, SIGNUP_OK)
  assert.equal(emails.length, 0)
  assert.deepEqual(store.rows.get(before.id), before)
})
