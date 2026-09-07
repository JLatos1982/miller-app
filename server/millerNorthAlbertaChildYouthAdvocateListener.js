import { createHash } from "node:crypto"

export const ALBERTA_OCYA_RECOMMENDATIONS_URL = "https://www.ocya.alberta.ca/recommendations/"

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8217;|&rsquo;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim()
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function normalizeOcyaEvaluation(value) {
  const text = String(value || "").toLowerCase()
  if (/new recommendation/.test(text)) return "new_not_yet_evaluated"
  if (/not met/.test(text)) return "not_met"
  if (/closed/.test(text) && /some progress/.test(text)) return "closed_some_progress"
  if (/ongoing/.test(text) && /some progress/.test(text)) return "ongoing_some_progress"
  if (/met/.test(text)) return "met_by_advocate_evaluation"
  if (/some progress/.test(text)) return "some_progress"
  return "unclear"
}

export function parseOcyaRecommendationTable(html, { checkedAt = new Date().toISOString() } = {}) {
  const table = String(html || "").match(/<table[^>]*id=["']tablepress-2["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || ""
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(1)
  return rows.map(match => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => decodeHtml(cell[1])))
    .filter(cells => cells.length >= 11)
    .map(cells => {
      const [report_name, report_type, recommendation_name, report_release_date, progress_reported_by, recommendation, expected_outcomes, further_comments, evaluation, date_last_evaluated, progress_last_period] = cells
      const recommendation_key = fingerprint([report_name, recommendation_name, progress_reported_by]).slice(0, 24)
      const healthcare_text = [progress_reported_by, recommendation, expected_outcomes, further_comments].join(" ")
      const indigenous_text = [recommendation, expected_outcomes, further_comments, progress_last_period].join(" ")
      const record = {
        recommendation_key,
        report_name,
        report_type,
        recommendation_name,
        report_release_date,
        progress_reported_by,
        recommendation,
        expected_outcomes,
        further_comments,
        evaluation_raw: evaluation,
        evaluation_status: normalizeOcyaEvaluation(evaluation),
        date_last_evaluated,
        progress_last_period,
        healthcare_relevant: /\bhealth\b|hospital|mental health|addiction|medical|clinical|psychiatr|suicide|substance use/i.test(healthcare_text),
        indigenous_relevance_explicit: /\bindigenous\b|first nations?|m[ée]tis|inuit|band\b/i.test(indigenous_text),
        implementation_evidence: null,
        outcome_evidence: null,
        source_url: ALBERTA_OCYA_RECOMMENDATIONS_URL,
        checked_at: checkedAt,
      }
      const stableRecord = { ...record }
      delete stableRecord.checked_at
      return { ...record, document_fingerprint: fingerprint(stableRecord) }
    })
}

export function compareOcyaRecommendationMemory(previous = {}, current = []) {
  const prior = previous.recommendations || {}
  const next = { ...prior }
  const new_rows = []
  const changed_rows = []
  const unchanged_rows = []
  for (const row of current) {
    const old = prior[row.recommendation_key]
    if (!old) new_rows.push(row)
    else if (old.document_fingerprint !== row.document_fingerprint) changed_rows.push({ previous: old, current: row })
    else unchanged_rows.push(row)
    next[row.recommendation_key] = { document_fingerprint: row.document_fingerprint, report_name: row.report_name, recommendation_name: row.recommendation_name, progress_reported_by: row.progress_reported_by, evaluation_status: row.evaluation_status, checked_at: row.checked_at }
  }
  return { new_rows, changed_rows, unchanged_rows, memory: { schema_version: "miller-north-alberta-ocya-listener-memory-v1", recommendations: next } }
}

export function summarizeOcyaRecommendationCycle(rows = [], comparison = { new_rows: [], changed_rows: [], unchanged_rows: [] }) {
  const qualifying = rows.filter(row => row.healthcare_relevant && row.indigenous_relevance_explicit)
  return {
    rows_checked: rows.length,
    new_rows: comparison.new_rows.length,
    changed_rows: comparison.changed_rows.length,
    unchanged_rows: comparison.unchanged_rows.length,
    healthcare_rows: rows.filter(row => row.healthcare_relevant).length,
    explicit_indigenous_rows: rows.filter(row => row.indigenous_relevance_explicit).length,
    miller_north_review_rows: qualifying.length,
    claimed_implementation_rows: 0,
    independent_outcome_rows: 0,
  }
}
