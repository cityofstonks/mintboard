import { test } from 'node:test'
import assert from 'node:assert/strict'
import { holdRate, claimRate, headline, byRetention } from './outcomes.ts'
import type { SpotOutcome } from './types.ts'

const base: SpotOutcome = {
  code: 'TOAD', name: 'Toadstools', spots: 25, checked: 25, minted: 18, held: 18,
  sold: 0, neverMinted: 7, unreadable: 0, chain: 'bitcoin', scannedAt: '', method: '',
}

test('hold rate is of those who minted, not of the spots given', () => {
  assert.equal(holdRate(base), 100)
  assert.equal(claimRate(base), 72)
})

test('a mint nobody claimed has no hold rate, and must never read as 0%', () => {
  // 0% would say everybody sold. Nobody did — nobody minted.
  assert.equal(holdRate({ ...base, minted: 0, held: 0, neverMinted: 25 }), null)
  assert.match(headline({ ...base, minted: 0, held: 0, neverMinted: 25 }), /none claimed/)
})

test('unreadable wallets never count as sold', () => {
  const o = { ...base, checked: 23, unreadable: 2, minted: 16, held: 16, neverMinted: 7 }
  assert.equal(holdRate(o), 100)
  assert.match(headline(o), /2 unreadable/)
})

test('the headline states the gap rather than hiding it', () => {
  assert.doesNotMatch(headline(base), /unreadable/)
  assert.match(headline(base), /18 still holding · 0 sold · 100% hold rate/)
})

test('an unclaimed mint sorts last, not first', () => {
  const none = { ...base, code: 'X', minted: 0, held: 0 }
  const bad = { ...base, code: 'Y', minted: 10, held: 1 }
  assert.deepEqual([none, bad].sort(byRetention).map(o => o.code), ['Y', 'X'])
})
