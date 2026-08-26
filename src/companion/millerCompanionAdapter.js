// Miller's presentation-only companion boundary. Keep search, ranking,
// resources, clinical content, identity, and analytics outside this module.
export const MILLER_COMPANION = Object.freeze({
  actorId: 'sheepdog',
  pose: 'sit',
  scale: 1,
  reducedMotionPose: 'sit',
  anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHead: Object.freeze({ x: .64, y: .28 }) }),
  decorative: true,
})

export const MILLER_CHARACTER_INTERACTION = Object.freeze({
  // Current Miller variants are canonical single-pose artwork. Do not invent
  // a notice or pet reaction with CSS deformation.
  supportsNotice: false,
  supportsPetting: false,
  fallback: 'static-companion-tableau',
})

export function staticCompanionPresentation({ reducedMotion = false, animationEnabled = true } = {}) {
  // The first Miller integration is intentionally static. These preferences
  // remain here so a future adapter can use the proven core without changing
  // the search or ranking path.
  return Object.freeze({ actorId: MILLER_COMPANION.actorId, pose: MILLER_COMPANION.reducedMotionPose, reducedMotion: Boolean(reducedMotion), animationEnabled: animationEnabled !== false, decorative: true })
}
