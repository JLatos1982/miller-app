export const MILLER_RESULTS_JOURNEY = Object.freeze({
  // Miller and the dog leave together. Their frames are intentionally bounded
  // to this short handoff so a fast search is never held for decoration.
  dog: Object.freeze({ delay: 0, duration: 820 }),
  character: Object.freeze({ delay: 0, duration: 820 }),
  switcher: Object.freeze({ delay: 150, duration: 650 }),
  results: Object.freeze({ delay: 90, duration: 360 }),
  speech: Object.freeze({ delay: 420, duration: 300 }),
  walkFrameDuration: 205,
  totalDuration: 900,
  easing: 'cubic-bezier(.22,.72,.3,1)',
})

export function snapshotJourneyRect(rect) {
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) || !rect.width || !rect.height) return null
  return Object.freeze({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
}

export function resultJourneyTransform(from, to) {
  if (!from || !to || !to.width || !to.height) return null
  const scaleX = Math.max(.25, Math.min(4, from.width / to.width))
  const scaleY = Math.max(.25, Math.min(4, from.height / to.height))
  return Object.freeze({
    x: from.left - to.left,
    y: from.top - to.top,
    scaleX,
    scaleY,
  })
}

export function journeyKeyframes(from, to, { fadeIn = false } = {}) {
  const transform = resultJourneyTransform(from, to)
  if (!transform) return null
  const startTransform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scaleX}, ${transform.scaleY})`
  return Object.freeze([
    Object.freeze({ transform: startTransform, opacity: fadeIn ? 0 : 1 }),
    Object.freeze({ transform: 'translate(0, 0) scale(1, 1)', opacity: 1 }),
  ])
}

// The position still comes from real, measured layout rectangles. These
// intermediate stops simply keep the translation cadence aligned with the
// approved Classic walk poses instead of presenting a single uninterrupted
// standing-image glide.
export function walkingJourneyKeyframes(from, to, { fadeIn = false } = {}) {
  const transform = resultJourneyTransform(from, to)
  if (!transform) return null
  const transformAt = progress => `translate(${transform.x * (1 - progress)}px, ${transform.y * (1 - progress)}px) scale(${1 + (transform.scaleX - 1) * (1 - progress)}, ${1 + (transform.scaleY - 1) * (1 - progress)})`
  return Object.freeze([0, .25, .5, .75, 1].map((offset, index) => Object.freeze({
    offset,
    transform: transformAt(offset),
    opacity: fadeIn && index === 0 ? 0 : 1,
  })))
}

// Decorative geometry only: no resource, query, ranking, or identity data
// crosses into the companion.
export function journeyPointInHost(rect, hostRect) {
  if (!rect || !hostRect?.width || !hostRect?.height) return null
  return Object.freeze({
    x: Math.max(0, Math.min(1, (rect.left - hostRect.left) / hostRect.width)),
    y: Math.max(0, Math.min(1, (rect.top - hostRect.top) / hostRect.height)),
  })
}

export function mayAnimateResultsJourney({ origin, reducedMotion = false, viewportWidth = 0, animationAvailable = true } = {}) {
  return Boolean(
    origin?.character &&
    origin?.dog &&
    !reducedMotion &&
    Number(viewportWidth) > 600 &&
    animationAvailable
  )
}

export function resultSceneMinimumHeight(bubbleHeight = 0, viewportWidth = 1200) {
  if (Number(viewportWidth) <= 600) return 0
  const artworkHeight = Number(viewportWidth) < 960 ? 320 : 530
  return Math.max(artworkHeight, Math.ceil(Number(bubbleHeight || 0) + 74))
}
