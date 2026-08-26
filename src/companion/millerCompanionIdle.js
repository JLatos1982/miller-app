// Decorative-only cadence. This is intentionally deterministic and local: it
// records no visitor history, makes no requests, and never affects search.
export const MILLER_IDLE_DELAYS_MS = Object.freeze([48_000, 62_000, 76_000])

export function nextMillerIdleDelay(cycle = 0) {
  return MILLER_IDLE_DELAYS_MS[Math.max(0, Number(cycle) || 0) % MILLER_IDLE_DELAYS_MS.length]
}
export function mayRunMillerIdlePet({
  themeName,
  dogOwner,
  settled = false,
  greetingComplete = false,
  idleAllowed = false,
  reducedMotion = false,
  animationEnabled = true,
  interactionActive = false,
} = {}) {
  return Boolean(
    themeName === 'Classic' &&
    dogOwner === 'scene' &&
    settled &&
    greetingComplete &&
    idleAllowed &&
    !reducedMotion &&
    animationEnabled !== false &&
    !interactionActive,
  )
}
