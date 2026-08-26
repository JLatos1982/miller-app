// Reviewed, bounded presentation-only gait for Classic Miller's reading
// position. Translation runs continuously for the full sequence while these
// approved frames provide the gait; pose changes never own actor position.
export const MILLER_CLASSIC_READING_WALK = Object.freeze({
  steps: Object.freeze([
    Object.freeze({ id: 'step-left-01a', pose: 'stepLeft01', duration: 210 }),
    Object.freeze({ id: 'step-left-02a', pose: 'stepLeft02', duration: 210 }),
    Object.freeze({ id: 'step-left-01b', pose: 'stepLeft01', duration: 210 }),
    Object.freeze({ id: 'step-left-02b', pose: 'stepLeft02', duration: 210 }),
    Object.freeze({ id: 'settled', pose: 'neutral', duration: 80, settle: true }),
  ]),
  returnSteps: Object.freeze([
    Object.freeze({ id: 'return-step-left-02a', pose: 'stepLeft02', duration: 210 }),
    Object.freeze({ id: 'return-step-left-01a', pose: 'stepLeft01', duration: 210 }),
    Object.freeze({ id: 'return-step-left-02b', pose: 'stepLeft02', duration: 210 }),
    Object.freeze({ id: 'return-step-left-01b', pose: 'stepLeft01', duration: 210 }),
    Object.freeze({ id: 'home', pose: 'neutral', duration: 80, settle: true }),
  ]),
})

export const MILLER_CLASSIC_READING_WALK_DURATION = 920

export function millerClassicWalkStep(index = 0, { returning = false } = {}) {
  const steps = returning ? MILLER_CLASSIC_READING_WALK.returnSteps : MILLER_CLASSIC_READING_WALK.steps
  return steps[Math.max(0, Math.min(index, steps.length - 1))]
}

export function nextMillerClassicWalkIndex(index = 0, { returning = false } = {}) {
  const steps = returning ? MILLER_CLASSIC_READING_WALK.returnSteps : MILLER_CLASSIC_READING_WALK.steps
  return Math.min(index + 1, steps.length - 1)
}
