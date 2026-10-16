import { timingSafeEqual } from 'node:crypto'

export function isAuthorizedCron(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authorizationHeader) return false

  const expected = `Bearer ${secret}`
  const a = Buffer.from(expected)
  const b = Buffer.from(authorizationHeader)

  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
