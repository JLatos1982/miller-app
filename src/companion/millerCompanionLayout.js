import { MILLER_CHARACTER_INTERACTION, MILLER_COMPANION } from './millerCompanionAdapter.js'

// Desktop scene geometry is deliberately expressed in the actors' own local
// coordinates. The host CSS owns placement in the page; this data keeps the
// companion scale and pet-contact relationship inspectable and testable.
export const MILLER_DESKTOP_COMPANION_LAYOUT = Object.freeze({
  frame: Object.freeze({ width: 300, height: 450 }),
  dog: Object.freeze({ width: 180, height: 175, left: -150, bottom: 8.25, entranceOffsetX: -60 }),
  petPose: Object.freeze({ width: 320, height: 604, translateX: -106 }),
})

function normalizedPoint(anchor, width, height, x = 0, y = 0) {
  return Object.freeze({ x: x + anchor.x * width, y: y + anchor.y * height })
}

// Resolves the named contact anchors at the production desktop scale. A small
// vertical tolerance is intentional: the hand meets the upper neck rather
// than a mathematically exact pixel in a painterly illustration.
export function resolveDesktopPetContact(layout = MILLER_DESKTOP_COMPANION_LAYOUT) {
  const miller = MILLER_CHARACTER_INTERACTION.classic.anchors
  const dog = MILLER_COMPANION.anchors
  const renderedPetWidth = layout.frame.height * layout.petPose.width / layout.petPose.height
  const petLeft = (layout.frame.width - renderedPetWidth) / 2 + layout.petPose.translateX
  const dogTop = layout.frame.height - layout.dog.bottom - layout.dog.height
  const petHand = normalizedPoint(miller.petHand, renderedPetWidth, layout.frame.height, petLeft)
  const petHead = normalizedPoint(dog.petHead, layout.dog.width, layout.dog.height, layout.dog.left, dogTop)
  const millerGround = normalizedPoint(miller.ground, layout.frame.width, layout.frame.height)
  const dogGround = normalizedPoint(dog.ground, layout.dog.width, layout.dog.height, layout.dog.left, dogTop)
  return Object.freeze({
    petHand,
    petHead,
    delta: Object.freeze({ x: petHand.x - petHead.x, y: petHand.y - petHead.y }),
    groundDeltaY: millerGround.y - dogGround.y,
  })
}
