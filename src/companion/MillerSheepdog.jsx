import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import sheepdogSit from '../assets/companion/sheepdog-sit.png'
import sheepdogWalk01 from '../assets/companion/sheepdog-walk-01.png'
import sheepdogWalk02 from '../assets/companion/sheepdog-walk-02.png'
import sheepdogPetReaction from '../assets/companion/sheepdog-pet-reaction.png'
import { MILLER_COMPANION, staticCompanionPresentation } from './millerCompanionAdapter.js'
import { millerDogIsTraveling } from './millerCompanionSequence.js'
import { useMillerDogArrival } from './millerDogArrivalState.js'
import { MILLER_CLASSIC_GREETING, millerClassicGreetingStep, nextMillerClassicGreetingIndex } from './millerClassicGreeting.js'
import { MILLER_PRESENTATION_INTENTS, acceptsNewPresentationIntent, jogDurationForDistance, mayTravelToResult } from './millerCompanionLifecycle.js'
import { mayRunMillerIdlePet, nextMillerIdleDelay } from './millerCompanionIdle.js'
import { dogVisualOwnership, MILLER_DOG_OWNERS } from './millerDogOwnership.js'

const DOG_POSES = Object.freeze({ sit: sheepdogSit, 'walk-1': sheepdogWalk01, 'walk-2': sheepdogWalk02, 'pet-reaction': sheepdogPetReaction })

function isLightBackdrop(red, green, blue) {
  return Math.min(red, green, blue) > 210 && Math.max(red, green, blue) - Math.min(red, green, blue) < 24
}

function clearConnectedBackdrop(imageData) {
  const { data, width, height } = imageData
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height)
  let head = 0, tail = 0
  const enqueue = index => {
    if (index < 0 || index >= width * height || visited[index]) return
    const pixel = index * 4
    if (!isLightBackdrop(data[pixel], data[pixel + 1], data[pixel + 2])) return
    visited[index] = 1
    queue[tail++] = index
  }
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1) }
  while (head < tail) {
    const index = queue[head++]
    data[index * 4 + 3] = 0
    const x = index % width
    if (x > 0) enqueue(index - 1)
    if (x + 1 < width) enqueue(index + 1)
    if (index >= width) enqueue(index - width)
    if (index + width < width * height) enqueue(index + width)
  }
  return imageData
}

// The dog is an independent, decorative canvas actor. It never receives
// Miller input, search, result, ranking, resource, clinical, or analytics data.
function DogCanvas({ source }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current, image = new Image()
    image.onload = () => {
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      context.putImageData(clearConnectedBackdrop(context.getImageData(0, 0, canvas.width, canvas.height)), 0, 0)
    }
    image.src = source
  }, [source])
  return <canvas ref={canvasRef} />
}

// The dog is an independent, decorative canvas actor. It receives only a
// monotonic presentation intent plus optional normalized geometry—not query,
// result, ranking, resource, clinical, analytics, or identity data.
export default function MillerSheepdog({ themeName, reducedMotion = false, animationEnabled = true, onGreetingPhaseChange, presentationIntent: incomingIntent = null, overlayHost = null, idleAllowed = false }) {
  const actorRef = useRef(null)
  const greetingStartedRef = useRef(false)
  const handledIntentRef = useRef(0)
  const pendingIntentRef = useRef(null)
  const queuedDestinationRef = useRef(null)
  const idleCycleRef = useRef(0)
  const [dogOwner, setDogOwner] = useState(MILLER_DOG_OWNERS.SCENE)
  const presentation = staticCompanionPresentation({ reducedMotion, animationEnabled })
  const { step, motionReduced, settled } = useMillerDogArrival({ reducedMotion, animationEnabled })
  const [interaction, setInteraction] = useState(null)
  const [interactionIndex, setInteractionIndex] = useState(0)
  const [greetingComplete, setGreetingComplete] = useState(themeName !== 'Classic')
  const [sceneState, setSceneState] = useState('settled')
  const [travel, setTravel] = useState(null)
  const classicInteraction = themeName === 'Classic' && settled && !motionReduced && interaction
  const greetingStep = millerClassicGreetingStep(interactionIndex, { reducedMotion: motionReduced, animationEnabled })
  const dogPose = travel?.pose || sceneState === 'attentive' || sceneState === 'ready'
    ? 'pet-reaction'
    : classicInteraction && greetingStep?.id === 'pet-dog'
    ? 'pet-reaction'
    : classicInteraction ? 'sit' : step?.pose || presentation.pose
  const source = DOG_POSES[dogPose] || sheepdogSit

  const startInteraction = useCallback(kind => {
    if (interaction || dogOwner !== MILLER_DOG_OWNERS.SCENE) return
    setInteractionIndex(0)
    setInteraction(kind)
  }, [dogOwner, interaction])

  useEffect(() => {
    if (themeName !== 'Classic' || !settled || motionReduced || greetingStartedRef.current) return undefined
    greetingStartedRef.current = true
    const timer = window.setTimeout(() => startInteraction('initial'), 0)
    return () => window.clearTimeout(timer)
  }, [themeName, settled, motionReduced, startInteraction])

  useEffect(() => {
    if (!classicInteraction) return undefined
    let active = true
    let timer = null
    const advance = () => {
      const next = millerClassicGreetingStep(interactionIndex)
      onGreetingPhaseChange?.(next?.pose || 'neutral')
      if (!active || next?.settle) {
        if (interaction === 'initial') setGreetingComplete(true)
        setInteraction(null)
        return
      }
      timer = window.setTimeout(() => {
        const index = nextMillerClassicGreetingIndex(interactionIndex)
        if (!active) return
        setInteractionIndex(index)
      }, next.duration)
    }
    advance()
    return () => { active = false; if (timer) window.clearTimeout(timer) }
  }, [classicInteraction, interaction, interactionIndex, onGreetingPhaseChange])

  useEffect(() => {
    if (classicInteraction) return
    onGreetingPhaseChange?.('neutral')
  }, [classicInteraction, onGreetingPhaseChange])

  useEffect(() => {
    if (!mayRunMillerIdlePet({ themeName, dogOwner, settled, greetingComplete, idleAllowed, reducedMotion: motionReduced, animationEnabled, interactionActive: Boolean(interaction) })) return undefined
    const timer = window.setTimeout(() => {
      idleCycleRef.current += 1
      startInteraction('idle')
    }, nextMillerIdleDelay(idleCycleRef.current))
    return () => window.clearTimeout(timer)
  }, [themeName, dogOwner, settled, greetingComplete, idleAllowed, motionReduced, animationEnabled, interaction, startInteraction])
  const beginTravel = useCallback(intent => {
    const host = overlayHost
    const actor = actorRef.current
    if (!host || !actor || !mayTravelToResult({ target: intent.target, reducedMotion: motionReduced, animationEnabled, viewportWidth: window.innerWidth })) return
    const hostRect = host.getBoundingClientRect(), actorRect = actor.getBoundingClientRect()
    const target = { x: hostRect.left + intent.target.x * hostRect.width, y: hostRect.top + intent.target.y * hostRect.height }
    const start = { x: actorRect.left, y: actorRect.top }
    const duration = jogDurationForDistance(Math.hypot(target.x - start.x, target.y - start.y))
    // One React state commit hands the same dog from the scene to the overlay.
    // The two renderers are mutually exclusive; there is never a second dog.
    setDogOwner(MILLER_DOG_OWNERS.OVERLAY)
    setSceneState('traveling')
    setTravel({ start: { x: start.x - hostRect.left, y: start.y - hostRect.top }, target: { x: target.x - hostRect.left, y: target.y - hostRect.top }, duration, pose: 'walk-1', arrived: false })
  }, [animationEnabled, motionReduced, overlayHost])

  const consume = useCallback(intent => {
    if (!intent) return
    if (motionReduced || animationEnabled === false) { setTravel(null); setDogOwner(MILLER_DOG_OWNERS.SCENE); setSceneState('settled'); return }
    if (intent.type === MILLER_PRESENTATION_INTENTS.INPUT_STARTED) { setTravel(null); setDogOwner(MILLER_DOG_OWNERS.SCENE); setSceneState('attentive'); return }
    if (intent.type === MILLER_PRESENTATION_INTENTS.WORK_STARTED) {
      setTravel(null); setDogOwner(MILLER_DOG_OWNERS.SCENE); setSceneState('ready')
      return
    }
    if (intent.type === MILLER_PRESENTATION_INTENTS.DESTINATION_READY) {
      if (sceneState === 'ready') { queuedDestinationRef.current = intent; return }
      beginTravel(intent)
      return
    }
    if (intent.type === MILLER_PRESENTATION_INTENTS.SETTLE) { setTravel(null); setDogOwner(MILLER_DOG_OWNERS.SCENE); setSceneState('settled') }
  }, [animationEnabled, beginTravel, motionReduced, sceneState])

  useEffect(() => {
    if (!acceptsNewPresentationIntent(handledIntentRef.current, incomingIntent)) return
    handledIntentRef.current = incomingIntent.id
    if (!settled || interaction) { pendingIntentRef.current = incomingIntent; return }
    const timer = window.setTimeout(() => consume(incomingIntent), 0)
    return () => window.clearTimeout(timer)
  }, [incomingIntent, settled, interaction, consume])

  useEffect(() => {
    if (!settled || interaction || !pendingIntentRef.current) return
    const next = pendingIntentRef.current
    pendingIntentRef.current = null
    const timer = window.setTimeout(() => consume(next), 0)
    return () => window.clearTimeout(timer)
  }, [settled, interaction, consume])

  useEffect(() => {
    if (sceneState !== 'ready') return undefined
    const timer = window.setTimeout(() => {
      setSceneState(current => current === 'ready' ? 'attentive' : current)
      const destination = queuedDestinationRef.current
      queuedDestinationRef.current = null
      if (destination) beginTravel(destination)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [sceneState, beginTravel])

  const travelDuration = travel?.duration
  const travelArrived = travel?.arrived
  useEffect(() => {
    if (!travelDuration || travelArrived) return undefined
    const frame = window.requestAnimationFrame(() => setTravel(current => current ? { ...current, moving: true } : current))
    const frameTimer = window.setInterval(() => setTravel(current => current ? { ...current, pose: current.pose === 'walk-1' ? 'walk-2' : 'walk-1' } : current), 180)
    const settleTimer = window.setTimeout(() => {
      setTravel(current => current ? { ...current, pose: 'sit', arrived: true, moving: false } : current)
      setSceneState('at-destination')
    }, travelDuration)
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(frameTimer); window.clearTimeout(settleTimer) }
  }, [travelDuration, travelArrived])

  const dogVisuals = dogVisualOwnership(dogOwner)
  const travelOverlay = dogVisuals.overlay && travel && overlayHost ? createPortal(
  <div className={`miller-companion-travel ${travel.moving ? 'is-moving' : ''} ${travel.arrived ? 'is-settled' : ''}`} aria-hidden="true" data-companion="sheepdog" data-owner="overlay" data-presentation="destination_arrived" style={{ '--dog-start-x': `${travel.start.x}px`, '--dog-start-y': `${travel.start.y}px`, '--dog-target-x': `${travel.target.x}px`, '--dog-target-y': `${travel.target.y}px`, '--dog-travel-duration': `${travel.duration}ms` }}><DogCanvas source={DOG_POSES[travel.pose] || sheepdogSit} /></div>, overlayHost) : null

  const sceneDog = dogVisuals.scene ? <div ref={actorRef} className={`miller-companion-actor ${millerDogIsTraveling(step) ? 'is-approaching' : ''} ${settled ? 'is-settled' : ''} ${sceneState === 'ready' ? 'is-ready' : ''}`} aria-hidden="true" data-companion={presentation.actorId} data-owner="scene" data-pose={dogPose} data-arrival-step={step?.id || 'settled'} data-greeting-step={classicInteraction ? greetingStep?.id : 'static'} data-reduced-motion={motionReduced} data-ground-anchor={`${MILLER_COMPANION.anchors.ground.x},${MILLER_COMPANION.anchors.ground.y}`} data-pet-head-anchor={`${MILLER_COMPANION.anchors.petHead.x},${MILLER_COMPANION.anchors.petHead.y}`}><DogCanvas source={source} /></div> : null
  return <>{sceneDog}{travelOverlay}</>
}
