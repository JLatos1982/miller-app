// Development-facing preview descriptors. They deliberately register only
// approved assets; absent future poses resolve to a stable preview rather than
// enabling a fabricated production animation.
export const CLASSIC_WALK_POSE_SLOTS = Object.freeze({
  neutral: Object.freeze({ asset: '../assets/miller_classic.png', anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }) }), approved: true }),
  stepLeft01: Object.freeze({ asset: '../assets/miller/interaction/classic-miller-step-left-01.png', anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), bodyCenter: Object.freeze({ x: .5, y: .52 }) }), approved: false }),
  stepLeft02: Object.freeze({ asset: '../assets/miller/interaction/classic-miller-step-left-02.png', anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), bodyCenter: Object.freeze({ x: .5, y: .52 }) }), approved: false }),
})

export const SHEEPDOG_RESULT_POINT_SLOT = Object.freeze({
  asset: '../assets/companion/sheepdog-result-point.png',
  anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), indicatePaw: Object.freeze({ x: .62, y: .52 }) }),
  approved: false,
})

export const COMPANION_POSE_PREVIEWS = Object.freeze({
  classicWalk: Object.freeze({ sequence: Object.freeze(['neutral', 'stepLeft01', 'stepLeft02', 'neutral']), mockDestination: Object.freeze({ x: .38, y: .45 }) }),
  sheepdogResultPoint: Object.freeze({ sequence: Object.freeze(['sit', 'resultPoint', 'sit']), mockResultRail: Object.freeze({ x: .06, y: .42 }) }),
})

export function canPreviewClassicWalk() {
  return CLASSIC_WALK_POSE_SLOTS.stepLeft01.approved && CLASSIC_WALK_POSE_SLOTS.stepLeft02.approved
}

export function canPreviewSheepdogResultPoint() {
  return SHEEPDOG_RESULT_POINT_SLOT.approved
}
