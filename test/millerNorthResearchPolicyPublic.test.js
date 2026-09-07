import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import projection from "../src/data/miller-north-research-policy-public-v1.json" with { type: "json" }
import { validateMillerNorthResearchPolicyProjection } from "../server/millerNorthResearchPolicyPublic.js"

test("Research and Policy projection is publication-safe, sourced and province-complete", () => {
  const result = validateMillerNorthResearchPolicyProjection(projection)
  assert.deepEqual({ cases: result.cases, recommendations: result.recommendations }, { cases: 3, recommendations: 24 })
  assert.equal(result.displayed_claims, result.evidence_bearing_claims)
  assert.ok(result.sources >= 30)
  assert.equal(result.discovery_findings, 9)
})

test("In Plain Sight recommendation evidence states retain canonical counts", () => {
  const record = projection.cases.find(item => item.slug === "in-plain-sight")
  assert.deepEqual(record.status_counts, { implemented: 2, substantially_implemented: 3, partially_implemented: 12, implementation_underway: 4, implementation_evidence_fragmentary: 3 })
  assert.equal(record.recommendations.length, 24)
  assert.match(record.recommendations.find(item => item.number === 11).source_note, /original In Plain Sight report/)
})

test("browser projection excludes private workflow fields and anonymized identities", () => {
  const serialized = JSON.stringify(projection)
  assert.doesNotMatch(serialized, /owner_review|owner_assessment|owner_view|public_role_people|patient_name|complainant_name|witness_name|private_address|personal_email|private_phone|medical_record/i)
  assert.doesNotMatch(serialized, /\b(?:mnrpc|mnpce|mnpct|mnpcs|frf|fdedge|farm_dossier)_[a-z0-9_]+\b/i)
})

test("Saskatchewan and Alberta preserve critical legal and geographic boundaries", () => {
  const saskatchewan = projection.cases.find(item => item.province === "Saskatchewan")
  const alberta = projection.cases.find(item => item.province === "Alberta")
  assert.match(saskatchewan.legal_note, /did not adjudicate the merits/i)
  assert.match(saskatchewan.policy_and_government.find(item => item.title.includes("S-228")).description, /not presented as a retroactive/i)
  assert.match(alberta.selection_note, /Red Deer and Central Alberta search was completed first/i)
  assert.match(alberta.selection_note, /Absence of a deep public record is not evidence/i)
})

test("Research and Policy route, navigation and responsive reading patterns are wired", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const evidence = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  const view = readFileSync(new URL("../src/site/MillerNorthResearchPolicy.jsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../src/site/MillerNorthResearchPolicy.css", import.meta.url), "utf8")
  assert.match(app, /indigenous-healthcare-evidence\/research-policy/)
  assert.match(evidence, /MillerNorthPublicNav current="evidence"/)
  assert.doesNotMatch(evidence, /ihe-layer-context/)
  for (const phrase of ["What happened", "Why this matters", "What we know", "What remains unclear", "Sources and evidence", "Recommendation tracker"]) assert.match(view, new RegExp(phrase))
  assert.match(css, /@media\(max-width:600px\)/)
  assert.match(css, /\.mnrp-recommendation summary/)
  assert.doesNotMatch(view, /owner_review|source_family_id|production_mutations|publication_mutations/)
})

test("bounded discovery cannot silently promote a new navigation case", () => {
  assert.deepEqual(projection.cases.map(item => item.province), ["British Columbia", "Saskatchewan", "Alberta"])
  assert.ok(Object.values(projection.bounded_discovery).every(findings => findings.length <= 5))
})
