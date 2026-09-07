import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildMillerNorthPublicIncidentPresentation, validateMillerNorthPublicIncidentPresentation } from "../server/millerNorthPublicPresentation.js"
import { validateMillerNorthLiveListeningProjection } from "../server/millerNorthLiveListeningPublic.js"

const raw = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
const grouped = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-groups-public-v1.json", import.meta.url), "utf8"))
const listening = JSON.parse(readFileSync(new URL("../src/data/miller-north-live-listening-public-v1.json", import.meta.url), "utf8"))

test("presentation grouping covers every approved source row once without mutating it", () => {
  const result = validateMillerNorthPublicIncidentPresentation(grouped, raw.records)
  assert.equal(result.valid, true)
  assert.equal(result.raw_source_records, 695)
  assert.equal(grouped.groups.flatMap(group => group.member_public_record_ids).length, 695)
  assert.ok(grouped.groups.length < raw.records.length)
  assert.equal(grouped.mode, "non_destructive_public_presentation")
})

test("synthetic duplicate cases are conservatively grouped while same-source incidents stay distinct", () => {
  const base = { province: "alberta", year: 2024, care_setting: "hospital", organization: "Health system", evidence_type: "reported account", evidence_status: "reported_account", methodology: "test", recommendation_action: null }
  const sourceA = { title: "Report", publisher: "News A", url: "https://example.test/a" }
  const sourceB = { title: "Report", publisher: "News B", url: "https://example.test/b" }
  const result = buildMillerNorthPublicIncidentPresentation([
    { ...base, public_record_id: "a", summary: "Same reported event.", source: sourceA },
    { ...base, public_record_id: "b", summary: "Same reported event.", source: sourceA },
    { ...base, public_record_id: "c", summary: "Same reported event.", source: sourceB },
    { ...base, public_record_id: "d", summary: "A separate event in the same article.", source: sourceA },
  ])
  assert.equal(result.groups.length, 2)
  assert.equal(result.groups.find(group => group.source_record_count === 3).presentation_classification, "same_incident_additional_source")
  assert.equal(result.metrics.exact_duplicate_rows_suppressed, 1)
  assert.equal(result.metrics.additional_source_rows_consolidated, 1)
  assert.equal(result.metrics.related_not_duplicate_source_clusters, 1)
})

test("Live Listening projection is anonymized, source-backed, and count reconciled", () => {
  const result = validateMillerNorthLiveListeningProjection(listening, { evidenceGroupIds: grouped.groups.map(group => group.public_record_id) })
  assert.deepEqual(result, { valid: true, items: 15, linked: 1, corroborated: 10, reviewing: 4 })
  assert.equal(listening.metrics.leads_inspected, 22)
  assert.equal(listening.metrics.duplicates_suppressed, 1)
  assert.equal(listening.metrics.held_back, 6)
  assert.doesNotMatch(JSON.stringify(listening), /candidate_id|social_lead_id|public_account_name|owner_review|patient_name/i)
})

test("Live Listening validator rejects names, private notes, unsupported links and weak sources", () => {
  const unsafe = structuredClone(listening)
  unsafe.items[0].summary = "A public report named Pearl Gambler."
  assert.throws(() => validateMillerNorthLiveListeningProjection(unsafe, { evidenceGroupIds: grouped.groups.map(group => group.public_record_id) }), /identifying/)
  const unknownLink = structuredClone(listening)
  unknownLink.items[0].linked_evidence_group_id = "iheg_00000000000000000000"
  assert.throws(() => validateMillerNorthLiveListeningProjection(unknownLink, { evidenceGroupIds: grouped.groups.map(group => group.public_record_id) }), /unknown_evidence_group/)
})

test("Miller North preserves public routes while the primary navigation uses four visitor-facing sections", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  const evidence = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  const live = readFileSync(new URL("../src/site/MillerNorthLiveListening.jsx", import.meta.url), "utf8")
  const method = readFileSync(new URL("../src/site/MillerNorthMethodology.jsx", import.meta.url), "utf8")
  assert.match(app, /live-listening/)
  assert.match(app, /methodology/)
  assert.match(nav, /MILLER_NORTH_PUBLIC_SECTIONS/)
  assert.doesNotMatch(nav, /Live Listening/)
  assert.match(evidence, /indigenous-healthcare-evidence-groups-public-v1/)
  assert.doesNotMatch(evidence, /recent-public-signals-v1/)
  assert.match(live, /A reported account is not the same as a formal finding/)
  assert.match(method, /Please do not submit confidential medical records or private personal information/)
})

test("core public pages use mobile card layouts, accessible labels and calm evidence states", () => {
  const live = readFileSync(new URL("../src/site/MillerNorthLiveListening.jsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../src/site/MillerNorthLiveListening.css", import.meta.url), "utf8")
  assert.match(live, /aria-label="Recent public report filters"/)
  assert.match(live, /<details>/)
  assert.match(css, /@media\(max-width:520px\)/)
  assert.doesNotMatch(css, /#(?:f00|ff0000|0f0|00ff00)\b/i)
})
