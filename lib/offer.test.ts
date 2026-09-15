import test from 'node:test'
import assert from 'node:assert'
import { readOffer } from './offer.ts'

/*
 * This function turns a stranger's prose into a number that becomes a public
 * promise: it pre-fills the spot counts an operator approves, and those go out
 * as "20 GUARANTEED SPOTS" to a few thousand people. Guessing HIGH is the
 * expensive direction — a promise you cannot keep — so the rule it must obey
 * is that an unclear offer reads low, never high.
 */

test('the ordinary shape', () => {
  assert.deepEqual(readOffer('50 GTD, 100 FCFS'), { gtd: 50, fcfs: 100 })
})

test('the words people actually use', () => {
  assert.deepEqual(readOffer('20 guaranteed and 50 first come'), { gtd: 20, fcfs: 50 })
  assert.deepEqual(readOffer('15 Godlist / 30 whitelist'), { gtd: 15, fcfs: 30 })
  assert.deepEqual(readOffer('10 OG spots'), { gtd: 10, fcfs: 0 })
  assert.deepEqual(readOffer('25 x WL'), { gtd: 0, fcfs: 25 })
})

test('an unsplit total is treated as first-come, the tier that promises least', () => {
  // "We can do 40 spots" says nothing about guarantees. Reading it as 40 GTD
  // would have us promise a held spot to forty people on the partner's behalf.
  assert.deepEqual(readOffer('we can do 40 spots'), { gtd: 0, fcfs: 40 })
})

test('an offer with no number promises nothing', () => {
  assert.deepEqual(readOffer('a few spots, happy to chat'), { gtd: 0, fcfs: 0 })
  assert.deepEqual(readOffer(''), { gtd: 0, fcfs: 0 })
})

test('it never invents a number larger than one that was written', () => {
  for (const s of ['50 GTD, 100 FCFS', '3 guaranteed', 'maybe 12 wl', '']) {
    const { gtd, fcfs } = readOffer(s)
    const largest = Math.max(0, ...(s.match(/\d+/g) ?? []).map(Number))
    assert.ok(gtd <= largest && fcfs <= largest, `${s} produced a number nobody wrote`)
  }
})

test('a four-digit cap keeps a pasted token id out of the spot count', () => {
  // Somebody pasting "#12345 holders" must not become a 12,345 spot promise.
  const { gtd, fcfs } = readOffer('holders of #123456 get in')
  assert.ok(gtd <= 9999 && fcfs <= 9999)
})
