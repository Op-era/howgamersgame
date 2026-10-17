import { test } from "node:test"
import assert from "node:assert/strict"
import {
  handleResetRequest,
  RESET_OK,
  NO_ACCOUNT_ID,
  type ResetStore,
  type ResetDeps,
} from "../src/lib/auth/resetFlow.ts"

interface FakeStoreCall {
  userId: string
  resetTokenHash: string
  resetExpires: Date
}

class FakeStore implements ResetStore {
  users: Map<string, { id: string }>
  calls: FakeStoreCall[] = []

  constructor(emails: string[]) {
    this.users = new Map(emails.map((email) => [email, { id: `user-${email}` }]))
  }

  async findByEmail(email: string) {
    return this.users.get(email)
  }

  async setResetToken(userId: string, resetTokenHash: string, resetExpires: Date) {
    this.calls.push({ userId, resetTokenHash, resetExpires })
  }
}

function makeDeps(store: FakeStore, overrides: Partial<ResetDeps> = {}): ResetDeps {
  const raw = "raw-token"
  const hash = "hash-token"
  return {
    store,
    createToken: () => ({ raw, hash }),
    sendEmail: async () => {},
    defer: (fn) => {
      void fn().catch(() => {})
    },
    appUrl: "https://example.com",
    now: () => 1_700_000_000_000,
    ...overrides,
  }
}

test("existing and unknown emails return deep-equal RESET_OK", async () => {
  const store = new FakeStore(["user@example.com"])
  const deps = makeDeps(store)

  const existing = await handleResetRequest(deps, { email: "user@example.com" })
  const unknown = await handleResetRequest(deps, { email: "nobody@example.com" })

  assert.deepEqual(existing, RESET_OK)
  assert.deepEqual(unknown, RESET_OK)
})

test("unknown email: setResetToken called once with NO_ACCOUNT_ID and no email sent", async () => {
  const store = new FakeStore([])
  let emailSent = false
  const deps = makeDeps(store, {
    sendEmail: async () => {
      emailSent = true
    },
  })

  const result = await handleResetRequest(deps, { email: "nobody@example.com" })

  assert.deepEqual(result, RESET_OK)
  assert.equal(store.calls.length, 1)
  assert.equal(store.calls[0].userId, NO_ACCOUNT_ID)
  assert.equal(store.calls[0].resetTokenHash, "hash-token")
  assert.equal(store.calls[0].resetExpires.getTime(), 1_700_000_000_000 + 60 * 60 * 1000)
  assert.equal(emailSent, false)
})

test("existing: setResetToken with row id, one email whose url contains the raw token and '/auth/reset?token='", async () => {
  const store = new FakeStore(["user@example.com"])
  const sent: { to: string; url: string }[] = []
  const deps = makeDeps(store, {
    sendEmail: async (to, url) => {
      sent.push({ to, url })
    },
  })

  const result = await handleResetRequest(deps, { email: "user@example.com" })

  assert.deepEqual(result, RESET_OK)
  assert.equal(store.calls.length, 1)
  assert.equal(store.calls[0].userId, "user-user@example.com")
  assert.equal(store.calls[0].resetTokenHash, "hash-token")
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, "user@example.com")
  assert.ok(sent[0].url.includes("/auth/reset?token="))
  assert.ok(sent[0].url.includes("raw-token"))
})

test("a throwing sendEmail does not change the response (defer awaits and swallows)", async () => {
  const store = new FakeStore(["user@example.com"])
  const deps = makeDeps(store, {
    sendEmail: async () => {
      throw new Error("mail failed")
    },
  })

  const result = await handleResetRequest(deps, { email: "user@example.com" })

  assert.deepEqual(result, RESET_OK)
})

test("invalid email -> 400", async () => {
  const store = new FakeStore([])
  const deps = makeDeps(store)

  const result = await handleResetRequest(deps, { email: "not-an-email" })

  assert.equal(result.status, 400)
  assert.deepEqual(result.body, { error: "Please enter a valid email address." })
  assert.equal(store.calls.length, 0)
})

test("email case-insensitive", async () => {
  const store = new FakeStore(["user@example.com"])
  const sent: { to: string; url: string }[] = []
  const deps = makeDeps(store, {
    sendEmail: async (to, url) => {
      sent.push({ to, url })
    },
  })

  const result = await handleResetRequest(deps, { email: "  USER@Example.COM  " })

  assert.deepEqual(result, RESET_OK)
  assert.equal(store.calls.length, 1)
  assert.equal(store.calls[0].userId, "user-user@example.com")
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, "user@example.com")
})
