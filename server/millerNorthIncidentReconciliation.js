import { createHash } from "node:crypto"

const clean = value => String(value || "").toLowerCase().replace(/\s+/g, " ").trim()
const summaryKey = record => clean(record.summary).replace(/[^\p{L}\p{N} ]/gu, "")
const sourceKey = record => String(record.source?.url || "")
export const incidentFingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24)

export function analyzeRepeatedSourceGroups(records) {
  const groups = new Map()
  for (const record of records) { const key = sourceKey(record); if (key) groups.set(key, [...(groups.get(key) || []), record]) }
  return [...groups.entries()].filter(([, rows]) => rows.length > 1).map(([source_url, rows]) => {
    const summaries = new Set(rows.map(summaryKey)), statuses = new Set(rows.map(row => row.evidence_status))
    const contextual = [...statuses].every(status => ["systemic_evidence", "official_investigation"].includes(status))
    const relationship = contextual ? "related_context_not_same_incident" : summaries.size === 1 ? "insufficient_identity" : "same_source_different_incident"
    return { source_url, evidence_record_ids: rows.map(row => row.public_record_id), relationship, reason: contextual ? "systemic_or_investigative_context_not_promoted_to_incident" : summaries.size === 1 ? "duplicated_evidence_text_without_incident_identity" : "distinct_source_excerpts_require_incident-level_review", incident_proposal_ids: [] }
  })
}

export function proposalIncidentEntity(candidate) {
  const timing = { event_date: candidate.event_date || null, event_year: candidate.event_year || null, approximate_event_year: candidate.approximate_event_year || null, publication_date: candidate.publication_date || null }
  const fingerprint = incidentFingerprint({ province: candidate.province, facility: clean(candidate.approximate_location_or_facility), timing, summary: clean(candidate.evidence_excerpt).slice(0, 400) })
  const source_urls = [...new Set([candidate.source_url, ...(candidate.supporting_sources || []).map(source => source.url)].filter(Boolean))]
  const proposalId = candidate.stable_proposal_id || `mni_${fingerprint}`
  return { proposed_incident_id: proposalId, corpus_id: candidate.corpus_id, proposal_state: "private_reconciliation_review", province: candidate.province, facility_or_location: candidate.approximate_location_or_facility || null, timing, summary: candidate.evidence_excerpt, evidence_status: candidate.evidence_status, source_evidence_record_ids: candidate.source_evidence_record_ids || [], source_urls, supporting_sources: candidate.supporting_sources || [], reconciliation_confidence: candidate.event_date ? "strong" : candidate.approximate_event_year ? "bounded" : "review_required", incident_fingerprint: fingerprint, created_from_candidate_id: candidate.candidate_id }
}
