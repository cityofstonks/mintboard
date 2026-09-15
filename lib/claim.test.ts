import test from 'node:test'
import assert from 'node:assert'
import { claimExpired, CLAIM_MINUTES } from './claim.ts'

const at = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString()

test('a fresh claim is provable', () => {
  assert.equal(claimExpired(at(0)), false)
  assert.equal(claimExpired(at(CLAIM_MINUTES - 1)), false)
})

test('an old claim is not', () => {
  // The point of the window: an indefinitely open claim on somebody else's
  // wallet turns a coincidence into a waiting game.
  assert.equal(claimExpired(at(CLAIM_MINUTES + 1)), true)
  assert.equal(claimExpired(at(60 * 24)), true)
})

test('a timestamp we cannot read counts as expired, not as open', () => {
  for (const bad of ['', 'yesterday', 'null']) assert.equal(claimExpired(bad), true, bad)
})
