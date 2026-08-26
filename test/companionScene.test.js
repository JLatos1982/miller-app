import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MILLER_CHARACTER_INTERACTION, MILLER_COMPANION, staticCompanionPresentation } from '../src/companion/millerCompanionAdapter.js'
import { defineCompanionActor, resolveActorPose } from '../src/companion-core/index.js'
import { MILLER_DOG_ARRIVAL, millerDogArrivalStep, millerDogIsTraveling, nextMillerDogArrivalIndex } from '../src/companion/millerCompanionSequence.js'

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

test('dog arrival is bounded and settles without a continuing timer step', () => {
  let index = 0
  const phases = []
  while (true) {
    const step = millerDogArrivalStep(index)
    phases.push(step.id)
    if (step.settle) break
    index = nextMillerDogArrivalIndex(index)
  }
  assert.deepEqual(phases, ['hidden', 'walk-1', 'walk-2', 'walk-1b', 'walk-2b', 'walk-1c', 'settled'])
  assert.equal(millerDogIsTraveling(millerDogArrivalStep(1)), true)
  assert.equal(millerDogArrivalStep(index).duration, 0)
  assert.equal(millerDogArrivalStep(0, { reducedMotion: true }).id, 'settled')
  assert.equal(MILLER_DOG_ARRIVAL.steps.at(-1).pose, 'sit')
})

test('Miller interaction artwork fails safely to the static companion tableau', () => {
  assert.equal(MILLER_CHARACTER_INTERACTION.supportsNotice, false)
  assert.equal(MILLER_CHARACTER_INTERACTION.supportsPetting, false)
  assert.equal(MILLER_CHARACTER_INTERACTION.fallback, 'static-companion-tableau')
})

test('companion adapter remains outside Miller search and ranking authority', () => {
  const adapter = fs.readFileSync(new URL('../src/companion/millerCompanionAdapter.js', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(adapter, /askMiller|buildMillerRequest|deterministicRelevance|trackEvent/)
  assert.match(app, /<MillerSheepdog\s*\/>/)
  assert.match(app, /askMiller\(buildMillerRequest/)
  assert.match(app, /name: "Classic"/)
  assert.match(app, /name: "North"/)
})
