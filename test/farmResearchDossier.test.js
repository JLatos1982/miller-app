import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import newRoads from "../artifacts/farm/research-dossier-new-roads-2026-09-06.json" with { type: "json" }
import creekside from "../artifacts/farm/research-dossier-creekside-road-to-recovery-2026-09-06.json" with { type: "json" }
import fnho from "../artifacts/farm/research-dossier-fnho-governance-funding-2026-09-06.json" with { type: "json" }
import inPlainSight from "../artifacts/farm/research-dossier-in-plain-sight-reporting-2026-09-06.json" with { type: "json" }
import {
  assessDossierCompleteness,
  generateDossierOwnerReport,
  generateDossierResearchBrief,
  validateResearchDossier,
  validateResearchDossierSet,
} from "../server/farmResearchDossier.js"

const dossiers = [newRoads, creekside, fnho, inPlainSight]

test("four canonical dossiers validate while domain records remain separate", () => {
  const result = validateResearchDossierSet(dossiers, registry)
  assert.deepEqual(result, {
    dossiers: 4,
    domains: { miller_addictions: 2, miller_north_indigenous_healthcare: 2 },
    sources: 19,
    edges: 24,
    timeline_events: 17,
    gaps: 9,
    foi_candidates: 4,
    quality_bands: { strong: 4, moderate: 0, incomplete: 0 },
    owner_review: 4,
  })
  assert.ok(dossiers.every(dossier => dossier.publication_scope === "private_owner_review"))
  assert.ok(dossiers.every(dossier => dossier.production_mutations === 0 && dossier.publication_mutations === 0))
})

test("dossier quality is deterministic and explicitly non-reputational", () => {
  for (const dossier of dossiers) {
    const first = assessDossierCompleteness(dossier)
    const second = assessDossierCompleteness(dossier)
    assert.deepEqual(first, second)
    assert.deepEqual(first, dossier.quality_assessment)
    assert.match(first.notice, /not a moral, effectiveness, compliance, or reputational score/)
  }
})

test("every evidence edge and timeline event has a registered authoritative source path", () => {
  for (const dossier of dossiers) {
    const sourceIds = new Set(dossier.source_set.map(source => source.source_id))
    assert.ok(dossier.evidence_graph.edges.every(edge => edge.source_references.length && edge.source_references.every(id => sourceIds.has(id))))
    assert.ok(dossier.timeline.every(event => event.source_references.length && event.source_references.every(id => sourceIds.has(id))))
  }
})

test("scope, privacy and review gates reject unsafe dossier mutations", () => {
  assert.throws(() => validateResearchDossier({ ...newRoads, publication_scope: "public" }, registry), /scope_invalid/)
  assert.throws(() => validateResearchDossier({ ...newRoads, production_mutations: 1 }, registry), /mutation_gate/)
  assert.throws(() => validateResearchDossier({ ...newRoads, patient_name: "not allowed" }, registry), /private_field/)
  const unsafe = structuredClone(newRoads)
  unsafe.evidence_graph.edges[0].source_references = []
  assert.throws(() => validateResearchDossier(unsafe, registry), /edge_source_missing/)
})

test("funding, legal context and implementation scope remain explicit", () => {
  assert.equal(newRoads.funding_public_money[0].attribution_scope, "service_level")
  assert.equal(creekside.funding_public_money[0].attribution_scope, "program_level")
  assert.ok(/cannot be allocated/i.test(creekside.funding_public_money[0].summary))
  assert.equal(fnho.policy_law_governance[1].context_scope, "governance_context")
  assert.equal(inPlainSight.implementation_evidence[1].state, "reporting_unclear")
})

test("information-request candidates are drafts with privacy exclusions", () => {
  const candidates = dossiers.flatMap(dossier => dossier.foi_candidates)
  assert.equal(candidates.length, 4)
  assert.ok(candidates.every(candidate => candidate.status === "draft_not_sent"))
  assert.ok(candidates.every(candidate => candidate.exclusions.includes("private_patient_information")))
})

test("generated owner reports and research briefs match committed artifacts", () => {
  const files = [
    [newRoads, "new-roads"],
    [creekside, "creekside-road-to-recovery"],
    [fnho, "fnho-governance-funding"],
    [inPlainSight, "in-plain-sight-reporting"],
  ]
  for (const [dossier, slug] of files) {
    const owner = readFileSync(new URL(`../artifacts/farm/research-dossier-${slug}-2026-09-06.md`, import.meta.url), "utf8")
    const brief = readFileSync(new URL(`../artifacts/farm/research-brief-${slug}-2026-09-06.md`, import.meta.url), "utf8")
    assert.equal(owner, generateDossierOwnerReport(dossier))
    assert.equal(brief, generateDossierResearchBrief(dossier))
  }
})
