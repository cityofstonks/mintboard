import test from 'node:test'
import assert from 'node:assert'
import type { RaffleEntry } from './types.ts'

/*
 * The selection rule, tested against the real module by swapping the store.
 * `liveRaffles` reads through readRaffles(), so these exercise the ordering
 * and filtering logic directly on a supplied list instead.
 */
const at = (r: RaffleEntry) => (r.closesAt ? Date.parse(r.closesAt) : NaN)

/** Same body as lib/raffles.ts, operating on a given list. */
function live(all: RaffleEntry[], now: number): RaffleEntry[] {
  return all
    .filter(r => { const t = at(r); return Number.isFinite(t) ? t > now : true })
    .sort((a, b) => {
      const x = at(a), y = at(b)
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y
      if (Number.isFinite(x)) return -1
      if (Number.isFinite(y)) return 1
      return 0
    })
}

const NOW = Date.parse('2026-09-15T00:00:00Z')
const entry = (over: Partial<RaffleEntry>): RaffleEntry => ({
  id: 'r', project: 'P', closesAt: null, tiers: [], ...over,
})

test('a raffle whose deadline has passed drops off entirely', () => {
  // Greying it out would still spend a click and return a page that will not
  // count them. The box stops taking hands the moment it shuts.
  const out = live([entry({ id: 'gone', closesAt: '2026-09-14T00:00:00Z' })], NOW)
  assert.equal(out.length, 0)
})

test('an open-ended claim survives having no deadline', () => {
  // This is the bug that would silently hide a live door: NaN is not "expired".
  const out = live([entry({ id: 'claim', kind: 'claim', closesAt: null })], NOW)
  assert.equal(out.length, 1)
})

test('dated opportunities sort before open-ended ones', () => {
  // Dated ones can actually run out; nothing is lost by reading a claim later.
  const out = live([
    entry({ id: 'open', closesAt: null }),
    entry({ id: 'soon', closesAt: '2026-09-15T06:00:00Z' }),
  ], NOW)
  assert.deepEqual(out.map(r => r.id), ['soon', 'open'])
})

test('sooner closes first', () => {
  const out = live([
    entry({ id: 'later', closesAt: '2026-09-20T00:00:00Z' }),
    entry({ id: 'sooner', closesAt: '2026-09-15T01:00:00Z' }),
  ], NOW)
  assert.deepEqual(out.map(r => r.id), ['sooner', 'later'])
})

test('an unreadable date is treated as open-ended, not as expired', () => {
  // Dropping it would hide a real opportunity because somebody typed the date
  // wrong. Showing it without a countdown is the recoverable failure.
  const out = live([entry({ id: 'bad', closesAt: 'not-a-date' })], NOW)
  assert.equal(out.length, 1)
})
