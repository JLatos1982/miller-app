# Classic Miller interaction-pose specification

## Current decision

Classic Miller's canonical neutral/identity reference remains
`src/assets/miller_classic.png` (1024 × 1536 RGBA). It is a single flattened
standing illustration and must not be overwritten.

The supplied pose/reference source is
`src/assets/Classic Miller Interaction Pose Sheet.png` (1536 × 1024 RGBA).
It remains intact and is not used directly at runtime. Its reviewed top-row
poses produced the independent Miller-only cutouts in
`src/assets/miller/interaction/`.

The supplied Classic visual reference confirms this portrait as the identity and
style target for every future interaction pose: the same navy fedora, dark
curly hair, blue/navy suit and overcoat, restrained smile, tall proportions,
and painterly illustrated rendering. It is a reference, not a pose source that
can be safely warped into a crouch or reach.

An earlier generated five-pose review sheet was rejected because its
checkerboard-looking backdrop was baked pixels rather than alpha. This supplied
sheet has real alpha; the retained derivatives are cropped only from its
reviewed pose regions.

## Required source delivery

Provide either a genuinely transparent RGBA pose sheet or separate transparent
PNG cutouts. The sheet/cutouts must contain **Classic Miller only**—never the
sheepdog, scenery, labels, text, shadows painted into a backdrop, or UI.

Recommended source-sheet destination once approved:

`src/assets/miller/interaction/classic-miller-interaction-pose-sheet.png`

Recommended derived production cutouts:

`src/assets/miller/interaction/classic-miller-notice-dog.png`

`src/assets/miller/interaction/classic-miller-lean-reach.png`

`src/assets/miller/interaction/classic-miller-pet-dog.png`

`src/assets/miller/interaction/classic-miller-rise.png`

Current accepted production cutouts are `classic-miller-notice-dog.png`,
`classic-miller-lean-reach.png`, and `classic-miller-pet-dog.png`. The lean
pose deliberately serves in reverse for the short rise; no redundant rise
cutout is shipped.

The calm reaction uses the approved independent companion asset
`src/assets/companion/sheepdog-pet-reaction.png`, copied from the already
reviewed Samwise sheepdog workflow. It remains a separate dog actor; no Miller
pose contains dog pixels.

The canonical neutral may continue using `src/assets/miller_classic.png` if its
ground/scale can be normalized with the derived set.

## Pose requirements

All poses retain Classic Miller's face, blue hat, blue trench coat, clothing,
body proportions, painterly rendering, and approximate apparent height.

- **neutral** — existing canonical standing pose.
- **noticeDog** — a small downward-left head/upper-body orientation toward the
  sheepdog; no reach is necessary.
- **leanReach** — modest forward bend, knees only slightly flexed, one hand
  naturally lowered toward the dog; no distorted coat or duplicated limb.
- **petDog** — same grounded lean with the hand calmly placed at the dog-head
  contact area; no dog pixels in the Miller cutout.
- **rise** — a believable intermediate return from the lean to standing.

Each source pose must have an alpha channel, no baked background, no changed
face or hat, no malformed hands, no extra limbs, and a consistent foot/ground
line. Reject any otherwise attractive pose that misses those requirements.

## Anchor metadata

The eventual Classic actor definition should use named normalized anchors, not
viewport offsets:

```js
ground: { x: 0.5, y: 0.97 }
petHand: { x: /* measured from the approved lean/pet cutout */, y: /* measured */ }
```

`petHand` must be measured from the final production cutout and align with the
existing sheepdog `petHead` anchor (`{ x: 0.64, y: 0.28 }`). It should describe
Miller's lowered hand, not a guessed screen coordinate.

Current production metadata uses `ground: { x: 0.5, y: 0.97 }` and
`petHand: { x: 0.17, y: 0.71 }` for Classic's reviewed reach/pet crop. These
are normalized asset-space anchors; scene placement remains host-owned CSS.

## Production gate

Do not register or animate these poses until each cutout has been visually
reviewed against the canonical Classic portrait and the hand-to-dog alignment
can be inspected in the Miller scene. Until then, all Miller variants retain
the safe fallback: dog arrives and sits; Miller remains still.

`miller_search.png` remains an existing search illustration. It may later
inform a separate `work_started` presentation, but it is not an interaction or
petting asset and must not change the companion's authority boundary.

## Walking and result-indication artwork

`src/assets/companion/miller-companion-walk-result-pose-sheet.png` is the
retained RGB source/reference sheet for Classic's walking references and the
correct gray-and-white sheepdog identity. Its checkerboard is baked RGB, so it
is never rendered at runtime. Reviewed derived, true-alpha production cutouts
are:

- `src/assets/miller/interaction/classic-miller-step-left-01.png`
- `src/assets/miller/interaction/classic-miller-step-left-02.png`
- `src/assets/companion/sheepdog-result-point.png`

The Classic steps retain the canonical fedora, face, navy suit/coat, tall
proportions, and coherent successive gait. They share
`ground: { x: 0.5, y: 0.97 }` and drive the bounded reading-position walk.
The dog result-point is a separate seated actor with the approved gray/cream
coat, dark floppy ears, green bandana, gold tag, and a restrained raised paw;
it uses `ground: { x: 0.5, y: 0.97 }` and
`indicatePaw: { x: 0.62, y: 0.52 }`.

Do not turn the neutral cutout into a walk with CSS rotation, skewing, or a
sliding translation. Any replacement walking artwork needs two separate,
true-alpha Classic Miller-only cutouts:

- **stepLeft01** — weight on the right foot, left foot stepping toward the
  reading position; coat opening and hem follow the stride naturally.
- **stepLeft02** — weight transferred, opposite foot advancing; same hat,
  face, suit, coat, scale, and ground line as `stepLeft01`.

Both require `ground: { x: 0.5, y: 0.97 }`, matching apparent height and
transparent edges. They must be reviewed beside `miller_classic.png` before
any walking animation replaces the current stable reading position.

The result-point pose must remain an independent transparent cutout: the same
seated older sheepdog, one front paw subtly raised toward the card, coherent
four-legged anatomy, matching scale/ground anchor, and no Miller, card, text,
or background pixels. `sheepdog-pet-reaction.png` remains the calm result-side
attentive pose before and after the single indication.

`src/companion/millerCompanionPosePreview.js` is the isolated, development
preview registry for these approved slots. It defines transparent bounds,
named anchors, and neutral mock destination geometry. Production does not
depend on this preview registry.
