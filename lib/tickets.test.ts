import test from 'node:test'
import assert from 'node:assert'
import { ticketsFor, weigh, draw, DEFAULTS } from './tickets.ts'

test('holding nothing still gets the base ticket', () => {
  assert.equal(ticketsFor(0, false, DEFAULTS), 1)
})

test('tickets rise with holdings, then stop at the cap', () => {
  assert.equal(ticketsFor(1, false, DEFAULTS), 2)
  assert.equal(ticketsFor(10, false, DEFAULTS), 11)
  // The whole point of holdCap: 300 is worth the same as 10.
  assert.equal(ticketsFor(300, false, DEFAULTS), ticketsFor(10, false, DEFAULTS))
})

test('the boost multiplies, and is optional', () => {
  assert.equal(ticketsFor(5, false, DEFAULTS), 6)
  assert.equal(ticketsFor(5, true, DEFAULTS), 9)   // 6 × 1.5
})

test('nonsense holdings cannot produce nonsense tickets', () => {
  for (const bad of [-5, NaN, 1.7, Infinity]) {
    const t = ticketsFor(bad as number, false, DEFAULTS)
    assert.ok(Number.isFinite(t) && t >= 1, `${bad} produced ${t}`)
  }
})

test('nobody ends up over the published cap', () => {
  // A whale against nine minnows. Applying the cap once against the RAW total
  // leaves the whale above its own share — this is the bug the loop fixes.
  const entrants = [{ id: 'whale', held: 500, boosted: true }]
  for (let i = 0; i < 9; i++) entrants.push({ id: `m${i}`, held: 0, boosted: false })
  const rows = weigh(entrants, DEFAULTS)
  const total = rows.reduce((a, r) => a + r.tickets, 0)
  for (const r of rows) {
    assert.ok(r.tickets <= Math.ceil(total * DEFAULTS.capShare) + 1,
      `${r.id} holds ${r.tickets} of ${total}, over the 10% cap`)
  }
})

test('a single entrant is not capped to nothing', () => {
  const rows = weigh([{ id: 'only', held: 3, boosted: false }], DEFAULTS)
  assert.equal(rows[0].tickets, 4)
})

test('the same seed always draws the same winners', () => {
  const rows = weigh(
    Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, held: i % 7, boosted: i % 3 === 0 })),
    DEFAULTS)
  const a = draw(rows, 5, 'raffle-123.ledger')
  const b = draw(rows, 5, 'raffle-123.ledger')
  assert.deepEqual(a, b, 'a published seed must be recomputable')
})

test('a different seed draws differently', () => {
  const rows = weigh(Array.from({ length: 30 }, (_, i) => ({ id: `u${i}`, held: 3, boosted: false })), DEFAULTS)
  assert.notDeepEqual(draw(rows, 5, 'seed-a'), draw(rows, 5, 'seed-b'))
})

test('nobody wins twice', () => {
  const rows = weigh(Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, held: 5, boosted: false })), DEFAULTS)
  const won = draw(rows, 10, 'x')
  assert.equal(new Set(won).size, won.length)
})

test('asking for more winners than entrants returns everybody, not a crash', () => {
  const rows = weigh([{ id: 'a', held: 1, boosted: false }, { id: 'b', held: 1, boosted: false }], DEFAULTS)
  assert.equal(draw(rows, 50, 'x').length, 2)
})

test('an empty pool draws nobody rather than throwing', () => {
  assert.deepEqual(draw([], 5, 'x'), [])
})
