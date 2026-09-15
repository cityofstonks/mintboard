import test from 'node:test'
import assert from 'node:assert'
import { tierFor, type Tier } from './roles.ts'

const TIERS: Tier[] = [
  { minHeld: 5, roleId: 'master', name: 'Key Master' },
  { minHeld: 1, roleId: 'holder', name: 'Key Holder' },
]

test('five keys or more is a Key Master', () => {
  assert.equal(tierFor(5, TIERS)?.name, 'Key Master')
  assert.equal(tierFor(50, TIERS)?.name, 'Key Master')
})

test('one to four is a Key Holder', () => {
  assert.equal(tierFor(1, TIERS)?.name, 'Key Holder')
  assert.equal(tierFor(4, TIERS)?.name, 'Key Holder')
})

test('holding nothing earns nothing', () => {
  assert.equal(tierFor(0, TIERS), null)
})

test('the richest matching tier wins regardless of the order given', () => {
  // Declared the other way round on purpose: a community editing their config
  // must not be able to change who gets what by reordering a list.
  const reversed: Tier[] = [...TIERS].reverse()
  assert.equal(tierFor(9, reversed)?.name, 'Key Master')
})

test('a negative or broken count never earns a tier', () => {
  for (const bad of [-1, NaN]) assert.equal(tierFor(bad as number, TIERS), null, `${bad}`)
})
