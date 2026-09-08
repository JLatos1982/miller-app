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
  classic: Object.freeze({
    supportsNotice: true,
    supportsPetting: true,
    anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHand: Object.freeze({ x: .17, y: .71 }) }),
    petPose: Object.freeze({ width: 320, height: 604, translateX: -106 }),
    poseOffsets: Object.freeze({ leanReach: -106, petDog: -106, rise: -106 }),
  }),
  north: Object.freeze({
    supportsNotice: true,
    supportsPetting: true,
    anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHand: Object.freeze({ x: .15, y: .70 }) }),
    petPose: Object.freeze({ width: 300, height: 450, translateX: -80 }),
    // These offsets align North's independently framed reach hand to the
    // existing sheepdog head anchor without moving either actor's ground.
    poseOffsets: Object.freeze({ leanReach: -60, petDog: -80, rise: -60 }),
  }),
  violet: Object.freeze({
    supportsNotice: true,
    supportsPetting: true,
    anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHand: Object.freeze({ x: .20, y: .70 }) }),
    petPose: Object.freeze({ width: 640, height: 960, translateX: -95 }),
    // Violet's trunk and forelimb meet the same independent dog head anchor.
    poseOffsets: Object.freeze({ leanReach: -95, petDog: -95, rise: -95 }),
  }),
  rose: Object.freeze({
    supportsNotice: true,
    supportsPetting: true,
    anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHand: Object.freeze({ x: .08, y: .70 }) }),
    petPose: Object.freeze({ width: 640, height: 960, translateX: -59 }),
    poseOffsets: Object.freeze({ leanReach: -59, petDog: -59, rise: -59 }),
  }),
  jade: Object.freeze({
    supportsNotice: true,
    supportsPetting: true,
    anchors: Object.freeze({ ground: Object.freeze({ x: .5, y: .97 }), petHand: Object.freeze({ x: .08, y: .70 }) }),
    petPose: Object.freeze({ width: 640, height: 960, translateX: -59 }),
    poseOffsets: Object.freeze({ leanReach: -59, petDog: -59, rise: -59 }),
  }),
  fallback: 'static-companion-tableau',
})

export function millerCharacterInteraction(themeName) {
  return MILLER_CHARACTER_INTERACTION[String(themeName || '').toLowerCase()] || null
}

export function supportsMillerDogGreeting(themeName) {
  const interaction = millerCharacterInteraction(themeName)
  return Boolean(interaction?.supportsNotice && interaction?.supportsPetting)
}

export function staticCompanionPresentation({ reducedMotion = false, animationEnabled = true } = {}) {
  // Stable fallback used whenever decorative movement is unavailable. It does
  // not change Miller's search or ranking path.
  return Object.freeze({ actorId: MILLER_COMPANION.actorId, pose: MILLER_COMPANION.reducedMotionPose, reducedMotion: Boolean(reducedMotion), animationEnabled: animationEnabled !== false, decorative: true })
}

export function resultCompanionSize(viewportWidth) {
  if (Number(viewportWidth) <= 600) return null
  if (Number(viewportWidth) <= 900) return Object.freeze({ width: 76, height: 74 })
  return Object.freeze({ width: 112, height: 109 })
}

// Host-only geometry adapter. It receives rectangles after Miller has already
// selected and rendered a result; no resource fields or ranking data cross this
// boundary. The returned point is the decorative dog's top-left position in
// the host scene's normalized coordinate space.
export function destinationBesideRenderedResult({ hostRect, resultRect, viewport = {}, dogSize = { width: 180, height: 175 } } = {}) {
  if (!hostRect?.width || !hostRect?.height || !resultRect?.width || !resultRect?.height) return null
  if (!viewport?.width || viewport.width <= 600 || resultRect.bottom <= 0 || resultRect.top >= viewport.height) return null
  // A host-provided left rail makes this a decisive, presentation-only
  // destination: dog | authoritative top result. There is deliberately no
  // right-side fallback that could crowd a card's actions.
  const gap = 18
  const margin = 16
  const left = resultRect.left - dogSize.width - gap
  const withinLeftRail = left >= Math.max(hostRect.left + margin, margin) && left + dogSize.width + gap <= resultRect.left
  if (!withinLeftRail) return null
  const destinationLeft = left
  // Align the dog's already-known head anchor to the card's upper third, not
  // the dog's feet to the title line. This remains geometry-only.
  const headOffset = dogSize.height * MILLER_COMPANION.anchors.petHead.y
  const desiredHeadY = resultRect.top + Math.min(88, Math.max(54, resultRect.height * .22))
  const destinationTop = Math.max(8, Math.min(desiredHeadY - headOffset, viewport.height - dogSize.height - 8))
  if (destinationTop < 0) return null
  return Object.freeze({ x: (destinationLeft - hostRect.left) / hostRect.width, y: (destinationTop - hostRect.top) / hostRect.height })
}
