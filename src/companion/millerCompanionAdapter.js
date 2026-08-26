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
  }),
  // Jade, Violet, Rose, and North intentionally retain the static tableau
  // until they have their own reviewed interaction art.
  fallback: 'static-companion-tableau',
})

export function staticCompanionPresentation({ reducedMotion = false, animationEnabled = true } = {}) {
  // Stable fallback used whenever decorative movement is unavailable. It does
  // not change Miller's search or ranking path.
  return Object.freeze({ actorId: MILLER_COMPANION.actorId, pose: MILLER_COMPANION.reducedMotionPose, reducedMotion: Boolean(reducedMotion), animationEnabled: animationEnabled !== false, decorative: true })
}

// Host-only geometry adapter. It receives rectangles after Miller has already
// selected and rendered a result; no resource fields or ranking data cross this
// boundary. The returned point is the decorative dog's top-left position in
// the host scene's normalized coordinate space.
export function destinationBesideRenderedResult({ hostRect, resultRect, viewport = {}, dogSize = { width: 132, height: 128 } } = {}) {
  if (!hostRect?.width || !hostRect?.height || !resultRect?.width || !resultRect?.height) return null
  if (!viewport?.width || viewport.width <= 600 || resultRect.bottom <= 0 || resultRect.top >= viewport.height) return null
  const gap = 14
  const right = resultRect.right + gap
  const left = resultRect.left - dogSize.width - gap
  const withinHost = value => value >= hostRect.left && value + dogSize.width <= Math.min(hostRect.right, viewport.width)
  const destinationLeft = withinHost(right) ? right : withinHost(left) ? left : null
  if (destinationLeft === null) return null
  const destinationTop = Math.max(resultRect.top + 8, Math.min(resultRect.bottom - dogSize.height - 10, viewport.height - dogSize.height - 8))
  if (destinationTop < 0) return null
  return Object.freeze({ x: (destinationLeft - hostRect.left) / hostRect.width, y: (destinationTop - hostRect.top) / hostRect.height })
}
