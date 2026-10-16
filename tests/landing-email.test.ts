import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('landing email regex accepts valid emails and rejects invalid ones', () => {
  const source = readFileSync(new URL('../src/components/landing/LandingPage.tsx', import.meta.url), 'utf8')
  const match = source.match(/!\/(\^\[\^[^\n]*?\$)\/\.test\(email\)/)
  assert.ok(match, 'email regex literal not found in LandingPage.tsx')
  const pattern = match[1]
  assert.ok(!pattern.includes('\\\\s'), 'regex must not contain doubled backslashes')
  const re = new RegExp(pattern)

  for (const email of ['a@b.co', 'first.last+tag@example.com', 'player1@mail.example.org']) {
    assert.ok(re.test(email), `should accept ${email}`)
  }
  for (const email of ['', 'plainaddress', 'a@b', '@b.co', 'a b@c.com', 'a@b .co', 'a@@b.co']) {
    assert.ok(!re.test(email), `should reject ${email}`)
  }
})
