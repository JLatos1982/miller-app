# Classic Miller interaction-pose specification

## Current decision

Classic Miller's only repository source is the canonical production portrait at
`src/assets/miller_classic.png` (1024 × 1536 RGBA). It is a single flattened
standing illustration, with no editable layers or companion-interaction poses.
It remains the canonical neutral asset and must not be overwritten.

A generated five-pose review sheet was evaluated for this checkpoint and
rejected: its checkerboard-looking backdrop was baked pixels rather than alpha.
No generated sheet or cutout is retained in this repository.

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

## Production gate

Do not register or animate these poses until each cutout has been visually
reviewed against the canonical Classic portrait and the hand-to-dog alignment
can be inspected in the Miller scene. Until then, all Miller variants retain
the safe fallback: dog arrives and sits; Miller remains still.

`miller_search.png` remains an existing search illustration. It may later
inform a separate `work_started` presentation, but it is not an interaction or
petting asset and must not change the companion's authority boundary.
