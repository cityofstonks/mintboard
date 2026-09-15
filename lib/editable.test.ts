import test from 'node:test'
import assert from 'node:assert'
import { onlyEditable } from './editable.ts'

/*
 * onlyEditable is the gate between a JSON body somebody posted and an UPDATE
 * on a row they own. Everything it lets through is written. The tests are
 * therefore mostly about what must NOT get through.
 */

test('the ordinary fields pass', () => {
  const out = onlyEditable({ name: 'Wall Street', blurb: 'Traders.', icon: '📈' })
  assert.deepEqual(out, { name: 'Wall Street', blurb: 'Traders.', icon: '📈' })
})

test('ownership fields cannot be set by the person being checked', () => {
  // The whole point. If owner_id came through, editing your own collection
  // would let you hand it to yourself — or to anyone.
  const out = onlyEditable({
    name: 'Mine', owner_id: 'some-uuid', verified_via: 'operator',
    verified_at: new Date().toISOString(), id: 'another-collection',
  })
  assert.deepEqual(out, { name: 'Mine' })
  assert.ok(!('owner_id' in out) && !('verified_via' in out) && !('id' in out))
})

test('an unknown field is dropped rather than passed through', () => {
  const out = onlyEditable({ name: 'X', created_at: '1999-01-01', nonsense: true })
  assert.deepEqual(out, { name: 'X' })
})

test('an empty string becomes null, so a link can be removed', () => {
  // Otherwise a cleared field writes '' and the card renders an empty link.
  const out = onlyEditable({ discord_url: '', opensea_url: null })
  assert.deepEqual(out, { discord_url: null, opensea_url: null })
})

test('a field that was not sent is left alone', () => {
  // A patch of one field must not blank the other seven.
  const out = onlyEditable({ blurb: 'just this' })
  assert.deepEqual(Object.keys(out), ['blurb'])
})

test('the X handle is normalised on the way in', () => {
  assert.equal(onlyEditable({ x_handle: '@TWS_Market' }).x_handle, 'tws_market')
  assert.equal(onlyEditable({ x_handle: '  Boilerbrokers ' }).x_handle, 'boilerbrokers')
})

test('a very long value is truncated rather than rejected', () => {
  const out = onlyEditable({ blurb: 'a'.repeat(5000) })
  assert.equal((out.blurb as string).length, 600)
})

test('values are coerced to strings, so an object cannot reach the database', () => {
  const out = onlyEditable({ name: { toString: () => 'ok' } as unknown as string })
  assert.equal(typeof out.name, 'string')
})
