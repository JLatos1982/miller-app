const current = (value, now = new Date()) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && now.getTime() - date.getTime() <= 366 * 24 * 60 * 60 * 1000
}
const safetyPattern = /transition|safe home|safe house|domestic violence|intimate partner violence|women'?s shelter|youth/i
const authoritativeSources = new Set(["211 British Columbia", "BC Housing", "The Salvation Army", "Cyrus Centre Ministries"])

export function classifyShelterCandidate(candidate = {}, { now = new Date() } = {}) {
  const evidencePresent = Boolean(candidate.source_url && (candidate.source_excerpt || candidate.evidence_notes) && candidate.retrieved_title)
  const currentEvidence = current(candidate.checked_at, now)
  const duplicate = Array.isArray(candidate.possible_matches) && candidate.possible_matches.length > 0
  const safetySensitive = ["confidential", "undisclosed"].includes(candidate.location_disclosure_status) || safetyPattern.test(`${candidate.name || ""} ${candidate.shelter_type || ""} ${candidate.population_served || ""}`)
  const sourceAuthoritative = authoritativeSources.has(candidate.source_name)
  const clearIdentity = Boolean(candidate.name && candidate.community && candidate.shelter_type)
  const highEvidence = candidate.confidence === "high" && evidencePresent && currentEvidence && sourceAuthoritative && clearIdentity
  const corroborated = (candidate.additional_sources || []).filter(Boolean).length > 0
  if (candidate.review_status !== "pending") return { category: "already_decided", recommendation: "preserve_human_decision", reason_codes: ["previous_administrator_decision"], safety_sensitive: safetySensitive }
  if (duplicate) return { category: "duplicate_already_represented", recommendation: "administrator_merge_review", reason_codes: ["possible_duplicate_match"], safety_sensitive: safetySensitive }
  if (safetySensitive) return { category: "safety_sensitive", recommendation: highEvidence ? "administrator_directory_review" : "research_before_directory_review", reason_codes: ["location_safety_separate_from_directory_approval", ...(highEvidence ? ["current_authoritative_evidence"] : ["evidence_not_strong_enough"])], safety_sensitive: true }
  if (highEvidence && corroborated) return { category: "auto_approval_eligible", recommendation: "observe_only_pending_validation", reason_codes: ["current_authoritative_primary_evidence", "supporting_evidence", "clear_program_identity", "no_duplicate_signal", "no_location_safety_signal"], safety_sensitive: false }
  if (highEvidence) return { category: "strong_administrator_review", recommendation: "brief_administrator_confirmation", reason_codes: ["current_authoritative_evidence", "clear_program_identity", "no_duplicate_signal", "independent_corroboration_missing"], safety_sensitive: false }
  if (sourceAuthoritative && currentEvidence && clearIdentity) return { category: "strong_administrator_review", recommendation: "brief_administrator_confirmation", reason_codes: ["current_authoritative_source", "clear_program_identity", "confidence_or_evidence_detail_requires_human_review"], safety_sensitive: false }
  return { category: "needs_more_research", recommendation: "research_before_directory_review", reason_codes: [!currentEvidence ? "stale_evidence" : "insufficient_authoritative_evidence"], safety_sensitive: false }
}

export function buildShelterAutomationReport(candidates = [], options = {}) {
  const items = candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, operator: candidate.operator || "", community: candidate.community || "", shelter_type: candidate.shelter_type || "", source_name: candidate.source_name, source_url: candidate.source_url || "", confidence: candidate.confidence || "", review_status: candidate.review_status, location_disclosure_status: candidate.location_disclosure_status, possible_matches: candidate.possible_matches || [], ...classifyShelterCandidate(candidate, options) }))
  const counts = Object.fromEntries(["auto_approval_eligible", "strong_administrator_review", "needs_more_research", "duplicate_already_represented", "safety_sensitive", "already_decided"].map((category) => [category, items.filter((item) => item.category === category).length]))
  const decided = candidates.filter((item) => item.review_status !== "pending")
  const validation = { historical_human_decisions: decided.length, comparable_auto_eligible_human_decisions: decided.filter((item) => classifyShelterCandidate({ ...item, review_status: "pending" }, options).category === "auto_approval_eligible").length, agreement_available: false, false_positive_approvals: null, note: "No independently human-decided candidate meets the exact proposed automatic category, so automatic approval remains disabled." }
  return { version: "miller-shelter-automation-v1.0.0", mode: "observe_only", items, counts, validation, automatic_approval_enabled: false, location_publication_changed: false }
}
