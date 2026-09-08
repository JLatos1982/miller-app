# Farm operational worker and listener handoff

Date: 2026-09-07
Scope: Miller and Miller North operational infrastructure; read-only/detect-propose only

## Igor boundary

Igor now runs as a separate one-shot local worker process. Samwise creates a short-lived signed request, the worker verifies the HMAC, freshness, nonce, exact capability and zero-authority flags, and Samwise verifies a signed response bound to the request. A private credential and replay ledger live under ignored `.farm-operations/` state with mode `0600`; no secret is returned through health or job output.

The worker exposes no network listener and no generic command execution surface. Its declared capabilities are limited to:

- `resource_url_health`
- `structured_diff`
- `listener_batch_parse`

Three real scheduler cycles completed: 16 canonical resource URLs, a 40-record resource snapshot, and a 20-record publication-safe incident/listener batch. The jobs performed no publication or production mutation. Offline, bad-authentication, timeout/malformed-output and replay paths fail closed; Samwise does not silently take over an Igor-only job.

## New listeners

The FNHO listener watches the [annual reports](https://fnhoo.ca/annual-reports/), governance and services pages. FNHO remains identified as an Indigenous-led accountability source. The baseline contains four canonical documents. Aggregate complaint themes are not converted into individual incidents.

The Saskatchewan exact-document listener uses the known Trevor Charles, Vincent Lee Tuckanow and Trevor Dubois public pages and explicit milestone dates. It does not broad-scrape Saskatchewan Publications and does not infer Indigenous identity. The Saskatchewan legal listener uses public citation/index surfaces and preserves `unclassified_owner_review` until a procedural stage is verified. Two of its three initial endpoints were unavailable in the first cycle, so this listener is technically operational but should remain under reliability observation.

## Jordan's Principle owner review

The 2016 Canadian Human Rights Tribunal merits decision (`2016 CHRT 2`) and the Federal Court judicial-review result (`2021 FC 969`) belong to a national Jordan's Principle legal/accountability chain. They do **not** belong to the Saskatchewan incident chain titled “The Silent World of Jordan.” The graph linker now requires an exact chain ID/title rather than substring matching, preventing this false association.

The 2016 decision is a merits finding and remedial order. The 2021 Federal Court decision dismissed Canada's judicial-review applications relating to compensation and Jordan's Principle eligibility orders. Neither proves later implementation or outcomes. A [May 2025 Indigenous Services Canada audit](https://www.sac-isc.gc.ca/eng/1753100031042/1753100058429) adds later implementation evidence and four management recommendations with planned actions; management agreement remains distinct from completion and outcome evidence.

Recommendation: create a separate Jordan's Principle legal/accountability subchain only after an owner-approved crosswalk of the major CHRT orders, court review, federal responses, the 2025 audit action plan and independent/First Nations-led implementation evidence. Do not merge it with “The Silent World of Jordan.”

## Miller location quality

The scheduled static audit reviewed 300 legacy Miller resource rows and produced proposals only:

- 31 safe deterministic province/whitespace normalization candidates
- 77 missing-address research candidates
- 21 missing-province research candidates
- 49 address-shape warnings
- 16 duplicate-location owner-review groups

These counts are triage signals, not proof that a service is unmappable or incorrect. Virtual/non-fixed services and shared facilities require contextual review. Authoritative coordinate/geocode/public-map decisions remain in the existing private, owner-gated location-QC workflow. Production mutations: zero.

## Resource and dependency health

The real-network Igor sample found 12 direct successes, one valid redirect, two HTTP 404 responses and one transient failure. Repeated failures are recheck candidates; none was classified as closed. The read-only production dependency audit checked 134 production dependencies and reported one moderate advisory, no high or critical advisory. No package was upgraded.

## Backup and recovery readiness

- Listener state, worker replay state, worker state and run history are local ignored files. Atomic writes protect current state, but no off-host backup was verified.
- Canonical resource/evidence registries and scheduler configuration are protected by Git history once committed and pushed.
- Supabase backup/restore capability was not exercised. Production database mutation and restoration tests remain outside this pass.
- Owner email delivery configuration is not present locally; privacy-filtered preview generation is working, but no recipient/provider delivery was attempted.

Owner action: decide where encrypted off-host copies of `.farm-operations` listener memory/run history should live, and define a supervised Supabase restore drill. Do not copy the worker credential into reports or email.

## Cadence

No established research listener had three completed production cycles with enough evidence to justify changing its cadence automatically. Current weekly/biweekly/monthly choices remain in place. The three Igor maintenance jobs are monthly. FNHO and Saskatchewan legal are monthly; Saskatchewan exact-document checks are milestone-driven. The dependency advisory is monthly and location detect/propose is weekly.

The strongest next operational seam is a second and third observed cycle for the high-yield research listeners, followed by evidence-based cadence changes. The best next worker enhancement is deterministic document metadata extraction—not recurring Qwen triage.

## Local-model result

Qwen 2.5 3B was tested on the narrower extraction task requested: organization, date, province, explicit care setting and recommendation ID across five reviewed records. It produced valid JSON for all five and no unsupported extracted term, but only 12 of 25 expected fields matched (48%) and the batch took 31.6 seconds. It was especially weak on exact organization/date extraction. Recurring Qwen remains disabled; the Farm's deterministic parsers are both faster and more accurate for these fields.

## Delivery and activation

The weekly-email delivery boundary now validates recipient shape, sender availability and the privacy flags on the structured payload before calling the existing email sender. A mock-sender integration test proves that boundary. Live delivery remains preview-only because no owner recipient/provider configuration is present in this environment.

The daily 6:15 a.m. local Codex heartbeat remains active and runs at most three due jobs. The central registry now contains 24 jobs: 21 enabled and 3 disabled. Newly enabled work is FNHO monthly, Saskatchewan Commission news monthly, Saskatchewan milestone documents, Miller location quality weekly, dependency advisories monthly, and three monthly Igor jobs. Qwen triage, broad CanLII querying and historical scan retries remain off/manual.
