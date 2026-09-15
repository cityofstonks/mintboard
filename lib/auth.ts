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
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [expires, mac] = parts
  if (!expires || !mac) return false
  if (Number(expires) < Date.now()) return false
  return same(mac, sign(expires))
}

export const COOKIE = 'mintboard_admin'
/** Carries the PKCE verifier and nonce between the two legs of a sign-in. */
export const FLOW_COOKIE = 'mintboard_flow'

/**
 * A session that remembers WHO.
 *
 * The password era only had to answer "is this an admin". With identities,
 * every admin action can say whose it was — which is the whole point of
 * replacing a shared password, and shows up in the commit each save makes.
 */
export function issueSession(identity: string, hours = 12): string {
  const expires = Date.now() + hours * 3600_000
  const who = Buffer.from(identity).toString('base64url')
  return `${expires}.${who}.${sign(`${expires}.${who}`)}`
}

/** The identity in a session, or null if it does not verify. */
export function sessionOf(token: string | undefined): string | null {
  if (!token) return null
  const parts = token.split('.')
  // Two parts is the old password-only shape. Still valid, just anonymous.
  if (parts.length === 2) return validToken(token) ? 'password' : null
  if (parts.length !== 3) return null
  const [expires, who, mac] = parts
  if (!expires || !who || !mac) return null
  if (Number(expires) < Date.now()) return null
  if (!same(mac, sign(`${expires}.${who}`))) return null
  try { return Buffer.from(who, 'base64url').toString('utf8') } catch { return null }
}

/** Any valid session, however it was obtained. */
export const signedIn = (token: string | undefined): boolean => sessionOf(token) !== null
