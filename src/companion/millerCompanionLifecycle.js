import { COMPANION_INTENTS, consumeCompanionIntent } from '../companion-core/index.js'

export const COMPANION_MINIMUM_INPUT_LENGTH = 2

export function isMeaningfulCompanionInput(value) {
  return String(value || '').trim().length >= COMPANION_MINIMUM_INPUT_LENGTH
}

export function presentationIntent(id, type, target = null) {
  const intent = consumeCompanionIntent({ type, actorId: 'sheepdog', target, relationship: 'beside' })
  return intent ? Object.freeze({ id: Math.max(0, Number(id) || 0), ...intent }) : null
}

export function acceptsNewPresentationIntent(previousId, intent) {
  return Boolean(intent && Number(intent.id) > Number(previousId || 0))
}

export function jogDurationForDistance(distance) {
  const safeDistance = Math.max(0, Number(distance) || 0)
  return Math.round(Math.max(700, Math.min(1800, 700 + safeDistance * 1.35)))
}

export function mayTravelToResult({ target, reducedMotion = false, animationEnabled = true, viewportWidth = 0 } = {}) {
  return Boolean(target && !reducedMotion && animationEnabled !== false && Number(viewportWidth) > 600)
}

export const MILLER_PRESENTATION_INTENTS = Object.freeze({
  INPUT_STARTED: COMPANION_INTENTS.INPUT_STARTED,
  WORK_STARTED: COMPANION_INTENTS.WORK_STARTED,
  DESTINATION_READY: COMPANION_INTENTS.DESTINATION_READY,
  SETTLE: COMPANION_INTENTS.SETTLE,
})
