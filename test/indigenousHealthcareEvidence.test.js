import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

import { INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST } from "../src/data/indigenousHealthcareEvidenceManifest.js"

const projection = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}
const fingerprint = value => createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")
const expectedRecordKeys = ["care_setting", "evidence_status", "evidence_type", "methodology", "organization", "province", "public_record_id", "recommendation_action", "source", "summary", "year"].sort()
const expectedRecordKeysWithCaution = [...expectedRecordKeys, "caution"].sort()
const expectedSourceKeys = ["publication_date", "publisher", "source_type", "title", "url"].sort()
const expectedLegacySourceKeys = expectedSourceKeys.filter(key => key !== "source_type")

test("approved First Nations Healthcare Evidence projection is public-only and approval-bound", () => {
  assert.equal(projection.schema_version, INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.projectionVersion)
  assert.equal(projection.records.length, INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.publicRecordCount)
  assert.equal(new Set(projection.records.map(record => record.public_record_id)).size, 517)
  assert.equal(projection.records.filter(record => record.evidence_status === "reported_account").length, 45)
  assert.equal(projection.records.filter(record => record.evidence_status === "systemic_evidence").length, 356)
  assert.equal(projection.records.filter(record => record.evidence_status === "official_investigation").length, 108)
  assert.equal(projection.records.filter(record => record.evidence_status === "procedural_adjudicative_context").length, 5)
  assert.equal(projection.records.filter(record => record.evidence_status === "formal_finding").length, 3)
  assert.equal(projection.projection_fingerprint, INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.projectionFingerprint)
  assert.equal(fingerprint(projection.records), INDIGENOUS_HEALTHCARE_EVIDENCE_MANIFEST.projectionFingerprint)
  for (const record of projection.records) {
    assert.ok([expectedRecordKeys, expectedRecordKeysWithCaution].some(keys => JSON.stringify(Object.keys(record).sort()) === JSON.stringify(keys)))
    assert.match(record.public_record_id, /^ihe_[a-f0-9]{20}$/)
    assert.ok([expectedLegacySourceKeys, expectedSourceKeys].some(keys => JSON.stringify(Object.keys(record.source).sort()) === JSON.stringify(keys)))
    assert.match(record.source.url, /^https:\/\//)
  }
})

test("Miller integrates the public evidence route and accessible feather without a Samwise runtime dependency", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  assert.match(app, /window\.location\.pathname === "\/indigenous-healthcare-evidence"/)
  assert.match(app, /<FirstNationsHealthcareEvidenceFeather/)
  assert.match(page, /aria-label="First Nations Healthcare Evidence"/)
  assert.match(page, /Reported account/)
  assert.doesNotMatch(page, /samwise|localhost|\/Users\//i)
})
