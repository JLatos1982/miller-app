// Reviewed, bounded presentation-only gait for Classic Miller's reading
// position. Position changes occur only with distinct approved step frames;
// this is intentionally not a translated standing-image animation.
export const MILLER_CLASSIC_READING_WALK = Object.freeze({
  steps: Object.freeze([
    Object.freeze({ id: 'step-left-01', pose: 'stepLeft01', progress: .48, duration: 320 }),
    Object.freeze({ id: 'step-left-02', pose: 'stepLeft02', progress: 1, duration: 320 }),
    Object.freeze({ id: 'settled', pose: 'neutral', progress: 1, duration: 120, settle: true }),
  ]),
  returnSteps: Object.freeze([
    Object.freeze({ id: 'return-step-left-02', pose: 'stepLeft02', progress: .52, duration: 320 }),
    Object.freeze({ id: 'return-step-left-01', pose: 'stepLeft01', progress: 0, duration: 320 }),
    Object.freeze({ id: 'home', pose: 'neutral', progress: 0, duration: 120, settle: true }),
  ]),
})

export function millerClassicWalkStep(index = 0, { returning = false } = {}) {
  const steps = returning ? MILLER_CLASSIC_READING_WALK.returnSteps : MILLER_CLASSIC_READING_WALK.steps
  return steps[Math.max(0, Math.min(index, steps.length - 1))]
}

export function nextMillerClassicWalkIndex(index = 0, { returning = false } = {}) {
  const steps = returning ? MILLER_CLASSIC_READING_WALK.returnSteps : MILLER_CLASSIC_READING_WALK.steps
  return Math.min(index + 1, steps.length - 1)
}
