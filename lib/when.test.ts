import test from 'node:test'
import assert from 'node:assert'
import { stateOf, bucketOf } from './when.ts'

/*
 * When a mint is, and whether it is still open.
 *
 * The expensive direction is always the same: telling somebody a window has
 * passed when it has not, or showing them nothing when they do qualify. A
 * board that is merely late is recoverable; a board that says "no" is not,
 * because nobody goes back to check.
 */
const NOW = Date.parse('2026-09-15T12:00:00Z')
const iso = (h: number) => new Date(NOW + h * 3600_000).toISOString()

test('a mint with no date announced is TBD, never treated as passed', () => {
  // null is "not announced", not "zero" — the same rule as an unreadable
  // balance. Sorting an undated mint into the past hides it completely.
  assert.equal(stateOf(null, NOW), 'tbd')
  assert.equal(bucketOf(null, NOW), 'tbd')
})

test('a window that has opened reads as live', () => {
  assert.equal(stateOf(iso(-0.5), NOW), 'live')
})

test('a window still ahead is soon, not live', () => {
  assert.equal(stateOf(iso(2), NOW), 'soon')
})

test('a mint stays live for a grace period rather than vanishing on the minute', () => {
  // Mints run late and people arrive late. Dropping the row the instant the
  // clock ticks over takes the details away from somebody mid-mint.
  assert.equal(stateOf(iso(-6), NOW), 'live')
})

test('an explicit close ends it, and only then', () => {
  assert.equal(stateOf(iso(-2), NOW, iso(-1)), 'closed')
  assert.equal(stateOf(iso(-2), NOW, iso(1)), 'live')
})

test('buckets put the urgent things first', () => {
  assert.equal(bucketOf(iso(-0.2), NOW), 'live')
  assert.equal(bucketOf(iso(0.5), NOW), 'hour')
  assert.equal(bucketOf(iso(5), NOW), 'today')
})

test('an unreadable date does not silently become the epoch', () => {
  // Date.parse returns NaN, and NaN compared against anything is false — the
  // classic way a broken date quietly sorts as 1970 and reads as long gone.
  const s = stateOf('not-a-date', NOW)
  assert.ok(s === 'tbd' || s === 'soon', `a bad date read as "${s}"`)
})
