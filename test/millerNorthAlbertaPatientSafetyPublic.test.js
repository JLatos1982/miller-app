import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import record from "../src/data/miller-north-alberta-patient-safety-public-v1.json" with { type: "json" }
import { validateAlbertaPatientSafetyProjection } from "../server/millerNorthAlbertaPatientSafetyPublic.js"

test("Alberta patient-safety dossier is source-backed and candid about outcome reporting", () => {
  assert.deepEqual(validateAlbertaPatientSafetyProjection(record), { valid: true, timeline_events: 7, evidence_edges: 8, source_count: 19, maturity: "dossier_ready_with_gaps" })
  assert.match(record.what_happened, /within the Office of Alberta Health Advocates/)
  assert.equal(record.what_remains_unclear.some(item => /independence/i.test(item.text)), true)
  assert.equal(record.metrics.some(metric => metric.label === "2025 correspondence" && metric.value === "321"), true)
  assert.equal(record.what_public_evidence_shows.some(item => /not an outcome or effectiveness measure/.test(item.text)), true)
})
test("Alberta patient-safety projection rejects private fields and unsupported independence", () => {
  assert.throws(() => validateAlbertaPatientSafetyProjection({ ...record, owner_review: true }), /private_field/)
  assert.throws(() => validateAlbertaPatientSafetyProjection({ ...record, what_happened: "The role is independent." }), /overclaim/)
})

test("Research and Policy UI includes the fifth dossier and bounded process details", () => {
  const view = readFileSync(new URL("../src/site/MillerNorthResearchPolicy.jsx", import.meta.url), "utf8")
  assert.match(view, /miller-north-alberta-patient-safety-public-v1\.json/)
  assert.match(view, /function DossierSections/)
  assert.match(view, /cases\.length/)
})
