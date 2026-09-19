import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesMarker, ofCollection } from './inscriptions.ts'

test('a marker matches the end of the genesis txid, not anywhere in it', () => {
  const toad = '81b8b9c2ebc00ca267d1a2d8a7528f6f1555cba548975a96d956843812e370adi0'
  assert.ok(matchesMarker(toad, '70ad'))
  // 70ad appearing early in the id is a different inscription entirely.
  const impostor = '70adb9c2ebc00ca267d1a2d8a7528f6f1555cba548975a96d9568438123456789i0'
  assert.equal(matchesMarker(impostor, '70ad'), false)
})

test('a non-zero inscription index still matches', () => {
  assert.ok(matchesMarker('a'.repeat(60) + '70adi583', '70ad'))
})

test('filtering keeps only the collection asked for', () => {
  const ids = [
    '81b8b9c2ebc00ca267d1a2d8a7528f6f1555cba548975a96d956843812e370adi0',
    '106021a473f4139a436c95444400c28afdff9959486a369039469da1d673c840i0',
  ]
  assert.deepEqual(ofCollection(ids, '70ad'), [ids[0]])
})
