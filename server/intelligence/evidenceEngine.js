import { normalizeIdentityText, normalizePhone, normalizePublicUrl } from "../resourceIdentity.js"

export const EVIDENCE_ENGINE_VERSION = "miller-evidence-v1.0.0"
export const CLAIM_DECISIONS = Object.freeze(["auto_accept", "accept_with_monitoring", "human_review", "reject", "unknown"])
const FIELD_RISK = Object.freeze({ name: "low", operator: "low", website: "low", phone: "low", municipality: "low", postal_code: "low", coordinates: "low", address: "medium", hours: "medium", cost: "medium", accessibility: "medium", eligibility: "high", walk_in: "high", referral_required: "high", immediate_availability: "high", clinical_suitability: "high", confidential_location: "high" })
const SOURCE_AUTHORITY = Object.freeze({ human_override: 100, official_provider: 90, health_authority: 90, government: 88, authorized_structured_provider: 85, bc_geocoder: 85, established_directory: 68, existing_miller: 65, tavily_discovery: 25, search_snippet: 15, llm_extraction: 5 })
const MAX_AGE_DAYS = Object.freeze({ phone: 180, website: 365, hours: 90, address: 365, coordinates: 730, eligibility: 90, walk_in: 60, referral_required: 90 })

function clean(value, max = 2_000) { return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max) }
function normalized(field, value) { if (field === "phone") return normalizePhone(value); if (field === "website") return normalizePublicUrl(value); return normalizeIdentityText(value) }
function ageDays(timestamp, now) { const time = Date.parse(timestamp); return Number.isFinite(time) ? Math.max(0, (now.getTime() - time) / 86_400_000) : Infinity }
export function fieldRisk(field) { return FIELD_RISK[field] || "medium" }
export function sourceAuthority(sourceType, field) {
  if (sourceType === "bc_geocoder" && !["coordinates", "municipality", "postal_code"].includes(field)) return 30
  if (sourceType === "official_provider" && field === "coordinates") return 55
  return SOURCE_AUTHORITY[sourceType] || 0
}
export function normalizeEvidenceSource(input, field, now = new Date()) {
  const sourceType = clean(input?.sourceType, 80), value = clean(input?.value)
  let url = clean(input?.url)
  if (url) { try { const parsed = new URL(url); if (parsed.protocol !== "https:") url = "" } catch { url = "" } }
  return { sourceType, sourceRecordId: clean(input?.sourceRecordId, 200) || null, value, normalizedValue: normalized(field, value), url: url || null, extractionMethod: clean(input?.extractionMethod, 80) || "structured", retrievedAt: clean(input?.retrievedAt, 40) || null, authority: sourceAuthority(sourceType, field), independentKey: clean(input?.independentKey, 200) || sourceType, stale: ageDays(input?.retrievedAt, now) > (MAX_AGE_DAYS[field] || 365), untrustedContent: true }
}
export function evaluateClaim({ subjectId, field, proposedValue, existingTrustedValue = null, evidence = [], safetyFlags = [] }, { now = new Date() } = {}) {
  const risk = fieldRisk(field), sources = evidence.slice(0, 20).map((item) => normalizeEvidenceSource(item, field, now)).filter((item) => item.normalizedValue)
  const proposed = normalized(field, proposedValue), supporting = sources.filter((item) => item.normalizedValue === proposed), contradicting = sources.filter((item) => item.normalizedValue !== proposed)
  const current = normalized(field, existingTrustedValue), independent = new Set(supporting.map((item) => item.independentKey)).size, strongest = Math.max(0, ...supporting.map((item) => item.authority)), freshStrong = supporting.filter((item) => !item.stale && item.authority >= 68), reasons = []
  let decision = "unknown"
  if (safetyFlags.includes("private_location") || field === "confidential_location") { decision = "reject"; reasons.push("private_location_risk") }
  else if (!proposed || !supporting.length) reasons.push("insufficient_evidence")
  else if (current && current !== proposed) { decision = "human_review"; reasons.push("conflicts_with_existing_verified_fact") }
  else if (contradicting.some((item) => !item.stale && item.authority >= 68)) { decision = "human_review"; reasons.push("authoritative_source_conflict") }
  else if (risk === "high") { decision = "human_review"; reasons.push("consequential_field_requires_human_review") }
  else if (!freshStrong.length) { decision = supporting.every((item) => item.stale) ? "accept_with_monitoring" : "human_review"; reasons.push(supporting.every((item) => item.stale) ? "stale_source" : "insufficient_authority") }
  else if (risk === "low" && (strongest >= 85 || independent >= 2)) { decision = "auto_accept"; reasons.push(strongest >= 85 ? "official_source_agreement" : "two_independent_sources_agree") }
  else if (risk === "medium" && strongest >= 85 && independent >= 2) { decision = "accept_with_monitoring"; reasons.push("two_independent_sources_agree", "medium_risk_monitoring") }
  else { decision = "human_review"; reasons.push("insufficient_independent_program_evidence") }
  if (supporting.some((item) => item.sourceType === "llm_extraction") && supporting.every((item) => item.sourceType === "llm_extraction")) { decision = "human_review"; reasons.splice(0, reasons.length, "llm_not_independent_evidence") }
  return { version: EVIDENCE_ENGINE_VERSION, subjectId: clean(subjectId, 200), field, proposedValue, existingTrustedValue, risk, decision, confidence: decision === "auto_accept" ? "high" : decision === "unknown" ? "unknown" : "bounded", reasonCodes: [...new Set(reasons)], agreement: { supporting: supporting.length, contradicting: contradicting.length, independentSources: independent }, evidence: sources }
}

export function buildExceptionQueue(claims = []) {
  return claims.filter((item) => ["human_review", "reject"].includes(item.decision)).map((item) => ({ id: `${item.subjectId}:${item.field}`, subjectId: item.subjectId, field: item.field, currentValue: item.existingTrustedValue, proposedValue: item.proposedValue, supportingEvidence: item.evidence.filter((source) => source.normalizedValue === normalized(item.field, item.proposedValue)), conflictingEvidence: item.evidence.filter((source) => source.normalizedValue !== normalized(item.field, item.proposedValue)), confidence: item.confidence, risk: item.risk, reasonCodes: item.reasonCodes, suggestedActions: ["approve_suggestion", "keep_existing", "reject", "mark_unknown"] }))
}
