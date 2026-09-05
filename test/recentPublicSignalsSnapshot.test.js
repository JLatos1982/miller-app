import assert from 'node:assert/strict'
import test from 'node:test'
import { RECENT_PUBLIC_SIGNALS_SNAPSHOT } from '../src/data/recent-public-signals-v1.js'

test('Recent Public Signals snapshot is bounded and allowlisted', () => {
  assert.ok(RECENT_PUBLIC_SIGNALS_SNAPSHOT.signals.length <= 10)
  const allowed = new Set(['signal_id', 'source_title', 'source_organization', 'source_type', 'public_url', 'province', 'date', 'date_type', 'listening_status', 'community_material'])
  for (const signal of RECENT_PUBLIC_SIGNALS_SNAPSHOT.signals) {
    assert.match(signal.public_url, /^https:\/\//)
    for (const key of Object.keys(signal)) assert.ok(allowed.has(key), key)
  }
})
