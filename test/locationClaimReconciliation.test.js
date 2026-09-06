import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileSamePublicLocation } from '../server/locationClaimReconciliation.js'

const geo = address => ({ standardized_address: address, coordinates: { latitude: 49.2827, longitude: -123.1094 } })
test('recognizes same location normalization without raw-string equality', () => assert.equal(reconcileSamePublicLocation({ existingAddress: 'Lower Mainland Regional Office, 520 Richards Street', existingGeocode: geo('520 Richards St, Vancouver, BC'), proposedAddress: '520 Richards Street', proposedGeocode: geo('520 Richards St, Vancouver, BC') }), 'same_location_normalization'))
test('holds materially different or coordinate-divergent addresses', () => {
  assert.equal(reconcileSamePublicLocation({ existingAddress: '1275A 7th Avenue', existingGeocode: geo('1275A 7th Ave, Hope, BC'), proposedAddress: '1081 Burrard Street', proposedGeocode: geo('1081 Burrard St, Vancouver, BC') }), 'material_location_conflict')
  assert.equal(reconcileSamePublicLocation({ existingAddress: '520 Richards Street', existingGeocode: geo('520 Richards St, Vancouver, BC'), proposedAddress: '520 Richards Street', proposedGeocode: { ...geo('520 Richards St, Vancouver, BC'), coordinates: { latitude: 49.1, longitude: -123.1 } } }), 'cannot_reconcile')
})
