# Miller companion integration

This project carries a local copy of Samwise's portable companion core, adapted from Samwise commit `9307608db4cd20eeb64bf39810415c778945d02c` (`package portable companion core`). It is intentionally copied, not linked: changes are synchronized deliberately between repositories.

The framework-light core is at `src/companion-core/index.js`. The first Miller adapter is `src/companion/millerCompanionAdapter.js`; it provides a calm one-time sheepdog arrival using normalized ground/head anchors and future presentation preferences. `src/companion/millerCompanionSequence.js` uses only portable pose/hold/movement concepts.

All current Miller variants are canonical single-pose artwork. `miller_search.png` is an existing magnifying-glass search presentation, not an interaction pose, and remains owned by Miller's existing search UI. This checkpoint does not fabricate a Miller notice or pet pose: Miller remains still while the dog arrives and settles.

## Miller interaction-art requirement

Before adding a Miller notice or pet, create a clean, transparent, Miller-specific derived pose for the relevant variant. It should retain the variant's canonical face, clothing, proportions, and ground line; show a modest forward lean or crouch; keep one hand reaching down toward the companion; and expose normalized `ground` and `petHand` anchors. The sheepdog remains separate, with its existing `ground` and `petHead` anchors. Do not use a combined Miller-and-dog image or deform the current flattened avatar.

The current arrival uses the approved Samwise-derived `sheepdog-walk-01`, `sheepdog-walk-02`, and `sheepdog-sit` assets. Their canonical source remains in Samwise; Miller contains only its local derived copies.

The dog is decorative. It has no authority over search, resource ranking, recommendations, clinical/resource content, geolocation, analytics, or safety logic. Miller remains fully functional when the companion is absent.

## Current Miller lifecycle

`input_started → work_started → authoritative result rendered → destination_ready → settle`

The host emits `input_started` once per meaningful input session without passing the input text. A genuine search emits `work_started`. Only after Miller's own search/ranking has finished and the first result card is rendered does the host measure that already-selected card. `destinationBesideRenderedResult()` receives rectangles only and returns normalized presentation geometry—never a resource identity, query, content, ranking score, clinical detail, or user data.

The sheepdog can use that geometry in a page-level, `aria-hidden`, pointer-inert overlay. It cannot move a card, choose a result, delay a search, or alter focus. Offscreen targets and narrow phones safely leave the dog in its stable companion state. Reduced-motion and disabled-animation modes do the same.

`destination_arrived` is now an internal decorative completion point only. Future sound, if ever added, remains optional, low-volume, suppressible, and non-essential.
