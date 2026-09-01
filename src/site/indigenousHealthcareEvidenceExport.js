export const EVIDENCE_STATUS_LABELS = Object.freeze({
  reported_account: "Reported account",
  corroborated_account: "Corroborated account",
  official_investigation: "Official investigation",
  formal_finding: "Formal finding",
  systemic_evidence: "Systemic evidence",
  procedural_adjudicative_context: "Procedural context",
})

export const PROVINCE_LABELS = Object.freeze({ british_columbia: "British Columbia", alberta: "Alberta", saskatchewan: "Saskatchewan" })

const readable = value => value || "Not specified"

export const YEAR_FILTER_OPTIONS = Object.freeze([
  ["2020s", "2020s"],
  ["2010s", "2010s"],
  ["2000s", "2000s"],
  ["1990s", "1990s"],
  ["pre_1990", "Before 1990"],
  ["unknown", "Unknown / year not established"],
])

const comparableYear = value => Number.isInteger(value) ? value : null

export function isYearFilterMatch(year, filter) {
  const value = comparableYear(year)
  if (filter === "all") return true
  if (filter === "unknown") return value === null
  if (value === null) return false
  if (filter === "pre_1990") return value < 1990
  if (/^\d{4}s$/.test(filter)) return value >= Number.parseInt(filter, 10) && value < Number.parseInt(filter, 10) + 10
  return /^\d{4}$/.test(filter) && value === Number.parseInt(filter, 10)
}

export function describeYearFilter(filter) {
  if (filter === "unknown") return "Year: not established"
  if (filter === "pre_1990") return "Year: before 1990"
  if (/^\d{4}s$/.test(filter)) return `Decade: ${filter}`
  return `Year: ${filter}`
}

export function filterEvidenceRecords(records, filters) {
  return records.filter(record => (
    (filters.status === "all" || record.evidence_status === filters.status) &&
    (filters.province === "all" || record.province === filters.province) &&
    (filters.careSetting === "all" || readable(record.care_setting) === filters.careSetting) &&
    (filters.publisher === "all" || record.source.publisher === filters.publisher) &&
    (filters.sourceType === "all" || readable(record.source.source_type) === filters.sourceType) &&
    isYearFilterMatch(record.year, filters.year)
  ))
}

export function describeEvidenceFilters(filters) {
  const values = [
    filters.province !== "all" && `Province: ${PROVINCE_LABELS[filters.province] || filters.province}`,
    filters.status !== "all" && `Evidence status: ${EVIDENCE_STATUS_LABELS[filters.status] || filters.status}`,
    filters.careSetting !== "all" && `Care setting: ${filters.careSetting}`,
    filters.publisher !== "all" && `Source organization: ${filters.publisher}`,
    filters.sourceType !== "all" && `Source type: ${filters.sourceType}`,
    filters.year !== "all" && describeYearFilter(filters.year),
  ].filter(Boolean)
  return values.length ? values.join(" · ") : "All approved public records"
}

export function publicEvidenceExportRecord(record) {
  return Object.freeze({
    public_record_id: record.public_record_id,
    evidence_status: EVIDENCE_STATUS_LABELS[record.evidence_status] || record.evidence_status,
    province: PROVINCE_LABELS[record.province] || record.province,
    approximate_year: record.year || "",
    care_setting: record.care_setting || "",
    source_organization: record.source.publisher,
    source_type: record.source.source_type || "",
    summary: record.summary,
    source_title: record.source.title,
    source_url: record.source.url,
  })
}

const csvEscape = value => `"${String(value ?? "").replaceAll('"', '""')}"`
const csvColumns = ["Public Record ID", "Evidence Status", "Province", "Approximate Year", "Care Setting", "Source Organization", "Source Type", "Summary", "Source Title", "Source URL"]

export function buildEvidenceCsv(records) {
  const rows = records.map(publicEvidenceExportRecord)
  return [csvColumns, ...rows.map(row => [row.public_record_id, row.evidence_status, row.province, row.approximate_year, row.care_setting, row.source_organization, row.source_type, row.summary, row.source_title, row.source_url])].map(row => row.map(csvEscape).join(",")).join("\r\n") + "\r\n"
}

export function buildEvidenceJson(records) {
  return JSON.stringify(records.map(publicEvidenceExportRecord), null, 2) + "\n"
}

export const includesReportedAccounts = records => records.some(record => record.evidence_status === "reported_account")

export function sortCondensedEvidenceRecords(records, sort) {
  return records.map((record, index) => ({ record, index })).sort((a, b) => {
    const aYear = comparableYear(a.record.year), bYear = comparableYear(b.record.year)
    if (sort === "newest") {
      if (aYear !== null && bYear !== null && aYear !== bYear) return bYear - aYear
      if (aYear !== null && bYear === null) return -1
      if (aYear === null && bYear !== null) return 1
    }
    if (sort === "oldest") {
      if (aYear !== null && bYear !== null && aYear !== bYear) return aYear - bYear
      if (aYear !== null && bYear === null) return -1
      if (aYear === null && bYear !== null) return 1
    }
    if (sort === "province") {
      const comparison = (PROVINCE_LABELS[a.record.province] || a.record.province).localeCompare(PROVINCE_LABELS[b.record.province] || b.record.province)
      if (comparison) return comparison
    }
    if (sort === "care_setting") {
      const comparison = readable(a.record.care_setting).localeCompare(readable(b.record.care_setting))
      if (comparison) return comparison
    }
    return a.index - b.index
  }).map(item => item.record)
}
