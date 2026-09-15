import test from 'node:test'
import assert from 'node:assert'
import { drawTiers, splitMessage, seedFor, announcement, type Tier } from './close.ts'
import { DEFAULTS } from './tickets.ts'

// Real Discord snowflakes, because their length is what decides whether an
// announcement overflows — the bug this file exists for was a length bug.
const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(1549324848331755531n + BigInt(i)), held: (i % 12) + 1, boosted: i % 3 === 0,
  }))

test('a tier never hands out more spots than it has', () => {
  const r = drawTiers(people(28), [{ label: 'Spots', count: 20 }], DEFAULTS, 'seed')
  assert.equal(r.tiers[0].winners.length, 20)
})

test('nobody wins twice across tiers', () => {
  const tiers: Tier[] = [{ label: 'Guaranteed', count: 10 }, { label: 'FCFS', count: 15 }]
  const r = drawTiers(people(30), tiers, DEFAULTS, 'seed')
  const all = r.tiers.flatMap(t => t.winners)
  assert.equal(new Set(all).size, all.length)
})

test('fewer entrants than seats fills what it can and reports the rest', () => {
  const r = drawTiers(people(6), [{ label: 'Spots', count: 20 }], DEFAULTS, 'seed')
  assert.equal(r.tiers[0].winners.length, 6)
  assert.equal(r.short, 14)
})

test('the same seed draws the same winners, a different one does not', () => {
  const t: Tier[] = [{ label: 'Spots', count: 5 }]
  const a = drawTiers(people(40), t, DEFAULTS, 'x')
  assert.deepEqual(drawTiers(people(40), t, DEFAULTS, 'x').tiers[0].winners, a.tiers[0].winners)
  assert.notDeepEqual(drawTiers(people(40), t, DEFAULTS, 'y').tiers[0].winners, a.tiers[0].winners)
})

test('the seed cannot be shopped — it is fixed before the draw', () => {
  assert.equal(seedFor('r1', '2026-09-15T19:42:43Z', 1), seedFor('r1', '2026-09-15T19:42:43Z', 1))
  assert.notEqual(seedFor('r1', '2026-09-15T19:42:43Z', 1), seedFor('r1', '2026-09-15T19:42:43Z', 2))
})

test('an oversized announcement splits instead of throwing', () => {
  // The bug this exists for: 2,000 chars threw, and the throw was read
  // upstream as "zero eligible entrants". Two full pools went undrawn.
  const r = drawTiers(people(300), [{ label: 'Spots', count: 200 }], DEFAULTS, 'seed')
  const text = announcement('Hood Walkers', r, [{ label: 'Spots', count: 200 }], 'https://x.test/b')
  assert.ok(text.length > 2000, 'test needs an oversized message')
  const parts = splitMessage(text)
  assert.ok(parts.length > 1)
  for (const p of parts) assert.ok(p.length <= 1900, `${p.length}`)
  assert.equal(parts.join('\n'), text, 'splitting must lose nothing')
})

test('no winner is ever tagged by half a mention', () => {
  // The hard cut slices mid-string. If a mentions line ever grows past the
  // limit, a winner is silently turned into text and never pinged.
  const r = drawTiers(people(400), [{ label: 'Spots', count: 400 }], DEFAULTS, 'seed')
  const text = announcement('Big', r, [{ label: 'Spots', count: 400 }], 'https://x.test/b')
  const parts = splitMessage(text)
  const tagged = parts.flatMap(p => [...p.matchAll(/<@(\d+)>/g)].map(m => m[1]))
  assert.deepEqual(new Set(tagged), new Set(r.tiers[0].winners))
})

test('a single unsplittable line is cut, never dropped', () => {
  const parts = splitMessage('x'.repeat(5000), 1900)
  assert.equal(parts.join('').length, 5000)
})

test('every winner is tagged', () => {
  const r = drawTiers(people(28), [{ label: 'Spots', count: 20 }], DEFAULTS, 'seed')
  const text = announcement('Hood Walkers', r, [{ label: 'Spots', count: 20 }], 'https://x.test/b')
  for (const id of r.tiers[0].winners) assert.ok(text.includes(`<@${id}>`), id)
})

test('an empty tier says so rather than looking like a successful draw of nobody', () => {
  const r = drawTiers([], [{ label: 'Spots', count: 20 }], DEFAULTS, 'seed')
  const text = announcement('Ghost', r, [{ label: 'Spots', count: 20 }], 'https://x.test/b')
  assert.match(text, /nobody entered/)
})
