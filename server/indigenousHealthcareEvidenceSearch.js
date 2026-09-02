import { readFileSync } from "node:fs"

export const MAX_EVIDENCE_SEARCH_QUERY_LENGTH = 500
export const MAX_EVIDENCE_SEARCH_RECORDS = 20
export const EVIDENCE_SEARCH_INSTRUCTIONS = "You are summarizing a bounded public Miller evidence corpus. Answer ONLY from the supplied records. Do not infer prevalence, incidence, causation, or truth beyond each record's evidence status. A reported account documents that an account was publicly reported; it is not equivalent to an adjudicated finding. Do not invent facts. Reference supplied public record IDs for every factual claim. Say when the supplied evidence is limited. Keep the answer concise, approximately 2–5 paragraphs."

const projection = JSON.parse(readFileSync(new URL("../src/data/indigenous-healthcare-evidence-public-v1.json", import.meta.url), "utf8"))
const ignoredTerms = new Set(["a", "about", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "the", "to", "what", "with"])
const text = value => String(value || "").toLowerCase()
const termsFor = value => [...new Set(text(value).match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.filter(term => term.length > 1 && !ignoredTerms.has(term)) || [])]

export function publicEvidenceSearchRecord(record) {
  return Object.freeze({
    public_record_id: record.public_record_id,
    summary: record.summary,
    source_title: record.source?.title || "",
    province: record.province || "",
    care_setting: record.care_setting || "",
    evidence_status: record.evidence_status || "",
    source_organization: record.source?.publisher || "",
    source_type: record.source?.source_type || "",
  })
}

export function retrieveEvidenceRecords(query, records = projection.records, limit = MAX_EVIDENCE_SEARCH_RECORDS) {
  const normalizedQuery = String(query || "").trim().slice(0, MAX_EVIDENCE_SEARCH_QUERY_LENGTH)
  const terms = termsFor(normalizedQuery)
  if (!terms.length) return []
  const phrase = text(normalizedQuery)
  return records.map((record) => {
    const fields = [
      [record.summary, 6], [record.source?.title, 5], [record.province, 3], [record.care_setting, 3],
      [record.evidence_status, 3], [record.source?.publisher, 3], [record.source?.source_type, 3],
    ]
    let score = 0
    for (const term of terms) for (const [value, weight] of fields) if (text(value).includes(term)) score += weight
    if (phrase.length > 3 && fields.some(([value]) => text(value).includes(phrase))) score += 12
    return { record, score }
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.record.public_record_id.localeCompare(b.record.public_record_id))
    .slice(0, Math.min(MAX_EVIDENCE_SEARCH_RECORDS, Math.max(1, limit)))
    .map(({ record }) => publicEvidenceSearchRecord(record))
}

export function evidenceSearchFallback(matches, message) {
  return { answer: message, record_ids: matches.map(record => record.public_record_id), match_count: matches.length, summary_available: false }
}

export function validateEvidenceSearchAnswer(value, matches) {
  if (!value || typeof value.answer !== "string") return null
  const answer = value.answer.trim().slice(0, 6000)
  if (!answer) return null
  const allowedIds = new Set(matches.map(record => record.public_record_id))
  const recordIds = Array.isArray(value.record_ids) ? [...new Set(value.record_ids.filter(id => typeof id === "string" && allowedIds.has(id)))].slice(0, MAX_EVIDENCE_SEARCH_RECORDS) : []
  return { answer, record_ids: recordIds.length ? recordIds : matches.map(record => record.public_record_id), match_count: matches.length, summary_available: true }
}

export async function searchIndigenousHealthcareEvidence({ query, openai, apiKeyPresent }) {
  const matches = retrieveEvidenceRecords(query)
  if (!matches.length) return evidenceSearchFallback([], "No meaningful matches were found in the approved public evidence library.")
  if (!apiKeyPresent) return evidenceSearchFallback(matches, "AI summary is unavailable right now. The locally matched approved public evidence records are shown below.")
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_EVIDENCE_SEARCH_MODEL || "gpt-5.4-mini",
      instructions: EVIDENCE_SEARCH_INSTRUCTIONS,
      input: JSON.stringify({ query: String(query).trim().slice(0, MAX_EVIDENCE_SEARCH_QUERY_LENGTH), records: matches }),
      max_output_tokens: 700,
      text: { format: { type: "json_schema", name: "miller_evidence_answer", strict: true, schema: { type: "object", properties: { answer: { type: "string" }, record_ids: { type: "array", items: { type: "string" } } }, required: ["answer", "record_ids"], additionalProperties: false } } },
    })
    const result = validateEvidenceSearchAnswer(JSON.parse(response.output_text), matches)
    return result || evidenceSearchFallback(matches, "AI summary is unavailable right now. The locally matched approved public evidence records are shown below.")
  } catch {
    return evidenceSearchFallback(matches, "AI summary is unavailable right now. The locally matched approved public evidence records are shown below.")
  }
}
