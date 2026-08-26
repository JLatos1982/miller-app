import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { destinationBesideRenderedResult, MILLER_CHARACTER_INTERACTION, MILLER_COMPANION, staticCompanionPresentation } from '../src/companion/millerCompanionAdapter.js'
import { defineCompanionActor, resolveActorPose } from '../src/companion-core/index.js'
import { MILLER_DOG_ARRIVAL, millerDogArrivalStep, millerDogIsTraveling, nextMillerDogArrivalIndex } from '../src/companion/millerCompanionSequence.js'
import { MILLER_CLASSIC_GREETING, millerClassicGreetingStep, nextMillerClassicGreetingIndex } from '../src/companion/millerClassicGreeting.js'
import { MILLER_DESKTOP_COMPANION_LAYOUT, resolveDesktopPetContact } from '../src/companion/millerCompanionLayout.js'
import { acceptsNewPresentationIntent, isMeaningfulCompanionInput, jogDurationForDistance, mayTravelToResult, MILLER_PRESENTATION_INTENTS, presentationIntent } from '../src/companion/millerCompanionLifecycle.js'

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

test('Classic interaction artwork is registered while other themes retain the static companion tableau', () => {
  assert.equal(MILLER_CHARACTER_INTERACTION.classic.supportsNotice, true)
  assert.equal(MILLER_CHARACTER_INTERACTION.classic.supportsPetting, true)
  assert.deepEqual(MILLER_CHARACTER_INTERACTION.classic.anchors.ground, { x: .5, y: .97 })
  assert.deepEqual(MILLER_CHARACTER_INTERACTION.classic.anchors.petHand, { x: .17, y: .71 })
  assert.equal(MILLER_CHARACTER_INTERACTION.fallback, 'static-companion-tableau')
})

test('desktop companion layout keeps a larger dog on the shared ground and within pet-contact tolerance', () => {
  const contact = resolveDesktopPetContact()
  assert.deepEqual(MILLER_DESKTOP_COMPANION_LAYOUT.frame, { width: 300, height: 450 })
  assert.deepEqual(MILLER_DESKTOP_COMPANION_LAYOUT.dog, { width: 180, height: 175, left: -150, bottom: 8.25, entranceOffsetX: -60 })
  assert.ok(Math.abs(contact.delta.x) < 1, `pet contact horizontal delta: ${contact.delta.x}`)
  assert.ok(Math.abs(contact.delta.y) < 5, `pet contact vertical delta: ${contact.delta.y}`)
  assert.ok(Math.abs(contact.groundDeltaY) < 1, `ground delta: ${contact.groundDeltaY}`)
})

test('typing awareness is session-sized and carries no query text into the companion intent', () => {
  assert.equal(isMeaningfulCompanionInput(' a '), false)
  assert.equal(isMeaningfulCompanionInput('help'), true)
  const intent = presentationIntent(4, MILLER_PRESENTATION_INTENTS.INPUT_STARTED)
  assert.deepEqual(intent, { id: 4, type: 'input_started', actorId: 'sheepdog', target: null, relationship: 'beside' })
  assert.equal(JSON.stringify(intent).includes('help'), false)
  assert.equal(acceptsNewPresentationIntent(4, intent), false)
  assert.equal(acceptsNewPresentationIntent(3, intent), true)
  assert.equal(presentationIntent(5, 'not-a-companion-intent'), null)
})

test('host converts only a visible rendered result rectangle into safe geometry', () => {
  const hostRect = { left: 20, top: 40, right: 1020, width: 1000, height: 1200 }
  const resultRect = { left: 80, top: 430, right: 620, bottom: 760, width: 540, height: 330 }
  const target = destinationBesideRenderedResult({ hostRect, resultRect, viewport: { width: 1280, height: 900 } })
  assert.ok(target && target.x > .6 && target.x < 1 && target.y > 0 && target.y < 1)
  assert.deepEqual(Object.keys(target).sort(), ['x', 'y'])
  assert.equal(destinationBesideRenderedResult({ hostRect, resultRect: { ...resultRect, top: 1000, bottom: 1200 }, viewport: { width: 1280, height: 900 } }), null)
  assert.equal(destinationBesideRenderedResult({ hostRect, resultRect, viewport: { width: 390, height: 844 } }), null)
})

test('jog duration is bounded and reduced-motion or mobile travel fails safely', () => {
  assert.equal(jogDurationForDistance(0), 700)
  assert.equal(jogDurationForDistance(10000), 1800)
  assert.equal(mayTravelToResult({ target: { x: .7, y: .5 }, viewportWidth: 1280 }), true)
  assert.equal(mayTravelToResult({ target: { x: .7, y: .5 }, viewportWidth: 390 }), false)
  assert.equal(mayTravelToResult({ target: { x: .7, y: .5 }, viewportWidth: 1280, reducedMotion: true }), false)
})

test('Classic greeting is bounded, uses the calm dog reaction only during petting, and settles', () => {
  let index = 0
  const phases = []
  while (true) {
    const step = millerClassicGreetingStep(index)
    phases.push(step.id)
    if (step.settle) break
    index = nextMillerClassicGreetingIndex(index)
  }
  assert.deepEqual(phases, ['seated-pause', 'notice-dog', 'lean-reach', 'pet-dog', 'rise', 'settled'])
  assert.equal(millerClassicGreetingStep(3).pose, 'petDog')
  assert.equal(millerClassicGreetingStep(index).duration, 0)
  assert.equal(MILLER_CLASSIC_GREETING.steps.reduce((total, step) => total + step.duration, 0), 3760)
  assert.equal(millerClassicGreetingStep(0, { reducedMotion: true }).id, 'settled')
})

test('companion adapter remains outside Miller search and ranking authority', () => {
  const adapter = fs.readFileSync(new URL('../src/companion/millerCompanionAdapter.js', import.meta.url), 'utf8')
  const sheepdog = fs.readFileSync(new URL('../src/companion/MillerSheepdog.jsx', import.meta.url), 'utf8')
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(adapter, /askMiller|buildMillerRequest|deterministicRelevance|trackEvent/)
  assert.doesNotMatch(sheepdog, /askMiller|buildMillerRequest|deterministicRelevance|resource-card/)
  assert.match(app, /<MillerSheepdog\s+themeName=/)
  assert.match(app, /askMiller\(buildMillerRequest/)
  assert.match(app, /name: "Classic"/)
  assert.match(app, /name: "North"/)
  assert.doesNotMatch(app, /name: "Gold"/)
  assert.doesNotMatch(app, /Classic Miller Interaction Pose Sheet\.png/)
})
