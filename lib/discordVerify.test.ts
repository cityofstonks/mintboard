import test from 'node:test'
import assert from 'node:assert'
import { generateKeyPairSync, sign } from 'node:crypto'
import { verifyInteraction } from './discordVerify.ts'

// A throwaway Ed25519 pair standing in for Discord's.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pubHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex')
const signAs = (ts: string, body: string) =>
  sign(null, Buffer.from(ts + body), privateKey).toString('hex')

const BODY = JSON.stringify({ type: 1 })
const TS_ = '1700000000'

test('a genuine signature verifies', () => {
  assert.equal(verifyInteraction(BODY, signAs(TS_, BODY), TS_, pubHex), true)
})

test('a tampered body does not', () => {
  // The attack this exists to stop: replay a valid signature with a different
  // payload — entering a raffle as somebody else.
  const sig = signAs(TS_, BODY)
  assert.equal(verifyInteraction(JSON.stringify({ type: 3, hacked: true }), sig, TS_, pubHex), false)
})

test('a moved timestamp does not', () => {
  assert.equal(verifyInteraction(BODY, signAs(TS_, BODY), '1700009999', pubHex), false)
})

test('a signature from another key does not', () => {
  const other = generateKeyPairSync('ed25519')
  const sig = sign(null, Buffer.from(TS_ + BODY), other.privateKey).toString('hex')
  assert.equal(verifyInteraction(BODY, sig, TS_, pubHex), false)
})

test('missing pieces are refused, not thrown at', () => {
  const sig = signAs(TS_, BODY)
  assert.equal(verifyInteraction('', sig, TS_, pubHex), false)
  assert.equal(verifyInteraction(BODY, '', TS_, pubHex), false)
  assert.equal(verifyInteraction(BODY, sig, '', pubHex), false)
  assert.equal(verifyInteraction(BODY, sig, TS_, ''), false)
})

test('garbage is refused rather than throwing a 500', () => {
  // A throw here becomes a 500, and Discord reads 500 as "retry" rather than
  // "no" — so a malformed attack would be retried at us indefinitely.
  for (const bad of ['zz', 'nothex', '0'.repeat(127), '0'.repeat(129)]) {
    assert.equal(verifyInteraction(BODY, bad, TS_, pubHex), false, `sig "${bad}"`)
    assert.equal(verifyInteraction(BODY, signAs(TS_, BODY), TS_, bad), false, `key "${bad}"`)
  }
})
