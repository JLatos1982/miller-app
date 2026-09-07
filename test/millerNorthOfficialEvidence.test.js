import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import XLSX from "xlsx"

import seriousHarm from "../src/data/miller-north-serious-harm-public-v1.json" with { type: "json" }
import {
  buildAlbertaFatalityResponseSnapshot,
  compareAlbertaFatalityResponseSnapshots,
} from "../server/millerNorthAlbertaFatalityResponseListener.js"
import {
  deriveIncidentEvidenceStrength,
  officialEvidenceAdded,
  validatePublicSeriousHarmProjection,
} from "../server/millerNorthOfficialEvidence.js"

const sampleWorkbook = () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["NOTE"],
    ["Name of Deceased", "Date of Report", "Name of Justice", "Cause of Death", "Manner of Death", "Circumstances", "Recommendations(s)", "Entity Responsible", "Response", "Publication Date"],
    ["T.M.,C.L.,S.R., E.S.", "5/28/25", "Justice", "", "", "", "Recommendation 13\nCreate a local information-sharing protocol.", "Alberta Health Services", "Waiting for Response", "7/23/25"],
    ["T.M.,C.L.,S.R., E.S.", "5/28/25", "Justice", "", "", "", "Recommendation 42\nSupport workers.", "GOC - Indigenous Services Canada", "Acceppted in Principle", "7/23/25"],
    ["Different case", "1/1/25", "Justice", "", "", "", "Recommendation 1\nOther.", "Agency", "Accepted", "1/2/25"],
  ])
  worksheet.A3.l = { Target: "https://open.alberta.ca/publications/fatality-inquiry-2025-07-23" }
  worksheet.A4.l = { Target: "https://open.alberta.ca/publications/fatality-inquiry-2025-07-23" }
  XLSX.utils.book_append_sheet(workbook, worksheet, "Response Spreadsheet")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
}

test("publication-safe serious-harm projection validates and minimizes identity", () => {
  assert.deepEqual(validatePublicSeriousHarmProjection(seriousHarm), { valid: true, incidents: 10 })
  assert.equal(seriousHarm.incidents.filter(item => item.affected_person).every(item => item.affected_person === "Not publicly named"), true)
  assert.equal(JSON.stringify(seriousHarm).includes("private_notes"), false)
})

test("CPSBC additions distinguish case summaries from final consent-agreement outcomes", () => {
  const caseStudies = seriousHarm.incidents.filter(item => item.sources.some(source => source.role === "regulator_case_summary"))
  const skrenes = seriousHarm.incidents.find(item => item.public_incident_id === "mnsh_cpsbc_skrenes_2022")
  assert.equal(caseStudies.length, 3)
  assert.equal(caseStudies.every(item => item.evidence_strength.key === "formal_process_evidence" && item.date_label === "Case summary published"), true)
  assert.equal(skrenes.evidence_strength.key, "final_formal_outcome")
  assert.equal(skrenes.affected_person, "Not publicly named")
  assert.match(skrenes.formal_outcome, /not a court judgment/i)
})

test("publication-safe projection rejects an evidence-strength label unsupported by source roles", () => {
  const altered = structuredClone(seriousHarm)
  altered.incidents[0].evidence_strength = { key: "lead", label: "Lead", source_roles: [] }
  assert.throws(() => validatePublicSeriousHarmProjection(altered), /strength_source_mismatch/)
})

test("new inquest records preserve formal-process limits and Indigenous source roles", () => {
  const lampreau = seriousHarm.incidents.find(item => item.public_incident_id === "mnsh_randy_lampreau_2019")
  const jones = seriousHarm.incidents.find(item => item.public_incident_id === "mnsh_julian_jones_2021")
  assert.equal(lampreau.evidence_strength.key, "formal_process_evidence")
  assert.match(lampreau.formal_outcome, /fact-finding, not fault-finding/i)
  assert.equal(lampreau.sources.some(source => source.role === "indigenous_journalism"), true)
  assert.equal(jones.evidence_strength.key, "formal_process_evidence")
  assert.match(jones.formal_outcome, /does not determine criminal or civil responsibility/i)
  assert.equal(jones.sources.some(source => source.role === "indigenous_led_report"), true)
})

test("reviewed serious-harm route uses Miller North navigation and restrained presentation", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/site/MillerNorthSeriousHarm.jsx", import.meta.url), "utf8")
  const navigation = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  assert.match(app, /indigenous-healthcare-evidence\/serious-harm/)
  assert.match(page, /MillerNorthHomeLink/)
  assert.match(page, /What remains unresolved/)
  assert.match(page, /without deciding every allegation/i)
  assert.match(navigation, /Official records/)
  assert.match(navigation, /← Miller North Home/)
})

test("evidence strength is a quiet source-role label, not a traumatic-event score", () => {
  assert.equal(deriveIncidentEvidenceStrength([{ role: "indigenous_journalism" }]).key, "reported_account")
  assert.equal(deriveIncidentEvidenceStrength([{ role: "indigenous_journalism" }, { role: "institutional_statement" }]).key, "institutional_acknowledgement")
  assert.equal(deriveIncidentEvidenceStrength([{ role: "jury_verdict" }, { role: "indigenous_journalism" }]).key, "formal_process_evidence")
  assert.equal(deriveIncidentEvidenceStrength([{ role: "regulator_case_summary" }]).key, "formal_process_evidence")
  assert.equal(deriveIncidentEvidenceStrength([{ role: "regulator_finding", final_outcome: true }]).key, "final_formal_outcome")
})

test("new official evidence is detected without creating a duplicate incident", () => {
  const change = officialEvidenceAdded([{ role: "indigenous_journalism", url: "https://example.org/report" }], [{ role: "indigenous_journalism", url: "https://example.org/report" }, { role: "institutional_statement", url: "https://example.org/statement" }], "2026-09-07")
  assert.equal(change.source_count, 1)
  assert.deepEqual(change.source_roles, ["institutional_statement"])
})

test("Alberta workbook listener canonicalizes rows but never equates a response with implementation", () => {
  const snapshot = buildAlbertaFatalityResponseSnapshot(sampleWorkbook(), { caseName: "T.M.,C.L.,S.R., E.S." })
  assert.equal(snapshot.responder_rows, 2)
  assert.equal(snapshot.distinct_recommendations, 2)
  assert.deepEqual(snapshot.status_counts, { accepted_in_principle: 1, waiting_for_response: 1 })
  assert.equal(snapshot.source_corrections[0].correction, "source_typo_normalized")
  assert.equal(snapshot.records.every(row => row.implementation_evidence === null && row.outcome_evidence === null), true)
  assert.equal(snapshot.records[0].source_url, "https://open.alberta.ca/publications/fatality-inquiry-2025-07-23")
  assert.match(snapshot.interpretation_rule, /not implementation evidence/i)
})

test("Alberta workbook listener detects material row changes deterministically", () => {
  const previous = buildAlbertaFatalityResponseSnapshot(sampleWorkbook(), { caseName: "T.M.,C.L.,S.R., E.S." })
  const current = structuredClone(previous)
  current.records[0].raw_response_status = "Accepted"
  current.records[0].row_fingerprint = "changed"
  const diff = compareAlbertaFatalityResponseSnapshots(previous, current)
  assert.equal(diff.added.length, 0)
  assert.equal(diff.changed.length, 1)
  assert.equal(diff.owner_review_required, true)
})
