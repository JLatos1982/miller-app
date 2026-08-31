export const CORRECTION_READINESS_VERSION = "miller-correction-readiness-v1"
export const CORRECTION_READINESS_CLASSES = Object.freeze([
  "ready_for_trusted_writer_preview",
  "likely_ready_after_revalidation",
  "needs_more_evidence",
  "conflict",
  "human_review",
])

const ALLOWED_FIELDS = new Set(["city", "province", "public_street_address", "phone", "website"])
const DAY = 24 * 60 * 60 * 1_000

function currentNeed(value) {
  return ["missing", "stale", "wrong"].includes(value) ? 8 : 0
}

function sourceFresh(candidate, now) {
  if (candidate.source_fresh === false) return false
  const observed = Date.parse(candidate.source_retrieved_at || "")
  return Number.isFinite(observed) && now - observed <= DAY && observed <= now + 5 * 60_000
}

function complete(candidate) {
  return Boolean(candidate.resource_id && candidate.field && candidate.proposed_value && candidate.source_url && candidate.source_content_complete === true)
}

function websiteWriterCompatible(candidate, fresh, allowed) {
  return candidate.field === "website" && allowed && fresh && candidate.identity === "exact" && candidate.first_party === true && candidate.no_conflict === true && candidate.privacy_safe === true && candidate.domain_match === true && candidate.redirected !== true && candidate.ai_only !== true && complete(candidate)
}

export function scoreCorrectionReadiness(candidate = {}, { now = Date.now() } = {}) {
  const reasons = [], penalties = []
  const allowed = ALLOWED_FIELDS.has(candidate.field)
  const fresh = sourceFresh(candidate, now)
  const evidenceComplete = complete(candidate)
  let score = 0
  if (candidate.identity === "exact") { score += 25; reasons.push("exact_resource_identity") } else if (candidate.identity === "ambiguous") { score -= 35; penalties.push("ambiguous_identity") }
  if (candidate.first_party === true) { score += 18; reasons.push("first_party_source") } else penalties.push("non_first_party_source")
  if (fresh) { score += 14; reasons.push("fresh_source") } else { score -= 25; penalties.push("stale_source") }
  if (candidate.no_conflict === true) { score += 14; reasons.push("no_current_authoritative_conflict") } else { score -= 50; penalties.push("conflicting_sources") }
  if (allowed) { score += 10; reasons.push("allowed_canonical_field") } else { score -= 30; penalties.push("unsupported_field") }
  if (candidate.privacy_safe === true) { score += 8; reasons.push("public_privacy_safe") } else { score -= 30; penalties.push("privacy_unsafe") }
  if (evidenceComplete) { score += 5; reasons.push("evidence_shape_complete") } else { score -= 20; penalties.push("incomplete_evidence_shape") }
  score += currentNeed(candidate.current_value_state)
  if (currentNeed(candidate.current_value_state)) reasons.push(`current_value_${candidate.current_value_state}`)
  if (candidate.redirected === true || candidate.domain_match === false) { score -= 30; penalties.push(candidate.redirected === true ? "redirected_source" : "domain_mismatch") }
  if (candidate.ai_only === true) { score -= 40; penalties.push("ai_only_support") }
  const writerCompatible = websiteWriterCompatible(candidate, fresh, allowed)
  if (candidate.field === "website" && writerCompatible) { score += 8; reasons.push("website_writer_compatible") }

  let readiness_class
  if (candidate.no_conflict !== true) readiness_class = "conflict"
  else if (candidate.identity !== "exact" || candidate.ai_only === true || candidate.privacy_safe !== true) readiness_class = "human_review"
  else if (writerCompatible && score >= 90) readiness_class = "ready_for_trusted_writer_preview"
  else if (score >= 60) readiness_class = "likely_ready_after_revalidation"
  else readiness_class = "needs_more_evidence"
  return Object.freeze({ id: String(candidate.id || ""), score, readiness_class, writer_compatible: writerCompatible, reasons: Object.freeze(reasons.sort()), penalties: Object.freeze(penalties.sort()) })
}

export function rankCorrectionReadiness(candidates = [], options = {}) {
  return Object.freeze(candidates.map((candidate) => ({ ...scoreCorrectionReadiness(candidate, options), candidate }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)))
}
