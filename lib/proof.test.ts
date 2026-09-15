import test from 'node:test'
import assert from 'node:assert'
import { judge, postedAt } from './proof.ts'

const OPEN = Date.parse('2026-09-15T07:42:43Z')
const CLOSE = Date.parse('2026-09-15T19:42:43Z')
const o = { projectHandle: 'richbi11', openedAt: OPEN, closesAt: CLOSE }
// A real id from the Hood Walkers round, posted 07:46 UTC — four minutes in.
const DURING = '2099766870727671817'

test('a post id carries its own timestamp', () => {
  const t = postedAt(DURING)!
  assert.ok(t > OPEN && t < CLOSE, new Date(t).toISOString())
})

test('an ordinary entrant passes', () => {
  const [v] = judge([{ userId: 'u1', url: `https://x.com/0Sakuna/status/${DURING}` }], o)
  assert.equal(v.ok, true)
  assert.equal(v.handle, '0Sakuna')
})

test('query strings do not break the read', () => {
  const [v] = judge([{ userId: 'u1', url: `https://x.com/a/status/${DURING}?s=46&t=HJwBBR` }], o)
  assert.equal(v.ok, true)
})

test("linking the project's own post is refused", () => {
  const [v] = judge([{ userId: 'u1', url: `https://x.com/richbi11/status/${DURING}` }], o)
  assert.equal(v.ok, false)
  assert.match(v.why!, /project/)
})

test('a post from before the raffle cannot be a reply to it', () => {
  // Same id shifted back a day.
  const old = String((BigInt(DURING) >> 22n) - 86_400_000n << 22n)
  const [v] = judge([{ userId: 'u1', url: `https://x.com/a/status/${old}` }], o)
  assert.equal(v.ok, false)
  assert.match(v.why!, /before/)
})

test('two people cannot file the same post', () => {
  const url = `https://x.com/a/status/${DURING}`
  const [a, b] = judge([{ userId: 'u1', url }, { userId: 'u2', url }], o)
  assert.equal(a.ok, true)
  assert.equal(b.ok, false)
  assert.match(b.why!, /same post/)
})

test('one person cannot use two accounts', () => {
  const v = judge([
    { userId: 'u1', url: `https://x.com/same/status/${DURING}` },
    { userId: 'u2', url: `https://x.com/SAME/status/2099774051933880820` },
  ], o)
  assert.equal(v[1].ok, false)
  assert.match(v[1].why!, /same X account/)
})

test('refiling your own link is not treated as a duplicate of yourself', () => {
  const url = `https://x.com/a/status/${DURING}`
  const v = judge([{ userId: 'u1', url }, { userId: 'u1', url }], o)
  assert.equal(v[1].ok, true)
})

test('a profile link is not proof of anything', () => {
  const [v] = judge([{ userId: 'u1', url: 'https://x.com/someone' }], o)
  assert.equal(v.ok, false)
})
