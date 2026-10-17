import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confirmationEmailHtml, passwordResetEmailHtml } from '../src/lib/resend/templates.ts'

test('confirmation email escapes displayName HTML injection', () => {
  const html = confirmationEmailHtml('<script>alert(1)</script>', 'https://example.com/confirm')
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

test('confirmation email escapes attribute-breaking displayName', () => {
  const html = confirmationEmailHtml('"><img src=x onerror=alert(1)>', 'https://example.com/confirm')
  assert.ok(!html.includes('"><img src=x onerror=alert(1)>'))
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'))
})

test('confirmation email escapes ampersand and quotes in displayName', () => {
  const html = confirmationEmailHtml("Tom & 'Jerry'", 'https://example.com/confirm')
  assert.ok(!html.includes("Tom & 'Jerry'"))
  assert.ok(html.includes('Tom &amp; &#39;Jerry&#39;'))
})

test('confirmation email escapes confirmUrl inside href', () => {
  const html = confirmationEmailHtml('Ann', 'https://example.com/confirm?x="<&')
  assert.ok(!html.includes('href="https://example.com/confirm?x="<&"'))
  assert.ok(html.includes('href="https://example.com/confirm?x=&quot;&lt;&amp;"'))
})

test('confirmation email keeps normal name and URL intact', () => {
  const html = confirmationEmailHtml('Ann', 'https://example.com/confirm?token=abc123')
  assert.ok(html.includes('Hey Ann,'))
  assert.ok(html.includes('href="https://example.com/confirm?token=abc123"'))
})

test('password reset email escapes resetUrl inside href', () => {
  const html = passwordResetEmailHtml('https://example.com/reset?x="<&')
  assert.ok(!html.includes('href="https://example.com/reset?x="<&"'))
  assert.ok(html.includes('href="https://example.com/reset?x=&quot;&lt;&amp;"'))
})

test('password reset email keeps normal URL intact', () => {
  const html = passwordResetEmailHtml('https://example.com/reset?token=abc123')
  assert.ok(html.includes('href="https://example.com/reset?token=abc123"'))
})
