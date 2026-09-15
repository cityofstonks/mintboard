import test from 'node:test'
import assert from 'node:assert'
import { judge, explain } from './ownership.ts'

/*
 * This decides who may edit a collection's public details and links. Getting
 * it wrong in one direction hands a project's page to a stranger; in the
 * other it strands the real owner. The tests below are each a way one of
 * those happens.
 */

test('a matching handle is verified, no operator needed', () => {
  const v = judge('@tws_market', { twitter_username: 'tws_market' })
  assert.equal(v.grant, true)
  assert.equal((v as { via: string }).via, 'opensea-x')
})

test('case and a leading @ do not matter', () => {
  assert.equal(judge('TWS_Market', { twitter_username: '@tws_market' }).grant, true)
  assert.equal(judge('@Boilerbrokers', { twitter_username: 'boilerbrokers' }).grant, true)
})

test('a different handle is refused', () => {
  const v = judge('@stranger', { twitter_username: 'tws_market' })
  assert.equal(v.grant, false)
  assert.equal((v as { reason: string }).reason, 'mismatch')
})

test('a near-miss handle is refused', () => {
  // Substring or prefix matching here would hand over the collection.
  for (const h of ['tws_market2', 'tws_marke', 'xtws_market', 'tws-market']) {
    assert.equal(judge(h, { twitter_username: 'tws_market' }).grant, false, `${h} must not match`)
  }
})

test('a failed lookup is UNREACHABLE, never a mismatch', () => {
  // The important one. null means we could not look. Treating that as "no
  // match" is merely annoying; treating it as a match would grant ownership
  // to whoever asked during an outage.
  const v = judge('@anyone', null)
  assert.equal(v.grant, false)
  assert.equal((v as { reason: string }).reason, 'unreachable')
})

test('a collection with no X on file is NO-RECORD, not a mismatch', () => {
  // CannaCats is exactly this: OpenSea resolves nothing useful, so there is
  // no evidence either way and a person has to decide.
  for (const rec of [{ twitter_username: null }, { twitter_username: '' }, {}]) {
    const v = judge('@someone', rec)
    assert.equal(v.grant, false)
    assert.equal((v as { reason: string }).reason, 'no-record')
  }
})

test('an empty signed-in handle never verifies', () => {
  assert.equal(judge('', { twitter_username: 'tws_market' }).grant, false)
  assert.equal(judge('@', { twitter_username: '' }).grant, false)
})

test('an empty handle on both sides does not match itself', () => {
  // The nastiest shape: '' === '' would verify anybody against any
  // collection that has no X account.
  const v = judge('', { twitter_username: '' })
  assert.equal(v.grant, false)
})

test('every refusal tells the person what to do next', () => {
  for (const rec of [null, { twitter_username: 'someone_else' }, { twitter_username: '' }]) {
    const msg = explain(judge('@me', rec))
    assert.ok(/claim|try again/i.test(msg), `unhelpful refusal: ${msg}`)
  }
})

test('a mismatch does not invent a reason to grant', () => {
  const v = judge('@me', { twitter_username: 'them' })
  assert.ok(!('via' in v))
})
