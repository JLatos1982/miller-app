import XLSX from "xlsx"

import {
  buildRecommendationResponseChains,
  canonicalizeRecommendationId,
  canonicalizeRecommendationResponseStatus,
  compareRecommendationResponseSnapshots,
  recommendationResponseRowFingerprint,
} from "./millerNorthCoronerSeriousHarmListener.js"

export const ALBERTA_FATALITY_RESPONSE_DATASET = "https://open.alberta.ca/opendata/responses-to-public-fatality-inquiry-recommendations"

const clean = value => String(value || "").replace(/\s+/g, " ").trim()
const stable = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

export function parseAlbertaFatalityRecommendationWorkbook(buffer, { caseName = null } = {}) {
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const worksheet = workbook.Sheets["Response Spreadsheet"]
  if (!worksheet) throw new Error("alberta_fatality_response_sheet_missing")
  const rows = XLSX.utils.sheet_to_json(worksheet, { range: 1, defval: null, raw: false })
  const parsed = []
  rows.forEach((row, index) => {
    const deceased = clean(row["Name of Deceased"])
    if (!deceased || (caseName && deceased !== caseName)) return
    const recommendation = clean(row["Recommendations(s)"])
    const recommendation_id = canonicalizeRecommendationId(recommendation)
    if (!recommendation_id) return
    const responder = clean(row["Entity Responsible"])
    const status = canonicalizeRecommendationResponseStatus(row.Response)
    const sourceCell = worksheet[`A${index + 3}`]
    const record = {
      event_key: stable(deceased),
      case_name: deceased,
      report_date: clean(row["Date of Report"]) || null,
      publication_date: clean(row["Publication Date"]) || null,
      recommendation_id,
      recommendation_summary: recommendation.replace(/^Recommendation\s+\d+\s*/i, "").trim(),
      responder,
      responsible_organization: responder,
      response_status: status.status,
      raw_response_status: status.raw_status,
      correction_applied: status.correction_applied,
      source_url: sourceCell?.l?.Target || null,
      claimed_action: null,
      implementation_evidence: null,
      outcome_evidence: null,
      independent_verification: null,
      unresolved_question: "The tracker records a response category; what action was claimed, implemented and independently evidenced?",
    }
    record.row_key = `${record.event_key}|${recommendation_id}|${stable(responder)}`
    record.row_fingerprint = recommendationResponseRowFingerprint(record)
    parsed.push(record)
  })
  return parsed
}

export function buildAlbertaFatalityResponseSnapshot(buffer, options = {}) {
  const records = parseAlbertaFatalityRecommendationWorkbook(buffer, options)
  const chains = buildRecommendationResponseChains(records)
  return {
    schema_version: "miller-north-alberta-fatality-response-listener-v1",
    dataset_url: ALBERTA_FATALITY_RESPONSE_DATASET,
    case_name: options.caseName || null,
    responder_rows: records.length,
    distinct_recommendations: new Set(records.map(record => record.recommendation_id)).size,
    status_counts: Object.fromEntries([...new Set(records.map(record => record.response_status))].sort().map(status => [status, records.filter(record => record.response_status === status).length])),
    source_corrections: records.filter(record => record.correction_applied).map(record => ({ row_key: record.row_key, correction: record.correction_applied, raw: record.raw_response_status, canonical: record.response_status })),
    records,
    chains,
    interpretation_rule: "A responder category documents a response state. It is not implementation evidence or outcome evidence.",
    production_writes: 0,
  }
}

export function compareAlbertaFatalityResponseSnapshots(previous, current) {
  return compareRecommendationResponseSnapshots(previous?.records || [], current?.records || [])
}

export async function fetchAlbertaFatalityResponseSnapshot({ workbookUrl, fetchImpl = fetch, caseName = null } = {}) {
  if (!/^https:\/\/open\.alberta\.ca\//.test(workbookUrl || "")) throw new Error("alberta_fatality_response_url_not_allowed")
  const response = await fetchImpl(workbookUrl, { redirect: "follow" })
  if (!response.ok) throw new Error(`alberta_fatality_response_fetch_${response.status}`)
  return buildAlbertaFatalityResponseSnapshot(Buffer.from(await response.arrayBuffer()), { caseName })
}
