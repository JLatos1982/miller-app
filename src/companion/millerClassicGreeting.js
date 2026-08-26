import { defineCompanionSequence, nextSequenceIndex, sequenceStep } from '../companion-core/index.js'

// Presentation only. It starts after the bounded dog-arrival sequence and
// never receives input, search, ranking, result, resource, or API state.
export const MILLER_CLASSIC_GREETING = defineCompanionSequence({
  id: 'miller-classic-sheepdog-greeting',
  reducedMotionStep: 'settled',
  steps: [
    { id: 'seated-pause', pose: 'neutral', duration: 420 },
    { id: 'notice-dog', pose: 'noticeDog', duration: 500 },
    { id: 'lean-reach', pose: 'leanReach', duration: 620 },
    { id: 'pet-dog', pose: 'petDog', duration: 1600 },
    // The lean pose intentionally serves in reverse for this small rise.
    { id: 'rise', pose: 'leanReach', duration: 620 },
    { id: 'settled', pose: 'neutral', settle: true },
  ],
})

export function millerClassicGreetingStep(index, preferences = {}) {
  return sequenceStep(MILLER_CLASSIC_GREETING, index, preferences)
}

export function nextMillerClassicGreetingIndex(index) {
  return nextSequenceIndex(MILLER_CLASSIC_GREETING, index)
}
