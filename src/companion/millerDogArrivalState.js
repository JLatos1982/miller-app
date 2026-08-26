import { useEffect, useState } from 'react'
import { MILLER_DOG_ARRIVAL, millerDogArrivalStep, nextMillerDogArrivalIndex } from './millerCompanionSequence.js'

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const sync = () => setReducedMotion(query.matches)
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])
  return reducedMotion
}

export function useMillerDogArrival({ reducedMotion = false, animationEnabled = true } = {}) {
  const motionReduced = useReducedMotionPreference() || reducedMotion || !animationEnabled
  const [stepIndex, setStepIndex] = useState(0)
  useEffect(() => {
    if (motionReduced) return undefined
    let active = true
    let index = 0
    let timer = null
    const advance = () => {
      const step = millerDogArrivalStep(index)
      if (!active || step?.settle) return
      timer = window.setTimeout(() => {
        index = nextMillerDogArrivalIndex(index)
        if (!active) return
        setStepIndex(index)
        advance()
      }, step.duration)
    }
    advance()
    return () => { active = false; if (timer) window.clearTimeout(timer) }
  }, [motionReduced])
  const finalIndex = MILLER_DOG_ARRIVAL.steps.length - 1
  const step = millerDogArrivalStep(motionReduced ? finalIndex : stepIndex, { reducedMotion: motionReduced, animationEnabled })
  return { step, motionReduced, settled: Boolean(step?.settle) }
}
