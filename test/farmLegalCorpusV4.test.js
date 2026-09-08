import test from "node:test"
import assert from "node:assert/strict"

import { domainYieldFixture as yieldReport, legalCorpusV4Fixture as corpus } from "./fixtures/privateArtifactSummaries.js"

test("legal v4 is exact-citation led, owner gated and produces no incident duplicates", () => {
  assert.equal(corpus.scope.named_legal_matters_reconciled, corpus.legal_matters.length)
  assert.equal(corpus.scope.new_public_records, 0)
  assert.equal(corpus.scope.production_writes, 0)
  assert.equal(corpus.reconciliation.new_incidents_created, 0)
  assert.equal(corpus.reconciliation.automatic_publications, 0)
})

test("legal v4 preserves procedural and project-routing boundaries", () => {
  const bear = corpus.legal_matters.find(item => item.legal_record_id === "legal_sk_2011_skqb_337")
  const sb = corpus.legal_matters.find(item => item.legal_record_id === "legal_sk_2021_skca_18")
  const pharmacist = corpus.legal_matters.find(item => item.legal_record_id.endsWith("judicial_review_milestone"))
  assert.match(bear.finding_boundary, /did not determine.*discriminated/i)
  assert.equal(sb.project_route, "miller_legal_context_private")
  assert.match(pharmacist.finding_boundary, /No later court citation or decision was located/i)
})

test("formal B.C. discrimination findings remain private pending full-reasons review", () => {
  const candidates = corpus.legal_matters.filter(item => ["2019 BCHRT 275", "2020 BCHRT 52"].includes(item.citation))
  assert.equal(candidates.length, 2)
  assert.ok(candidates.every(item => item.discrimination_evidence === "explicit_discrimination_finding"))
  assert.ok(candidates.every(item => item.publication_candidate === false && item.owner_review_reason.includes("full_reasons_recheck")))
})

test("Jordan chain keeps findings, orders, responses, implementation and outcomes separate", () => {
  const jordan = corpus.legal_matters.find(item => item.legal_record_id === "legal_ca_jordans_principle_chain_v4")
  assert.match(jordan.finding_boundary, /None alone proves complete implementation or improved outcomes/i)
  assert.equal(jordan.project_route, "miller_north_accountability_watch_private_candidate")
})

test("domain yield totals are transparent and public filters remain unchanged", () => {
  const checked = Object.values(yieldReport.domains).reduce((sum, item) => sum + item.documents_checked, 0)
  assert.equal(checked, yieldReport.documents_checked)
  assert.equal(yieldReport.publication.public_records_added, 0)
  assert.equal(yieldReport.publication.public_filters_added, 0)
  assert.equal(yieldReport.source_family_observations.find(item => item.source_family === "child_youth_advocate").assessment, "highest_new_domain_yield")
})

test("private systemic evidence does not manufacture individual incidents", () => {
  assert.ok(corpus.systemic_evidence_candidates.every(item => /^private_/.test(item.disposition)))
  assert.ok(corpus.systemic_evidence_candidates.every(item => !/individual incident$/i.test(item.title)))
  assert.equal(corpus.reconciliation.systemic_evidence_candidates, corpus.systemic_evidence_candidates.length)
})
