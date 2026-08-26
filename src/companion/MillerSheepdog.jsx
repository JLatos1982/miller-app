import { useEffect, useRef } from 'react'
import sheepdogSit from '../assets/companion/sheepdog-sit.png'
import sheepdogWalk01 from '../assets/companion/sheepdog-walk-01.png'
import sheepdogWalk02 from '../assets/companion/sheepdog-walk-02.png'
import { MILLER_COMPANION, staticCompanionPresentation } from './millerCompanionAdapter.js'
import { millerDogIsTraveling } from './millerCompanionSequence.js'
import { useMillerDogArrival } from './millerDogArrivalState.js'

const DOG_POSES = Object.freeze({ sit: sheepdogSit, 'walk-1': sheepdogWalk01, 'walk-2': sheepdogWalk02 })

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
export default function MillerSheepdog({ reducedMotion = false, animationEnabled = true }) {
  const canvasRef = useRef(null)
  const presentation = staticCompanionPresentation({ reducedMotion, animationEnabled })
  const { step, motionReduced, settled } = useMillerDogArrival({ reducedMotion, animationEnabled })
  const source = DOG_POSES[step?.pose] || sheepdogSit
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
  return <div className={`miller-companion-actor ${millerDogIsTraveling(step) ? 'is-approaching' : ''} ${settled ? 'is-settled' : ''}`} aria-hidden="true" data-companion={presentation.actorId} data-pose={step?.pose || presentation.pose} data-arrival-step={step?.id || 'settled'} data-reduced-motion={motionReduced} data-ground-anchor={`${MILLER_COMPANION.anchors.ground.x},${MILLER_COMPANION.anchors.ground.y}`}><canvas ref={canvasRef} /></div>
}
