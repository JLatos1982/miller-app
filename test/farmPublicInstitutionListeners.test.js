import test from "node:test"
import assert from "node:assert/strict"

import { PUBLIC_INSTITUTION_LISTENER_CONFIGS, comparePublicInstitutionDocuments, parsePublicInstitutionIndex, runPublicInstitutionIndexListener } from "../server/farmPublicInstitutionListeners.js"

const html = '<main><a href="/reports/case-1?utm_source=test">Public report: case one</a><a href="/reports/case-2">Investigation report: case two</a></main>'

test("public-institution parsing canonicalizes URLs and keeps indexed material non-publishing", () => {
  const documents = parsePublicInstitutionIndex(html, { baseUrl: "https://oversight.example/", listenerId: "oversight", include: /report/i, domain: "policing_custody_corrections" })
  assert.equal(documents.length, 2)
  assert.equal(documents[0].url, "https://oversight.example/reports/case-1")
  assert.equal(documents[0].evidence_role, "index_discovered")
  assert.equal(documents[0].publication_authority, false)
})

test("public-institution parsing rejects non-HTTP, self and pagination navigation links", () => {
  const navigation = '<a href="javascript:void(0)">Case Number</a><a href="/">Public Reports</a><a href="/?page=2">2</a><a href="/report.pdf">Closed - With Public Report</a>'
  const documents = parsePublicInstitutionIndex(navigation, { baseUrl: "https://oversight.example/", listenerId: "oversight", include: /report|case number/i, domain: "policing_custody_corrections" })
  assert.deepEqual(documents.map(item => item.url), ["https://oversight.example/report.pdf"])
})

test("public-institution comparison baselines safely and detects later additions", () => {
  const initial = parsePublicInstitutionIndex(html, { baseUrl: "https://oversight.example/", listenerId: "oversight", include: /report/i, domain: "policing_custody_corrections" })
  const baseline = comparePublicInstitutionDocuments(initial, {})
  assert.equal(baseline.new_documents.length, 0)
  assert.equal(baseline.unchanged_documents.length, 2)
  const later = [...initial, { ...initial[0], source_id: "oversight:new", url: "https://oversight.example/reports/new", document_fingerprint: "new" }]
  assert.equal(comparePublicInstitutionDocuments(later, { documents: initial }).new_documents.length, 1)
})

test("listener run returns the common contract without treating an index as a finding", async () => {
  const result = await runPublicInstitutionIndexListener({
    listenerId: "oversight",
    url: "https://oversight.example/",
    domain: "policing_custody_corrections",
    include: /report/i,
    fetchImpl: async () => ({ ok: true, text: async () => html }),
  })
  assert.equal(result.checked, 2)
  assert.equal(result.new_documents, 0)
  assert.equal(result.owner_review, 0)
  assert.match(result.notes[0], /not treated as findings or incidents/i)
})

test("parser migrations baseline without manufacturing source updates", async () => {
  const prior = parsePublicInstitutionIndex(html, { baseUrl: "https://oversight.example/", listenerId: "oversight", include: /report/i, domain: "policing_custody_corrections" })
  const result = await runPublicInstitutionIndexListener({ listenerId: "oversight", url: "https://oversight.example/", domain: "policing_custody_corrections", include: /report/i, previous: { documents: prior }, fetchImpl: async () => ({ ok: true, text: async () => html }) })
  assert.equal(result.updated_documents, 0)
  assert.equal(result.owner_review, 0)
  assert.equal(result.memory.parser_version, 2)
  assert.match(result.notes[0], /presentation-only normalization/i)
})

test("configured public-institution adapters have stable identifiers and safe domains", () => {
  assert.deepEqual(Object.keys(PUBLIC_INSTITUTION_LISTENER_CONFIGS).sort(), [
    "alberta_asirt_releases",
    "bc_child_youth_accountability",
    "bc_iio_public_reports",
    "federal_corrections_accountability",
    "federal_crcc_reports",
    "saskatchewan_child_youth_accountability",
  ])
  assert.ok(Object.values(PUBLIC_INSTITUTION_LISTENER_CONFIGS).every(item => /^https:\/\//.test(item.url) && item.include instanceof RegExp))
})
