import classicMillerNoticeDog from '../assets/miller/interaction/classic-miller-notice-dog.png'
import classicMillerLeanReach from '../assets/miller/interaction/classic-miller-lean-reach.png'
import classicMillerPetDog from '../assets/miller/interaction/classic-miller-pet-dog.png'
import classicMillerStepLeft01 from '../assets/miller/interaction/classic-miller-step-left-01.png'
import classicMillerStepLeft02 from '../assets/miller/interaction/classic-miller-step-left-02.png'
import northMillerNoticeDog from '../assets/miller/interaction/miller-north-notice-dog.png'
import northMillerLeanReach from '../assets/miller/interaction/miller-north-lean-reach.png'
import northMillerPetDog from '../assets/miller/interaction/miller-north-pet-dog.png'
import northMillerRise from '../assets/miller/interaction/miller-north-rise.png'
import violetMillerNoticeDog from '../assets/miller/interaction/miller-violet-notice-dog.png'
import violetMillerLeanReach from '../assets/miller/interaction/miller-violet-lean-reach.png'
import violetMillerPetDog from '../assets/miller/interaction/miller-violet-pet-dog.png'
import violetMillerRise from '../assets/miller/interaction/miller-violet-rise.png'
import roseMillerNoticeDog from '../assets/miller/interaction/miller-rose-notice-dog.png'
import roseMillerLeanReach from '../assets/miller/interaction/miller-rose-lean-reach.png'
import roseMillerPetDog from '../assets/miller/interaction/miller-rose-pet-dog.png'
import roseMillerRise from '../assets/miller/interaction/miller-rose-rise.png'
import jadeMillerNoticeDog from '../assets/miller/interaction/miller-jade-notice-dog.png'
import jadeMillerLeanReach from '../assets/miller/interaction/miller-jade-lean-reach.png'
import jadeMillerPetDog from '../assets/miller/interaction/miller-jade-pet-dog.png'
import jadeMillerRise from '../assets/miller/interaction/miller-jade-rise.png'

// One asset registry serves every eligible Miller theme. Neutral artwork is
// intentionally omitted so each theme continues to use its established,
// canonical avatar after the bounded interaction settles.
export const MILLER_CHARACTER_INTERACTION_POSES = Object.freeze({
  Classic: Object.freeze({
    noticeDog: classicMillerNoticeDog,
    leanReach: classicMillerLeanReach,
    petDog: classicMillerPetDog,
    rise: classicMillerLeanReach,
    stepLeft01: classicMillerStepLeft01,
    stepLeft02: classicMillerStepLeft02,
  }),
  North: Object.freeze({
    noticeDog: northMillerNoticeDog,
    leanReach: northMillerLeanReach,
    petDog: northMillerPetDog,
    rise: northMillerRise,
  }),
  Violet: Object.freeze({
    noticeDog: violetMillerNoticeDog,
    leanReach: violetMillerLeanReach,
    petDog: violetMillerPetDog,
    rise: violetMillerRise,
  }),
  Rose: Object.freeze({
    noticeDog: roseMillerNoticeDog,
    leanReach: roseMillerLeanReach,
    petDog: roseMillerPetDog,
    rise: roseMillerRise,
  }),
  Jade: Object.freeze({
    noticeDog: jadeMillerNoticeDog,
    leanReach: jadeMillerLeanReach,
    petDog: jadeMillerPetDog,
    rise: jadeMillerRise,
  }),
})

export function millerCharacterPose(themeName, pose, neutralAsset) {
  return MILLER_CHARACTER_INTERACTION_POSES[themeName]?.[pose] || neutralAsset
}
