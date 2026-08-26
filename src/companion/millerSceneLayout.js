// The host measures its own presentation geometry. The companion core never
// receives response text, search text, or control content.
export function bubbleNeedsMillerReadingPosition({ bubbleRect, figureRect, clearance = 18 } = {}) {
  if (!bubbleRect || !figureRect) return false
  return bubbleRect.bottom > figureRect.top + clearance
}

export function readingStageHeight(bubbleHeight = 0, minimum = 700) {
  return Math.max(minimum, Math.ceil(Number(bubbleHeight || 0) + 485))
}
