import { createHash } from "node:crypto"

const fingerprint = (parts) => createHash("sha256").update(parts.join("|")).digest("hex")
const safe = (value, limit = 500) => String(value || "").replace(/[\r\n\t]/g, " ").slice(0, limit)

export function capabilityGap({ subsystem, problem_class, target_key, worker_candidates = [], reason, safety_category = "human_review", suggested_direction, evidence_refs = [] } = {}) {
  if (!subsystem || !problem_class || !target_key) return null
  return { gap_fingerprint: fingerprint([subsystem, problem_class, target_key]), subsystem: safe(subsystem, 80), problem_class: safe(problem_class, 120), target_key: safe(target_key, 180), worker_candidates: [...new Set(worker_candidates.map((item) => safe(item, 100)).filter(Boolean))].slice(0, 6), reason: safe(reason, 500), safety_category: ["low", "research_required", "human_review", "security_review"].includes(safety_category) ? safety_category : "human_review", suggested_direction: safe(suggested_direction, 300), evidence_refs: evidence_refs.filter(Boolean).slice(0, 12), status: "candidate" }
}

export function capabilityGapsFromMaintenance({ growth_opportunities = [], security = {} } = {}) {
  const gaps = []
  for (const item of growth_opportunities.slice(0, 40)) {
    if (item.gap_type === "mapping_missing_geocoder_evidence") gaps.push(capabilityGap({ subsystem: "mapping", problem_class: item.gap_type, target_key: item.target_key, worker_candidates: ["canonical_location_geocoder_review"], reason: item.reason, safety_category: "research_required", suggested_direction: "Provide a controlled geocoder-evidence acquisition path; do not pin without the result." }))
    if (["mapping_missing_occupancy_claim", "mapping_missing_authoritative_occupancy_evidence", "mapping_location_conflict"].includes(item.gap_type)) gaps.push(capabilityGap({ subsystem: "mapping", problem_class: item.gap_type, target_key: item.target_key, worker_candidates: ["canonical_authoritative_location_research"], reason: item.reason, safety_category: "human_review", suggested_direction: "Improve authoritative occupancy research and keep contradictory evidence human-reviewed." }))
    if (String(item.gap_type).startsWith("stale_")) gaps.push(capabilityGap({ subsystem: "resource_data", problem_class: item.gap_type, target_key: item.target_key, worker_candidates: ["resource_fact_reverification"], reason: item.reason, safety_category: "research_required", suggested_direction: "Use the existing controlled reverification worker; stale evidence is not false evidence." }))
  }
  for (const item of security.items || []) if (!item.executable && item.classification !== "informational") gaps.push(capabilityGap({ subsystem: "security", problem_class: item.classification, target_key: item.id, worker_candidates: [], reason: item.reason, safety_category: "security_review", suggested_direction: "Keep security remediation human-directed; do not grant runtime infrastructure authority." }))
  return gaps.filter(Boolean).slice(0, 40)
}

export function rankGrowth(items = []) {
  const risk = { low: 20, research_required: 10, human_review: -10, security_review: -15 }
  return [...items].map((item) => ({ ...item, ranking_score: Math.max(0, Math.min(100, Number(item.priority || 50) + Math.min(20, Number(item.recurrence_count || 1) * 3) + (risk[item.safety_category] || 0) + (Array.isArray(item.worker_candidates) && item.worker_candidates.length ? 5 : 0))) })).sort((a, b) => b.ranking_score - a.ranking_score || String(a.target_key || "").localeCompare(String(b.target_key || ""))).slice(0, 40)
}
