import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto'

/**
 * A password and a signed cookie. No accounts, no database.
 *
 * This guards who can edit the raffle list on a community's own board. It is
 * deliberately small, and it is not an identity system — if several people
 * need separate logins and an audit trail of who changed what, the GitHub
 * commit history already carries that and is the better place to look.
 */
const PASSWORD = process.env.ADMIN_PASSWORD ?? ''
// Falls back to a value derived from the password so the cookie still
// verifies on a deployment where only ADMIN_PASSWORD was set.
const SECRET = process.env.ADMIN_SECRET || (PASSWORD ? `derived:${PASSWORD}` : randomBytes(32).toString('hex'))

export const adminEnabled = () => PASSWORD.length > 0

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('hex')

/** Constant-time, so the comparison cannot be timed character by character. */
function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  if (x.length !== y.length) return false
  return timingSafeEqual(x, y)
}

export function checkPassword(given: string): boolean {
  return adminEnabled() && same(given, PASSWORD)
}

export function issueToken(hours = 12): string {
  const expires = Date.now() + hours * 3600_000
  return `${expires}.${sign(String(expires))}`
}

export function validToken(token: string | undefined): boolean {
  if (!token || !adminEnabled()) return false
  const [expires, mac] = token.split('.')
  if (!expires || !mac) return false
  if (Number(expires) < Date.now()) return false
  return same(mac, sign(expires))
}

export const COOKIE = 'mintboard_admin'
