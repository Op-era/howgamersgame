import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, scrypt as nodeScrypt } from "node:crypto"
import { promisify } from "node:util"
import {
  createActionToken,
  dummyVerify,
  hashPassword,
  hashToken,
  passwordNeedsRehash,
  validatePassword,
  verifyPassword,
} from "../src/lib/auth/passwords"

const scryptAsync = promisify(nodeScrypt)

test("new hash starts with scrypt2$32768$8$3$ and verifies", async () => {
  const stored = await hashPassword("correct horse battery staple")
  assert.ok(stored.startsWith("scrypt2$32768$8$3$"))
  assert.equal(await verifyPassword("correct horse battery staple", stored), true)
})

test("wrong password fails", async () => {
  const stored = await hashPassword("correct horse battery staple")
  assert.equal(await verifyPassword("wrong password here", stored), false)
})

test("legacy hash still verifies and needs rehash", async () => {
  const salt = randomBytes(16)
  const derived = (await scryptAsync("legacy password", salt, 64)) as Buffer
  const legacy = `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`
  assert.equal(await verifyPassword("legacy password", legacy), true)
  assert.equal(await verifyPassword("wrong password", legacy), false)
  assert.equal(passwordNeedsRehash(legacy), true)
})

test("fresh hash does not need rehash", async () => {
  const stored = await hashPassword("correct horse battery staple")
  assert.equal(passwordNeedsRehash(stored), false)
})

test("malformed and out-of-bounds strings return false without throwing", async () => {
  const cases = [
    "scrypt2$1$8$1$aa$bb",
    "garbage",
    "",
    "scrypt2$32768$8$3$$",
    "scrypt2$32768$8$3$aa$",
    "scrypt2$32768$8$3$$bb",
    "scrypt2$32768$8$3$zz$bb",
    "scrypt2$32768$8$3$aa$zz",
    "scrypt2$2048$8$3$aa$bb",
    "scrypt2$32768$0$3$aa$bb",
    "scrypt2$32768$17$3$aa$bb",
    "scrypt2$32768$8$0$aa$bb",
    "scrypt2$32768$8$9$aa$bb",
    "scrypt2$32768$8$3$aa$bb$extra",
    "scrypt:aa",
    "scrypt:aa:bb:cc",
    "scrypt::bb",
    "scrypt:aa:",
  ]
  for (const stored of cases) {
    assert.equal(await verifyPassword("anything", stored), false)
  }
})

test("two hashes of the same password differ", async () => {
  const a = await hashPassword("correct horse battery staple")
  const b = await hashPassword("correct horse battery staple")
  assert.notEqual(a, b)
})

test("validatePassword enforces length rules", () => {
  assert.equal(validatePassword("short"), "Password must be at least 10 characters.")
  assert.equal(validatePassword("a".repeat(129)), "Password must be 128 characters or fewer.")
  assert.equal(validatePassword("a".repeat(128)), null)
})

test("validatePassword rejects common passwords", () => {
  for (const p of ["password123", "1234567890", "qwertyuiop", "iloveyou12", "letmein123", "welcome123", "password1234", "0123456789", "1q2w3e4r5t", "howgamersgame", "howgamersgame1", "hggpassword1"]) {
    assert.equal(validatePassword(p), "That password is too common. Choose a less guessable one.")
  }
})

test("validatePassword rejects all-identical characters", () => {
  assert.equal(validatePassword("aaaaaaaaaa"), "That password is too common. Choose a less guessable one.")
})

test("validatePassword rejects email or local part", () => {
  assert.equal(validatePassword("player@example.com", "player@example.com"), "Password cannot be your email address.")
  assert.equal(validatePassword("PLAYER@EXAMPLE.COM", "player@example.com"), "Password cannot be your email address.")
  assert.equal(validatePassword("player", "player@example.com"), "Password cannot be your email address.")
  assert.equal(validatePassword("PLAYER", "player@example.com"), "Password cannot be your email address.")
})

test("validatePassword accepts a good passphrase", () => {
  assert.equal(validatePassword("correct horse battery staple"), null)
})

test("createActionToken and hashToken work", () => {
  const { raw, hash } = createActionToken()
  assert.equal(raw.length, 64)
  assert.equal(hash, hashToken(raw))
})

test("dummyVerify resolves", async () => {
  await dummyVerify("some password")
})
