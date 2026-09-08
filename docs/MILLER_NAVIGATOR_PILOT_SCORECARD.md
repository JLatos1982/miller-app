# Miller Navigator pilot scorecard

Measured: 2026-09-08

| Area | State | Evidence / next gate |
|---|---|---|
| Data coverage | Ready for bounded Western pilot | 482 publication-safe mobile resources in the current generated projection; B.C./Alberta/Saskatchewan and Canada-wide coverage retained. Breadth is not the success metric. |
| Mobile readiness | Needs work | 192/482 (39.8%) conservatively mobile-ready after the five-seam and bounded 25-record legacy refresh. Useful records remain visible when a noncritical enrichment field is missing. |
| Search | Ready for prototype | Existing 12/12 major-city and 13/13 regional benchmarks were retained before this pass. |
| Professional guidance | Ready for prototype | Deterministic need decomposition, bounded pathway, related barriers, and source-backed safeguards returned by the API. |
| Regional handling | Ready for prototype | Located/serves/intake/province navigation remain distinct; broadening is now explicit. |
| Voice | Needs native validation | Apple Speech implementation and typed fallback exist; transcript is not persisted. Xcode/simulator verification is unavailable in this environment. |
| Selection/handoff | Ready for prototype | Individual selection plus an optional deterministic set of up to three; the pre-share screen supports removal, reordering and omission of optional detail groups. |
| Share and print | Needs native validation | Share Sheet and AirPrint code exist; content-level tests pass. Mail/Messages/AirPrint require simulator/device QA. |
| Privacy | Ready for internal prototype | Generic queries, no client record, no query persistence, local aggregate metrics, public-safe API projection. Formal pilot privacy review remains advisable. |
| API | Ready for internal prototype | v1, rate-limited, body/query/result bounds, no-store response, bounded iOS timeout, explicit errors. Authentication remains intentionally public-read-only for the prototype. |
| Native build | Blocked | Full Xcode is not installed/selected on this host; command-line Swift is not a substitute for SwiftUI/UIKit/Speech validation. |
| Device testing | Blocked | Requires Xcode signing, simulator runtimes, and an owner-authorized device/TestFlight step. |
| Correction loop | Ready for prototype | Bounded reasons send only resource identity and correction category into the existing review flow. |

## Professional workflow benchmark

`npm run benchmark:miller-navigator` exercises 24 realistic scenarios across multi-need transitions, OAT access, affordability, rural/regional navigation, Indigenous navigation, re-entry, legal/housing, funding/transport, and family support.

Latest local deterministic run: 24/24 passed; zero unsupported-claim failures; median server-side pipeline time approximately 80 ms and maximum approximately 126 ms on this host. Every scenario returned a relevant top result, a pathway, explainability, a selectable handoff set, and the Miller-only public boundary.

The reported path is an interaction model, not observed human timing: typed search can reach the native share sheet in four taps (focus, search, review suggested pack, Share); voice is four or five depending on whether final recognition stops automatically or the worker taps Stop. The under-60-second target is **not yet validated**. It requires task timing on iPhone/iPad with at least five frontline users and a mix of typed and spoken messy scenarios.

`npm run benchmark:miller-navigator-rural` adds five targeted Port Hardy, Haida Gwaii, La Loche, High Level and Fort St. John workflows. The current deterministic run passes 5/5 with no unsupported claims or false local-facility claims.

## Pilot protocol

For each scenario, start at Home and stop when the native share sheet or print controller opens. Record elapsed time, taps, whether the first result was useful, geography accuracy, missing/wrong access facts, any unsupported inference, and whether the pack could be handed to a client unchanged. Never enter real client identifiers.

Suggested acceptance gate:

- at least 80% of realistic tasks reach a useful handoff within 60 seconds;
- zero Miller North/private leakage and zero unsupported eligibility/availability statements;
- at least 90% correct local-versus-serves wording;
- correction rate and no-result/broadening use are reported, not hidden.

## Xcode next steps

1. Install/select full Xcode 16+ and an iOS 17+ simulator runtime.
2. Open `ios/MillerNavigator/MillerNavigator.xcodeproj` and build the shared `MillerNavigator` scheme.
3. Run one small iPhone and one iPad simulator with Dynamic Type at default and accessibility sizes.
4. Test microphone denial/authorization, recognition cleanup, network timeout, Share Sheet, Mail/Messages availability, and AirPrint presentation.
5. Inspect VoiceOver order/labels, 44-point controls, contrast, landscape, and large-text reflow.
6. Only then configure signing and an owner-authorized physical device; TestFlight remains a later step.
