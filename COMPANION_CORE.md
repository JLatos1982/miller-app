# Miller companion integration

This project carries a local copy of Samwise's portable companion core, adapted from Samwise commit `9307608db4cd20eeb64bf39810415c778945d02c` (`package portable companion core`). It is intentionally copied, not linked: changes are synchronized deliberately between repositories.

The framework-light core is at `src/companion-core/index.js`. The first Miller adapter is `src/companion/millerCompanionAdapter.js`; it provides only a static seated sheepdog, normalized ground/head anchors, and future presentation preferences.

The dog is decorative. It has no authority over search, resource ranking, recommendations, clinical/resource content, geolocation, analytics, or safety logic. Miller remains fully functional when the companion is absent.

Future intent lifecycle, not implemented here:

`input_started → work_started → authoritative result rendered → destination_ready → work_completed → settle`

Only after Miller has selected and rendered a result may a future host adapter convert that element's bounds to a normalized decorative destination. It must not send query text, result content, ranking scores, or user data to the companion. Any future sound stays optional, low-volume, suppressible, and non-essential.
