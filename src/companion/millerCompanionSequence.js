import { defineCompanionSequence, nextSequenceIndex, sequenceStep } from '../companion-core/index.js'

// Presentation only: this sequence never receives input, search, ranking,
// result, resource, clinical, analytics, or safety state from Miller.
export const MILLER_DOG_ARRIVAL = defineCompanionSequence({
  id: 'miller-dog-arrival',
  reducedMotionStep: 'settled',
  steps: [
    { id: 'hidden', pose: 'sit', duration: 850 },
    { id: 'walk-1', pose: 'walk-1', duration: 650, movement: { kind: 'approach' } },
    { id: 'walk-2', pose: 'walk-2', duration: 650, movement: { kind: 'approach' } },
    { id: 'walk-1b', pose: 'walk-1', duration: 650, movement: { kind: 'approach' } },
    { id: 'walk-2b', pose: 'walk-2', duration: 650, movement: { kind: 'approach' } },
    { id: 'walk-1c', pose: 'walk-1', duration: 550, movement: { kind: 'approach' } },
    { id: 'settled', pose: 'sit', settle: true },
  ],
})

export function millerDogArrivalStep(index, preferences = {}) {
  return sequenceStep(MILLER_DOG_ARRIVAL, index, preferences)
}

export function nextMillerDogArrivalIndex(index) {
  return nextSequenceIndex(MILLER_DOG_ARRIVAL, index)
}

export function millerDogIsTraveling(step) {
  return step?.movement?.kind === 'approach'
}
