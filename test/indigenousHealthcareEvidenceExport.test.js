import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildEvidenceCsv, buildEvidenceJson, describeEvidenceFilters, filterEvidenceRecords, includesReportedAccounts, publicEvidenceExportRecord } from "../src/site/indigenousHealthcareEvidenceExport.js"

const projection = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
const all = { status: "all", province: "all", careSetting: "all", publisher: "all", sourceType: "all", year: "all" }
const allowedKeys = ["approximate_year", "care_setting", "evidence_status", "province", "public_record_id", "source_organization", "source_title", "source_type", "source_url", "summary"].sort()

test("exports use the exact current filtered public record set", () => {
  assert.equal(filterEvidenceRecords(projection.records, all).length, 363)
  const alberta = filterEvidenceRecords(projection.records, { ...all, province: "alberta" })
  assert.ok(alberta.length > 0)
  assert.ok(alberta.every(record => record.province === "alberta"))
  const reported = filterEvidenceRecords(projection.records, { ...all, status: "reported_account" })
  assert.equal(reported.length, 45)
  assert.ok(reported.every(record => record.evidence_status === "reported_account"))
  const combined = filterEvidenceRecords(projection.records, { ...all, province: "alberta", status: "reported_account" })
  assert.ok(combined.every(record => record.province === "alberta" && record.evidence_status === "reported_account"))
  assert.equal(filterEvidenceRecords(projection.records, { ...all, province: "alberta", year: "1900" }).length, 0)
})

test("filter descriptions and reported-account cautions are deterministic", () => {
  assert.equal(describeEvidenceFilters(all), "All approved public records")
  assert.equal(describeEvidenceFilters({ ...all, province: "alberta", status: "reported_account", careSetting: "Emergency" }), "Province: Alberta · Evidence status: Reported account · Care setting: Emergency")
  assert.equal(includesReportedAccounts(filterEvidenceRecords(projection.records, { ...all, status: "reported_account" })), true)
  assert.equal(includesReportedAccounts(filterEvidenceRecords(projection.records, { ...all, status: "formal_finding" })), false)
})

test("CSV and JSON exports retain Unicode and escape public fields without private data", () => {
  const synthetic = { ...projection.records[0], summary: "Métis, \"quoted\"\nline", source: { ...projection.records[0].source, publisher: "École, Centre" } }
  const csv = buildEvidenceCsv([synthetic])
  assert.match(csv, /"Métis, ""quoted""\nline"/)
  assert.match(csv, /"École, Centre"/)
  const exported = publicEvidenceExportRecord(synthetic)
  assert.deepEqual(Object.keys(exported).sort(), allowedKeys)
  assert.doesNotMatch(JSON.stringify(exported), /candidate|reviewer|fingerprint|samwise|private_corpus|owner_command/i)
  const json = JSON.parse(buildEvidenceJson([synthetic]))
  assert.deepEqual(json, [exported])
  assert.equal(json[0].evidence_status, projection.records[0].evidence_status === "reported_account" ? "Reported account" : exported.evidence_status)
})

test("print source excludes controls and includes the conditional caution and footer", () => {
  const page = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  const styles = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.css", import.meta.url), "utf8")
  assert.match(page, /Reported accounts document publicly reported experiences or allegations/)
  assert.match(page, /Record counts should not be interpreted as prevalence estimates/)
  assert.match(page, /Print \/ Save as PDF/)
  assert.match(page, /Download CSV/)
  assert.match(page, /Download JSON/)
  assert.match(styles, /@media print/)
  assert.match(styles, /\.ihe-controls.*display:none!important/)
  assert.match(styles, /page-break-inside:avoid/)
})
