export const MILLER_DOG_OWNERS = Object.freeze({ SCENE: 'scene', OVERLAY: 'overlay' })

// A visual ownership invariant, not an application-state decision. Exactly one
// renderer owns the decorative sheepdog at a time.
export function dogVisualOwnership(owner = MILLER_DOG_OWNERS.SCENE) {
  const overlay = owner === MILLER_DOG_OWNERS.OVERLAY
  return Object.freeze({ scene: !overlay, overlay })
}
