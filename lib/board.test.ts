import test from 'node:test'
import assert from 'node:assert'
import { wonIn } from './won.ts'
import spots from '../data/spots.json' with { type: 'json' }

const lists = spots as Record<string, { wallets: string[] }>
const someWinner = Object.values(lists).flatMap(l => l.wallets)[0]
const won = (a: string) => wonIn(lists, a)

test('a wallet on a spot list is recognised as a winner', () => {
  assert.equal(won(someWinner), true)
})

test('case never decides whether somebody won', () => {
  // People paste addresses in whatever case their wallet shows them.
  assert.equal(won(someWinner.toUpperCase()), true)
  assert.equal(won(someWinner.toLowerCase()), true)
})

test('a wallet that won nothing is not a winner', () => {
  assert.equal(won('0x' + '0'.repeat(40)), false)
})

test('junk does not throw', () => {
  for (const s of ['', 'not-an-address', '0x']) assert.equal(won(s), false, s)
})

test('every Toadstools winner can open the board', () => {
  /*
   * The bug this file exists for, reported by an actual winner: the gate asked
   * the chain how many keys the wallet holds, so anybody drawn a spot who was
   * not currently a Key Master was told the board is "for Key Masters" — shut
   * out of the one page that tells them what they won.
   */
  for (const w of lists['toadstools-spots'].wallets) {
    assert.equal(won(w), true, w)
  }
})
