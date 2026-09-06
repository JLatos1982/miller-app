const FUNDING_STATES = new Set(["open", "recurring", "upcoming", "upcoming_or_periodic", "periodic_intakes", "open_or_ongoing_proposals", "closed", "intake_date_unknown", "verify_before_applying"])
const SUPPORT_MATCH_STATES = new Set(["exact_existing_resource", "existing_resource_needs_enrichment", "new_candidate_requires_reconciliation", "organization_exists_program_missing", "duplicate_or_alias", "insufficient_public_evidence"])
const PRIVATE_KEYS = new Set(["patient_name", "client_name", "owner_review_reason", "private_notes", "medical_record", "username"])

const validHttpUrl = (value) => {
  try { return ["http:", "https:"].includes(new URL(String(value || "")).protocol) } catch { return false }
}

const rejectPrivateKeys = (record) => {
  for (const key of Object.keys(record || {})) if (PRIVATE_KEYS.has(key)) throw new Error(`private_field:${key}`)
}

export function validateFirstNationsFundingDataset(dataset) {
  if (dataset?.schema_version !== "miller-first-nations-funding-v1" || dataset.private !== true || dataset.publication_state !== "owner_review_required") throw new Error("funding_dataset_gate")
  if (!Array.isArray(dataset.records) || dataset.records.length < 1) throw new Error("funding_records_required")
  const ids = new Set()
  const jurisdictions = new Set()
  for (const record of dataset.records) {
    rejectPrivateKeys(record)
    if (!record.funding_record_id || ids.has(record.funding_record_id)) throw new Error("funding_duplicate_id")
    ids.add(record.funding_record_id)
    jurisdictions.add(record.province_jurisdiction)
    if (!record.program_name || !record.funding_organization || !record.who_can_apply) throw new Error("funding_identity")
    if (!FUNDING_STATES.has(record.intake_status)) throw new Error(`funding_status:${record.intake_status}`)
    if (!validHttpUrl(record.official_application_url) || !validHttpUrl(record.source?.url)) throw new Error("funding_source")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.last_verified_at)) throw new Error("funding_verification_date")
    if (!record.freshness_note || !record.owner_review_state) throw new Error("funding_review_gate")
  }
  return { records: dataset.records.length, jurisdictions: [...jurisdictions].sort(), official_sources: dataset.records.length }
}

export function validatePracticalSupportsDataset(dataset) {
  if (dataset?.schema_version !== "miller-practical-supports-v1" || dataset.private !== true || dataset.publication_state !== "candidate_only") throw new Error("support_dataset_gate")
  const ids = new Set()
  const millerIds = new Set()
  let exactMatches = 0
  let newCandidates = 0
  for (const record of dataset.records || []) {
    rejectPrivateKeys(record)
    if (!record.support_record_id || ids.has(record.support_record_id)) throw new Error("support_duplicate_id")
    ids.add(record.support_record_id)
    if (!SUPPORT_MATCH_STATES.has(record.match_state)) throw new Error("support_match_state")
    if (!record.resource_program_name && !record.name) throw new Error("support_identity")
    if (!record.owner_review_state || !record.freshness_state) throw new Error("support_review_gate")
    const sourceUrl = record.source?.url
    if (sourceUrl && !validHttpUrl(sourceUrl)) throw new Error("support_source")
    if (record.match_state === "exact_existing_resource") {
      exactMatches += 1
      if (!String(record.miller_resource_id || "").startsWith("curated:") || millerIds.has(record.miller_resource_id)) throw new Error("support_miller_match")
      millerIds.add(record.miller_resource_id)
    } else newCandidates += 1
  }
  return { records: ids.size, exact_miller_matches: exactMatches, new_candidates: newCandidates }
}

export function nextFreshnessCheck(record, from = new Date()) {
  const days = record.intake_status === "open" ? 30 : ["recurring", "upcoming", "upcoming_or_periodic", "periodic_intakes"].includes(record.intake_status) ? 60 : 90
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
