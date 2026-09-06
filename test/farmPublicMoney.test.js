import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import dataset from "../artifacts/farm/farm-public-money-pilot-2026-09-06.json" with { type: "json" }
import fixtures from "../artifacts/farm/farm-canonical-research-fixtures-2026-09-06.json" with { type: "json" }
import deliverables from "../artifacts/farm/farm-public-money-deliverable-input-2026-09-06.json" with { type: "json" }
import { generateOwnerSummary, generateResearchBrief } from "../server/farmResearchViews.js"
import { rankMoneyFindings, validateCanonicalResearchFixtures, validateFundingRecord, validatePublicMoneyDataset } from "../server/farmPublicMoney.js"

test("public-money pilot validates domains, trace levels and private gates", () => {
  const result = validatePublicMoneyDataset(dataset, registry)
  assert.deepEqual(result.domains, { miller_addictions: 10, miller_north_indigenous_healthcare: 6 })
  assert.equal(result.records, 16)
  assert.equal(result.evidence_edges, 32)
  assert.equal(result.owner_review, 12)
  assert.deepEqual(result.traces, {
    program_level_funding_confirmed: 4,
    recipient_level_funding_confirmed: 2,
    service_level_funding_confirmed: 4,
    operational_result_confirmed: 1,
    amount_not_service_attributable: 3,
    announced_not_verified: 1,
    partial_trace: 1,
  })
})

test("program envelopes require explicit non-attribution cautions", () => {
  const sourceIds = new Set(registry.sources.map(item => item.source_family_id))
  const road = dataset.records.find(item => item.funding_record_id === "fmoney_miller_road_expansion_154m")
  assert.match(road.amount_note, /cannot be allocated/)
  assert.throws(() => validateFundingRecord({ ...road, amount_note: "Funding for selected services." }, sourceIds), /attribution_caution/)
})

test("financial records reject publication, unsafe amounts and sensitive fields", () => {
  const sourceIds = new Set(registry.sources.map(item => item.source_family_id))
  const record = dataset.records[0]
  assert.throws(() => validateFundingRecord({ ...record, publication_state: "approved_for_publication" }, sourceIds), /publication_gate/)
  assert.throws(() => validateFundingRecord({ ...record, amount: -1 }, sourceIds), /amount_invalid/)
  assert.throws(() => validateFundingRecord({ ...record, patient_name: "not allowed" }, sourceIds), /private_field/)
})

test("canonical fixtures remain private validation examples across both domains", () => {
  assert.deepEqual(validateCanonicalResearchFixtures(fixtures, registry), { fixtures: 4, miller: 2, miller_north: 2 })
  assert.ok(fixtures.fixtures.every(item => item.confidence === "high" && item.unresolved_questions.length >= 1))
})

test("money significance ranking is deterministic and non-evaluative", () => {
  const first = rankMoneyFindings(dataset.findings)
  const second = rankMoneyFindings(dataset.findings)
  assert.deepEqual(first, second)
  assert.equal(first[0].finding_id, "fmfind_fnha_network_capital")
  assert.ok(first.every(item => /not a judgment of adequacy, efficiency, compliance, or value for money/.test(item.significance.notice)))
})

test("finance owner summary and research brief were produced by shared generators", () => {
  const owner = readFileSync(new URL("../artifacts/farm/finance-public-money-owner-summary-2026-09-06.md", import.meta.url), "utf8")
  const passOwner = readFileSync(new URL("../artifacts/farm/farm-canonical-public-money-owner-summary-2026-09-06.md", import.meta.url), "utf8")
  const brief = readFileSync(new URL("../artifacts/farm/public-money-research-brief-2026-09-06.md", import.meta.url), "utf8")
  assert.equal(owner, generateOwnerSummary(deliverables.owner_summary))
  assert.equal(passOwner, generateOwnerSummary(deliverables.pass_owner_summary))
  assert.equal(brief, generateResearchBrief(deliverables.research_brief))
})

test("source registry contains bounded public-finance and procurement families", () => {
  assert.equal(registry.sources.length, 36)
  assert.ok(registry.sources.some(item => item.source_family_id === "fogs_bc_health_authority_financials"))
  assert.ok(registry.sources.some(item => item.source_family_id === "fogs_bc_bid"))
})
