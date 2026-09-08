import assert from "node:assert/strict"
import test from "node:test"
import { benefitsExplorationFixture as exploration } from "./fixtures/privateArtifactSummaries.js"
import { normalizeSamwiseFinding, routeSamwiseFinding } from "../server/samwisePublicRecordsIntelligence.js"

test("public-benefits exploration proves an independent Samwise domain without publishing", () => {
  assert.equal(exploration.capability_id, "samwise_public_records_intelligence")
  assert.equal(exploration.sources_checked, 6)
  assert.equal(exploration.publication_scope, "private_owner_review")
  assert.ok(exploration.findings.length >= 4)
  for (const input of exploration.findings) {
    const finding = normalizeSamwiseFinding(input)
    const routing = routeSamwiseFinding(finding)
    assert.equal(finding.primary_domain, "government_services")
    assert.ok(finding.secondary_domains.length > 0)
    assert.equal(finding.publication_authority, false)
    assert.equal(routing.automatic_publication, false)
    assert.ok(routing.routes.every(route => ["owner_intelligence", "research_context_only"].includes(route)))
  }
})

test("aggregate complaint volume stays monitoring context instead of becoming a formal finding", () => {
  const aggregate = exploration.findings.find(item => item.canonical_finding_id.includes("service-pressure"))
  assert.equal(aggregate.evidence_role, "monitoring_context")
  assert.equal(aggregate.intelligence_state, "known")
  assert.match(aggregate.summary, /not a finding/i)
})
