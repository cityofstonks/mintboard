import test from 'node:test'
import assert from 'node:assert'
import { readAddress, isTaproot } from './bitcoin.ts'

test('a real taproot address can hold an inscription', () => {
  for (const a of [
    'bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06',
    'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
  ]) assert.equal(isTaproot(a), true, a)
})

test('a bc1q segwit address is refused by name, not as a typo', () => {
  // The mistake people actually make. Calling it "invalid" would send them
  // hunting for a mistyped character that is not there.
  const r = readAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')
  assert.equal(r.kind, 'segwit')
  assert.equal(r.canHoldInscription, false)
  assert.match(r.why!, /bc1p/)
})

test('a legacy address is refused as legacy', () => {
  const r = readAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')
  assert.equal(r.kind, 'legacy')
  assert.equal(r.canHoldInscription, false)
})

test('one wrong character is caught by the checksum', () => {
  const good = 'bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06'
  assert.equal(isTaproot(good), true)
  // Swap a single character in the middle. Without a checksum this reads as a
  // perfectly ordinary address, and the inscription is gone.
  const typo = good.slice(0, 20) + (good[20] === 'q' ? 'p' : 'q') + good.slice(21)
  assert.notEqual(typo, good)
  const r = readAddress(typo)
  assert.equal(r.canHoldInscription, false)
  assert.match(r.why!, /checksum|typo/)
})

test('BIP-350 invalid vectors are all refused', () => {
  // Straight from the specification. Each one is a way a hand-rolled decoder
  // quietly accepts something it must not.
  for (const bad of [
    'bc1p38j9r5y49hruaue7wxjce0updqjuyyx0kh56v8s25huc6995vvpql3jow4',   // invalid character
    'BC130XLXVLHEMJA6C4DQV22UAPCTQUPFHLXM9H8Z3K2E72Q4K9HCZ7VQ7ZWS8R',    // invalid witness version
    'bc1pw5dgrnzv',                                                      // program too short
    'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7v8n0nx0muaewav253zgeav',  // too long
    'bc1qw508d6qejxtdg4y5r3zarvaryvqyzf3du',                             // wrong checksum constant
    'tb1z0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq24jc47',    // witness v2 not taproot
    'bc1gmk9yu',                                                         // empty data
  ]) assert.equal(isTaproot(bad), false, bad)
})

test('mixed case is refused', () => {
  const r = readAddress('bc1PXaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06')
  assert.equal(r.canHoldInscription, false)
  assert.match(r.why!, /case/)
})

test('all upper case is the same address', () => {
  const a = 'bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06'
  assert.equal(isTaproot(a.toUpperCase()), true)
})

test('an EVM address is not mistaken for Bitcoin', () => {
  assert.equal(isTaproot('0xf7d0080a40d8478bb0f8958573968486ee274845'), false)
})

test('whitespace around a pasted address is forgiven', () => {
  assert.equal(isTaproot('  bc1pxaneaf3w4d27hl2y93fuft2xk6m4u3wc4rafevc6slgd7f5tq2dqyfgy06\n'), true)
})

test('empty and junk say why without throwing', () => {
  for (const s of ['', '   ', 'hello', 'bc1', '1', 'bc1p']) {
    const r = readAddress(s)
    assert.equal(r.canHoldInscription, false, s)
    assert.ok(r.why, `no reason given for "${s}"`)
  }
})
