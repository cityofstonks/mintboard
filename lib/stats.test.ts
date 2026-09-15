import test from 'node:test'
import assert from 'node:assert'
import { shares, byRetention } from './stats.ts'
import type { HolderStats } from './types.ts'

const row = (over: Partial<HolderStats>): HolderStats => ({
  handle: 'x', collection: 'X', minted: 10, held: 5, boughtMore: 1, keysNow: 12,
  scannedAt: '2026-09-15T00:00:00Z', atBlock: 1, ...over,
})

/*
 * SOLD / HOLD / GOLD. These numbers are shown to people deciding whether to
 * spend their holders' attention on a partner, and they are shown ABOUT a
 * partner — so overstating how much a room flipped is the expensive error.
 */

test('HOLD and SOLD are shares of the wallets that minted, and sum to 100', () => {
  const s = shares(row({ minted: 33, held: 14 }))
  assert.equal(s.held, 42)
  assert.equal(s.sold, 58)
  assert.equal(s.held + s.sold, 100)
})

test('GOLD is measured against the same cohort but is not part of the bar', () => {
  // A wallet can sell the one it minted and still buy three on secondary, so
  // GOLD overlaps both segments. Adding it to the bar would count those
  // wallets twice and quietly shrink SOLD — the number a partner most wants
  // shrunk.
  const s = shares(row({ minted: 33, held: 14, boughtMore: 5 }))
  assert.equal(s.boughtMore, 15)
  assert.equal(s.held + s.sold, 100, 'the bar must still sum to 100 without GOLD')
})

test('a room where nobody held reads as 100% SOLD, not as missing data', () => {
  const s = shares(row({ minted: 13, held: 0, boughtMore: 0 }))
  assert.equal(s.held, 0)
  assert.equal(s.sold, 100)
})

test('a cohort of zero cannot divide by zero', () => {
  const s = shares(row({ minted: 0, held: 0, boughtMore: 0 }))
  assert.ok(Number.isFinite(s.held) && Number.isFinite(s.sold))
})

test('best-held first, because that is the order somebody picking a partner reads in', () => {
  const out = byRetention([
    row({ handle: 'weak', minted: 50, held: 4 }),
    row({ handle: 'strong', minted: 16, held: 8 }),
    row({ handle: 'middle', minted: 33, held: 14 }),
  ])
  assert.deepEqual(out.map(r => r.handle), ['strong', 'middle', 'weak'])
})

test('ranking is by rate, not by raw count', () => {
  // 33 of 85 is a worse room than 8 of 16, despite holding four times as many.
  const out = byRetention([
    row({ handle: 'big', minted: 85, held: 33 }),
    row({ handle: 'small', minted: 16, held: 8 }),
  ])
  assert.equal(out[0].handle, 'small')
})

test('sorting does not mutate the caller\'s array', () => {
  const input = [row({ handle: 'a', held: 1 }), row({ handle: 'b', held: 9 })]
  const before = input.map(r => r.handle)
  byRetention(input)
  assert.deepEqual(input.map(r => r.handle), before)
})

test('a room below the floor is not listed to projects', async () => {
  const { standing } = await import('./stats.ts')
  // Robin Rabbits: 4 of 53. A real record, and a poor one.
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 53, held: 4, boughtMore: 1 } as never), 'below-floor')
})

test('a strong room is listed', async () => {
  const { standing } = await import('./stats.ts')
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 288, held: 191, boughtMore: 38 } as never), 'listed')
})

test('too small to measure is not the same as measured and poor', async () => {
  const { standing } = await import('./stats.ts')
  /*
   * The failure this prevents: a brand new community with three mints and one
   * seller reads as 33%, and two mints with no sellers reads as perfect. If
   * "too few to judge" collapsed into "below the floor", every community too
   * new to have a record would be quietly delisted — the opposite of the
   * point.
   */
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 3, held: 0, boughtMore: 0 } as never), 'too-few')
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 2, held: 2, boughtMore: 0 } as never), 'too-few')
})

test('exactly at the floor is listed, not cut', async () => {
  const { standing } = await import('./stats.ts')
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 100, held: 20, boughtMore: 0 } as never), 'listed')
  assert.equal(standing({ handle: 'x', collection: 'x', minted: 100, held: 19, boughtMore: 0 } as never), 'below-floor')
})

test('the real dataset splits the way we expect', async () => {
  const { listable } = await import('./stats.ts')
  const rows = (await import('../data/holder-stats.json', { with: { type: 'json' } })).default as never[]
  const shown = listable(rows)
  assert.ok(shown.length > 0 && shown.length < rows.length, `${shown.length} of ${rows.length}`)
  for (const r of shown) assert.ok((r as never as { held: number; minted: number }).held /
    (r as never as { minted: number }).minted >= 0.2)
})
