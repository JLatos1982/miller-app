// The host measures its own presentation geometry. The companion core never
// receives response text, search text, or control content.
export function bubbleNeedsMillerReadingPosition({ bubbleRect, figureRect, clearance = 18 } = {}) {
  if (!bubbleRect || !figureRect) return false
  return bubbleRect.bottom > figureRect.top + clearance
}

export function readingStageHeight(bubbleHeight = 0, minimum = 700) {
  return Math.max(minimum, Math.ceil(Number(bubbleHeight || 0) + 485))
}

// The host supplies rectangles only. This keeps the reading position responsive
// to the actual bubble/scene geometry while preserving Miller's ground line.
export function resolveMillerReadingOffset({ bubbleRect, figureRect, stageRect, controlsRect } = {}) {
  if (!bubbleRect || !figureRect || !stageRect) return Object.freeze({ x: -128, y: 0 })
  const verticalPressure = Math.max(0, bubbleRect.bottom - figureRect.top)
  const desired = Math.min(158, Math.max(118, 118 + verticalPressure * .18))
  // Never consume more than the presentation gap between the scene and the
  // functional controls. Controls retain a modest 18px visual clearance.
  const controlLimit = controlsRect?.right
    ? Math.max(118, figureRect.left - controlsRect.right - 18)
    : desired
  const stageLimit = Math.max(118, figureRect.left - stageRect.left + 20)
  return Object.freeze({ x: -Math.min(desired, controlLimit, stageLimit), y: 0 })
}
