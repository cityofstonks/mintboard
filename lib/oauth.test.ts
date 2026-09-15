import test from 'node:test'
import assert from 'node:assert'
import { signState, readState, allows, identityOf, challengeFor, newVerifier, STATE_TTL_MS } from './oauth.ts'

process.env.ADMIN_SECRET ||= 'test-secret-for-oauth'
const NOW = 1_700_000_000_000

/*
 * These guard the admin, and the admin posts @everyone to a Discord server.
 * Every test here is a way somebody could get in who should not.
 */

test('a state we signed round-trips', () => {
  const s = signState('x', 'abc123', NOW)
  const v = readState(s, NOW)
  assert.ok(v.ok)
  assert.equal(v.provider, 'x')
  assert.equal(v.nonce, 'abc123')
})

test('a state we did not sign is refused', () => {
  const v = readState('x.abc123.' + NOW + '.' + 'f'.repeat(64), NOW)
  assert.equal(v.ok, false)
  assert.equal((v as { why: string }).why, 'bad signature')
})

test('the provider cannot be swapped after signing', () => {
  // Signed for google, presented as x. If this passed, a code from one
  // provider could be redeemed against the other's identity lookup.
  const s = signState('google', 'abc123', NOW)
  const swapped = s.replace(/^google\./, 'x.')
  assert.equal(readState(swapped, NOW).ok, false)
})

test('a captured state expires', () => {
  const s = signState('x', 'abc123', NOW - STATE_TTL_MS - 1000)
  const v = readState(s, NOW)
  assert.equal(v.ok, false)
  assert.equal((v as { why: string }).why, 'expired')
})

test('a state from the future is refused', () => {
  const s = signState('x', 'abc123', NOW + 10 * 60_000)
  assert.equal(readState(s, NOW).ok, false)
})

test('garbage is refused rather than thrown at', () => {
  for (const bad of ['', 'x', 'x.y', 'x.y.z', '....', 'x.n.notanumber.deadbeef']) {
    assert.equal(readState(bad, NOW).ok, false, `"${bad}" should not verify`)
  }
})

test('an empty allowlist admits nobody', () => {
  // The dangerous default: "no list means everybody". A missing env var must
  // not become an open admin.
  assert.equal(allows('@fuzz', ''), false)
  assert.equal(allows('ops@example.com', '   '), false)
})

test('the allowlist ignores case and a leading @', () => {
  assert.equal(allows('@Fuzz', 'fuzz'), true)
  assert.equal(allows('fuzz', '@FUZZ'), true)
  assert.equal(allows('OPS@Example.com', 'ops@example.com'), true)
})

test('somebody not on the list is refused', () => {
  assert.equal(allows('@stranger', '@fuzz, ops@example.com'), false)
})

test('a near-miss handle does not get in', () => {
  // Substring matching here would admit @fuzz2 and @notfuzz.
  assert.equal(allows('@fuzz2', '@fuzz'), false)
  assert.equal(allows('@notfuzz', '@fuzz'), false)
  assert.equal(allows('ops@example.com.evil.test', 'ops@example.com'), false)
})

test('an empty identity never matches', () => {
  assert.equal(allows('', '@fuzz'), false)
  assert.equal(allows('@', '@fuzz'), false)
})

test('identity is written so an X handle and an email cannot collide', () => {
  assert.equal(identityOf('x', 'Fuzz'), '@fuzz')
  assert.equal(identityOf('google', 'Ops@Example.com'), 'ops@example.com')
})

test('PKCE challenge is the hash, not the verifier', () => {
  const v = newVerifier()
  const c = challengeFor(v)
  assert.notEqual(v, c)
  assert.equal(c, challengeFor(v), 'must be deterministic')
  assert.ok(!/[+/=]/.test(c), 'must be base64url, not base64')
})
