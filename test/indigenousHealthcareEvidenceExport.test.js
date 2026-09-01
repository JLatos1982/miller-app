import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildEvidenceCsv, buildEvidenceJson, describeEvidenceFilters, filterEvidenceRecords, includesReportedAccounts, isYearFilterMatch, publicEvidenceExportRecord, sortCondensedEvidenceRecords } from "../src/site/indigenousHealthcareEvidenceExport.js"

const projection = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
const all = { status: "all", province: "all", careSetting: "all", publisher: "all", sourceType: "all", year: "all" }
const allowedKeys = ["approximate_year", "care_setting", "evidence_status", "province", "public_record_id", "source_organization", "source_title", "source_type", "source_url", "summary"].sort()

test("exports use the exact current filtered public record set, including year states", () => {
  assert.equal(filterEvidenceRecords(projection.records, all).length, 402)
  const alberta = filterEvidenceRecords(projection.records, { ...all, province: "alberta" })
  assert.ok(alberta.length > 0)
  assert.ok(alberta.every(record => record.province === "alberta"))
  const reported = filterEvidenceRecords(projection.records, { ...all, status: "reported_account" })
  assert.equal(reported.length, 45)
  assert.ok(reported.every(record => record.evidence_status === "reported_account"))
  const combined = filterEvidenceRecords(projection.records, { ...all, province: "alberta", status: "reported_account" })
  assert.ok(combined.every(record => record.province === "alberta" && record.evidence_status === "reported_account"))
  const unknown = filterEvidenceRecords(projection.records, { ...all, year: "unknown" })
  assert.equal(unknown.length, 402)
  assert.ok(unknown.every(record => record.year === null))
  for (const filter of ["pre_1990", "1990s", "2000s", "2010s", "2020s", "2024"]) assert.equal(filterEvidenceRecords(projection.records, { ...all, year: filter }).length, 0)
  const combinedUnknown = filterEvidenceRecords(projection.records, { ...all, province: "alberta", status: "reported_account", year: "unknown" })
  assert.deepEqual(combinedUnknown.map(record => record.public_record_id), combined.map(record => record.public_record_id))
  assert.equal(filterEvidenceRecords(projection.records, { ...all, province: "alberta", year: "1900" }).length, 0)
})

test("filter descriptions and reported-account cautions are deterministic", () => {
  assert.equal(describeEvidenceFilters(all), "All approved public records")
  assert.equal(describeEvidenceFilters({ ...all, province: "alberta", status: "reported_account", careSetting: "Emergency" }), "Province: Alberta · Evidence status: Reported account · Care setting: Emergency")
  assert.equal(describeEvidenceFilters({ ...all, province: "alberta", year: "2010s" }), "Province: Alberta · Decade: 2010s")
  assert.equal(describeEvidenceFilters({ ...all, year: "unknown" }), "Year: not established")
  assert.equal(includesReportedAccounts(filterEvidenceRecords(projection.records, { ...all, status: "reported_account" })), true)
  assert.equal(includesReportedAccounts(filterEvidenceRecords(projection.records, { ...all, status: "formal_finding" })), false)
})

test("year filters support exact years, decades, pre-1990, and unknown without inferring dates", () => {
  assert.equal(isYearFilterMatch(2024, "2024"), true)
  assert.equal(isYearFilterMatch(2024, "2020s"), true)
  assert.equal(isYearFilterMatch(2019, "2020s"), false)
  assert.equal(isYearFilterMatch(1989, "pre_1990"), true)
  assert.equal(isYearFilterMatch(null, "unknown"), true)
  assert.equal(isYearFilterMatch(null, "2010s"), false)
})

test("condensed list preserves filtered-record parity and sorts known years before unknown years", () => {
  const filtered = filterEvidenceRecords(projection.records, { ...all, province: "alberta" })
  const newest = sortCondensedEvidenceRecords(filtered, "newest")
  const oldest = sortCondensedEvidenceRecords(filtered, "oldest")
  const province = sortCondensedEvidenceRecords(filtered, "province")
  const careSetting = sortCondensedEvidenceRecords(filtered, "care_setting")
  assert.deepEqual(new Set(newest.map(record => record.public_record_id)), new Set(filtered.map(record => record.public_record_id)))
  assert.equal(newest.length, filtered.length)
  assert.deepEqual(newest.map(record => record.year).filter(Number.isInteger), [...newest.map(record => record.year).filter(Number.isInteger)].sort((a, b) => b - a))
  assert.deepEqual(oldest.map(record => record.year).filter(Number.isInteger), [...oldest.map(record => record.year).filter(Number.isInteger)].sort((a, b) => a - b))
  assert.deepEqual(province.map(record => record.province), [...province.map(record => record.province)].sort())
  assert.deepEqual(careSetting.map(record => record.care_setting || "Not specified"), [...careSetting.map(record => record.care_setting || "Not specified")].sort())

  const withKnownYears = [
    { ...projection.records[0], public_record_id: "known-2020", year: 2020 },
    { ...projection.records[1], public_record_id: "unknown", year: null },
    { ...projection.records[2], public_record_id: "known-1995", year: 1995 },
  ]
  assert.deepEqual(sortCondensedEvidenceRecords(withKnownYears, "newest").map(record => record.public_record_id), ["known-2020", "known-1995", "unknown"])
  assert.deepEqual(sortCondensedEvidenceRecords(withKnownYears, "oldest").map(record => record.public_record_id), ["known-1995", "known-2020", "unknown"])
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
  assert.match(page, /YEAR_FILTER_OPTIONS/)
  assert.match(page, /Exact year/)
  assert.match(page, /Year not established/)
  assert.match(page, /aria-pressed={view === "detailed"}/)
  assert.match(page, /aria-pressed={view === "condensed"}/)
  assert.match(page, /Print condensed list/)
  assert.match(page, /public_record_id/)
  assert.match(styles, /@media print/)
  assert.match(styles, /\.ihe-controls.*display:none!important/)
  assert.match(styles, /page-break-inside:avoid/)
  assert.match(styles, /@media\(max-width:600px\).*\.ihe-condensed-row code/s)
})
