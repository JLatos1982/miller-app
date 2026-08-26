// Framework-light companion presentation core. It intentionally imports no
// React, DOM, application, security, ranking, sensor, server, or model code.
// Hosts own rendering and may only send sanitized decorative intents.
const unit = value => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0))
const point = value => Object.freeze({ x: unit(value?.x), y: unit(value?.y) })

export function defineCompanionActor({ id, name, poses = {}, anchors = {}, defaultPose = null, reducedMotionPose = null, facing = 'right', scale = 1, visible = true } = {}) {
  if (!id || !name) throw new Error('companion_actor_identity_required')
  const normalizedAnchors = Object.freeze(Object.fromEntries(Object.entries(anchors).map(([key, value]) => [key, point(value)])))
  return Object.freeze({ id, name, poses: Object.freeze({ ...poses }), anchors: normalizedAnchors, defaultPose: defaultPose || Object.keys(poses)[0] || null, reducedMotionPose: reducedMotionPose || defaultPose || Object.keys(poses)[0] || null, facing, scale: Math.max(.1, Number(scale) || 1), visible: visible !== false })
}

export function resolveActorPose(actor, pose = null, { reducedMotion = false, animationEnabled = true } = {}) {
  const key = !animationEnabled || reducedMotion ? actor?.reducedMotionPose : pose || actor?.defaultPose
  return key && actor?.poses?.[key] ? { key, asset: actor.poses[key] } : { key: null, asset: null }
}

export function resolveActorAnchor(actor, name = 'ground') { return actor?.anchors?.[name] || null }
export function normalizedPoint(value) { return point(value) }
export function offsetPoint(target = { x: 0, y: 0 }, offset = { x: 0, y: 0 }) { return { x: Number(target.x || 0) + Number(offset.x || 0), y: Number(target.y || 0) + Number(offset.y || 0) } }
export function settleNearTarget(target, offset = { x: 0, y: 0 }) { return point(offsetPoint(point(target), offset)) }

// Converts a host-owned, already-rendered element into a scene-local target.
// It deliberately receives rectangles only; it cannot inspect or choose UI.
export function destinationFromElement(sceneRect, destinationRect) {
  if (!sceneRect?.width || !sceneRect?.height || !destinationRect) return null
  return point({ x: (destinationRect.left + destinationRect.width / 2 - sceneRect.left) / sceneRect.width, y: (destinationRect.top + destinationRect.height - sceneRect.top) / sceneRect.height })
}

export function defineCompanionSequence({ id, steps = [], reducedMotionStep = null } = {}) {
  if (!id || !steps.length) throw new Error('companion_sequence_required')
  const normalized = steps.map((step, index) => Object.freeze({ id: step.id || `${id}:${index}`, pose: step.pose || null, duration: Math.max(0, Number(step.duration) || 0), movement: step.movement || null, target: step.target || null, settle: step.settle === true }))
  return Object.freeze({ id, steps: Object.freeze(normalized), reducedMotionStep: reducedMotionStep || normalized.at(-1).id })
}

export function sequenceStep(sequence, index = 0, { reducedMotion = false, animationEnabled = true } = {}) {
  const steps = sequence?.steps || []
  if (!steps.length) return null
  if (reducedMotion || !animationEnabled) return steps.find(step => step.id === sequence.reducedMotionStep) || steps.at(-1)
  return steps[Math.max(0, Math.min(steps.length - 1, Number(index) || 0))]
}

export function nextSequenceIndex(sequence, index = 0) { return Math.min((sequence?.steps?.length || 1) - 1, Math.max(0, Number(index) || 0) + 1) }

export const COMPANION_INTENTS = Object.freeze({
  IDLE: 'idle',
  INPUT_STARTED: 'input_started',
  WORK_STARTED: 'work_started',
  DESTINATION_READY: 'destination_ready',
  WORK_COMPLETED: 'work_completed',
  SETTLE: 'settle',
})

const RELATIONSHIPS = new Set(['beside', 'left', 'right'])

// The one-way host boundary. A destination is required only once a host has
// already selected and rendered it. Intents carry no query, result, ranking,
// identity, or domain data and are never allowed to mutate the host.
export function consumeCompanionIntent(intent = {}) {
  const type = Object.values(COMPANION_INTENTS).includes(intent.type) ? intent.type : null
  if (!type) return null
  const target = intent.target ? point(intent.target) : null
  if (type === COMPANION_INTENTS.DESTINATION_READY && !target) return null
  return Object.freeze({ type, actorId: typeof intent.actorId === 'string' ? intent.actorId.slice(0, 80) : null, target, relationship: RELATIONSHIPS.has(intent.relationship) ? intent.relationship : 'beside' })
}

// Backward-compatible naming for the original Animation Lab proof.
export const COMPANION_EVENTS = Object.freeze({ READY: COMPANION_INTENTS.IDLE, USER_INPUT_STARTED: COMPANION_INTENTS.INPUT_STARTED, WORK_STARTED: COMPANION_INTENTS.WORK_STARTED, WORK_COMPLETED: COMPANION_INTENTS.WORK_COMPLETED, DESTINATION_AVAILABLE: COMPANION_INTENTS.DESTINATION_READY, SETTLE: COMPANION_INTENTS.SETTLE })
export const consumeDecorativeEvent = consumeCompanionIntent
