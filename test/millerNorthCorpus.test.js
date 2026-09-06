import assert from "node:assert/strict"
import test from "node:test"
import { corpusFingerprint, dateSemantics, deriveSourcePublicationTiming, displayDateSemantics, loadReconstructedCorpus, preflightCorpus } from "../server/millerNorthCorpus.js"
import { planMillerNorthSourceObservation } from "../server/millerNorthListener.js"

test("reconstructed corpus preflight is deterministic and preserves the source identity", () => {
  const { records, preflight } = loadReconstructedCorpus()
  assert.equal(preflight.record_count, 695)
  assert.equal(preflight.fingerprint, corpusFingerprint(records))
  assert.equal(preflight.date_coverage.exact_event_date, 0)
  assert.equal(preflight.province_coverage.alberta, 201)
  assert.equal(preflight.province_coverage.british_columbia, 269)
  assert.equal(preflight.province_coverage.saskatchewan, 225)
  assert.deepEqual(preflight, preflightCorpus(records))
})

test("Miller North listener reuses change-only source fingerprints without a scheduler", () => {
  const source = { url: "https://example.test/a", title: "Example", text: "Documented source" }
  const first = planMillerNorthSourceObservation({ source })
  assert.equal(first.decision, "new_source_stage_discovery_candidate")
  assert.equal(first.publication_write, false)
  const unchanged = planMillerNorthSourceObservation({ source, previous: first })
  assert.equal(unchanged.decision, "unchanged_no_repetitive_work")
  assert.equal(unchanged.enqueue, false)
})

test("source timing recovery never promotes a publication date to an event date", () => {
  const recovery = deriveSourcePublicationTiming({ url: "https://example.test/news/2021/05/17/example" })
  assert.deepEqual(recovery, { source_publication_date: "2021-05-17", source_publication_year: 2021, derivation_method: "deterministic_url_date", confidence: "strongly_supported" })
  const semantic = dateSemantics({ year: null, source: { url: "https://example.test/news/2021/05/17/example" } })
  assert.equal(semantic.event_date, null)
  assert.equal(semantic.event_year, null)
  assert.equal(displayDateSemantics(semantic), "Event date unknown · Published 2021-05-17")
  assert.equal(displayDateSemantics({ approximate_event_year: 2021 }), "Approx. 2021")
})
