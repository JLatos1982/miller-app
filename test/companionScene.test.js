import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MILLER_COMPANION, staticCompanionPresentation } from '../src/companion/millerCompanionAdapter.js'
import { defineCompanionActor, resolveActorPose } from '../src/companion-core/index.js'

test('portable companion core resolves a static pose without Miller dependencies', () => {
  const actor = defineCompanionActor({
    id: 'test-dog',
    name: 'Test dog',
    poses: { sit: 'sit.png' },
    anchors: { ground: { x: .5, y: .97 } },
    defaultPose: 'sit',
  })
  assert.deepEqual(resolveActorPose(actor), { key: 'sit', asset: 'sit.png' })
})

test('Miller companion remains a static decorative actor with stable anchors', () => {
  assert.equal(MILLER_COMPANION.actorId, 'sheepdog')
  assert.equal(MILLER_COMPANION.pose, 'sit')
  assert.deepEqual(MILLER_COMPANION.anchors.ground, { x: .5, y: .97 })
  assert.equal(staticCompanionPresentation({ reducedMotion: true }).pose, 'sit')
  assert.equal(staticCompanionPresentation({ animationEnabled: false }).decorative, true)
})

test('companion adapter remains outside Miller search and ranking authority', () => {
  const adapter = fs.readFileSync(new URL('../src/companion/millerCompanionAdapter.js', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(adapter, /askMiller|buildMillerRequest|deterministicRelevance|trackEvent/)
  assert.match(app, /<MillerSheepdog\s*\/>/)
  assert.match(app, /askMiller\(buildMillerRequest/)
})
