import assert from "node:assert/strict"
import test from "node:test"
import funding from "../artifacts/miller/miller-first-nations-funding-assistance-2026-09-06.json" with { type: "json" }
import supports from "../artifacts/miller/miller-practical-supports-2026-09-06.json" with { type: "json" }
import assistance from "../artifacts/miller/miller-funding-assistance-2026-09-06.json" with { type: "json" }
import sourceExtension from "../artifacts/miller/miller-practical-source-registry-extension-2026-09-06.json" with { type: "json" }
import { nextFreshnessCheck, validateFirstNationsFundingDataset, validatePracticalSupportsDataset } from "../server/millerPracticalSupports.js"

test("First Nations funding benchmark meets the bounded target and keeps review gates", () => {
  const result = validateFirstNationsFundingDataset(funding)
  assert.equal(result.records, 41)
  assert.deepEqual(result.jurisdictions, ["Alberta", "British Columbia", "Federal", "Saskatchewan"])
  assert.equal(funding.records.every((record) => record.owner_review_state && record.freshness_note), true)
  assert.equal(funding.records.some((record) => record.intake_status === "open"), true)
  assert.equal(funding.records.some((record) => record.intake_status === "verify_before_applying"), true)
})

test("practical support benchmark uses stable Miller matches without mutation", () => {
  assert.deepEqual(validatePracticalSupportsDataset(supports), { records: 66, exact_miller_matches: 60, new_candidates: 6 })
  assert.ok(supports.records.every((record) => record.owner_review_state))
  assert.ok(supports.records.filter((record) => record.match_state === "exact_existing_resource").every((record) => record.miller_resource_id.startsWith("curated:")))
})

test("funding and support artifacts reject publication and sensitive fields", () => {
  assert.throws(() => validateFirstNationsFundingDataset({ ...funding, publication_state: "public" }), /funding_dataset_gate/)
  assert.throws(() => validateFirstNationsFundingDataset({ ...funding, records: [{ ...funding.records[0], patient_name: "not allowed" }] }), /private_field/)
  assert.throws(() => validatePracticalSupportsDataset({ ...supports, records: [{ ...supports.records[0], private_notes: "not allowed" }] }), /private_field/)
})

test("freshness cadence is deterministic and shorter for open intakes", () => {
  const from = new Date("2026-09-06T00:00:00Z")
  assert.equal(nextFreshnessCheck({ intake_status: "open" }, from), "2026-10-06")
  assert.equal(nextFreshnessCheck({ intake_status: "recurring" }, from), "2026-11-05")
  assert.equal(nextFreshnessCheck({ intake_status: "verify_before_applying" }, from), "2026-12-05")
})

test("Miller assistance and source-registry extension remain private structural inputs", () => {
  assert.equal(assistance.private, true)
  assert.equal(assistance.publication_state, "candidate_only")
  assert.equal(assistance.records.length, 7)
  assert.equal(sourceExtension.private, true)
  assert.equal(sourceExtension.source_families.length, 10)
  assert.equal(new Set(sourceExtension.source_families.map((item) => item.source_family_id)).size, 10)
})
