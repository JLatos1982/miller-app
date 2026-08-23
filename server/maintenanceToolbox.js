import { createHash } from "node:crypto"
import { preflightCategory } from "./mapAutoPublishWorker.js"
import { recheckPriority } from "./intelligence/maintenance.js"
import { growthOpportunity } from "./maintenanceLearning.js"
import { capabilityGapsFromMaintenance, rankGrowth } from "./maintenanceCapabilityGaps.js"
import { classifySecurityMaintenance } from "./maintenanceSecurity.js"

const hash = (parts) => createHash("sha256").update(parts.join("|")).digest("hex")
const text = (value) => String(value ?? "").trim()

export const MAINTENANCE_RESEARCH_WORKERS = Object.freeze({
  mapping_missing_geocoder_evidence: "canonical_location_geocoder_review",
  mapping_missing_occupancy_claim: "canonical_authoritative_location_research",
  mapping_missing_authoritative_occupancy_evidence: "canonical_authoritative_location_research",
  mapping_location_conflict: "canonical_location_conflict_review",
  resource_freshness: "resource_fact_reverification",
})

export function mapReadiness(item = {}) {
  const category = preflightCategory(item)
  const resourceId = item.resource?.id || "unknown"
  if (category === "sensitive_or_protected") return { resource_id: resourceId, state: "human_review_required", reason_code: category, automatic_action: null }
  if (category === "ambiguous_or_conflicting_occupancy_claim") return { resource_id: resourceId, state: "human_review_required", reason_code: "mapping_location_conflict", automatic_action: null }
  if (category === "missing_occupancy_claim") return { resource_id: resourceId, state: "research_required", reason_code: "mapping_missing_occupancy_claim", automatic_action: null }
  if (category === "missing_authoritative_occupancy_evidence") return { resource_id: resourceId, state: "research_required", reason_code: "mapping_missing_authoritative_occupancy_evidence", automatic_action: null }
  if (category === "missing_geocoder_evidence") return { resource_id: resourceId, state: "near_ready", reason_code: "mapping_missing_geocoder_evidence", automatic_action: null }
  if (category === "ready_for_machine_qc") return { resource_id: resourceId, state: "ready_to_heal", reason_code: "trusted_inputs_need_machine_qc", automatic_action: "create_initial_machine_location_qc" }
  if (category === "existing_qc") {
    const current = item.qc?.origin === "machine_initial" && item.qc?.decision === "manual_review"
    return { resource_id: resourceId, state: current ? "human_review_required" : "policy_review_required", reason_code: current ? "human_qc_confirmation_required" : "existing_qc_requires_policy_evaluation", automatic_action: null }
  }
  return { resource_id: resourceId, state: "human_review_required", reason_code: category, automatic_action: null }
}

export function machineQcHealingNeed(item = {}) {
  const readiness = mapReadiness(item)
  if (readiness.automatic_action !== "create_initial_machine_location_qc") return null
  return {
    id: `machine_location_qc:${readiness.resource_id}`,
    domain: "resource_data",
    action_id: "create_initial_machine_location_qc",
    target_type: "canonical_resource",
    target_id: readiness.resource_id,
    severity: "medium",
    value: 80,
    occurred_at: item.geocoderEvidence?.created_at || item.geocoderEvidence?.last_observed_at || "",
    reason_codes: ["trusted_evidence_complete", "no_external_request", "map_readiness_improvement"],
    expected: { decision: "manual_review", origin: "machine_initial", resource_locations_created: 0, public_map_changed: false },
    context: item,
  }
}

export function mappingGrowthOpportunity(item = {}) {
  const readiness = mapReadiness(item)
  if (["ready_to_heal", "policy_review_required"].includes(readiness.state)) return null
  const reason = {
    mapping_missing_geocoder_evidence: "This resource has authoritative address evidence but still needs trustworthy coordinates before it can be pinned.",
    mapping_missing_occupancy_claim: "This resource does not yet have a supported public service address. It needs research; no address will be guessed.",
    mapping_missing_authoritative_occupancy_evidence: "An address claim exists, but current authoritative evidence does not yet establish program occupancy.",
    mapping_location_conflict: "Trusted location evidence conflicts, so no pin can be chosen automatically.",
    sensitive_or_protected: "The location is protected or potentially sensitive and remains human-only.",
    human_qc_confirmation_required: "The evidence package is complete and awaits a human location confirmation.",
  }[readiness.reason_code] || "This location needs a bounded human or research review before mapping."
  const priority = readiness.state === "near_ready" ? 90 : readiness.state === "human_review_required" ? 70 : 60
  return growthOpportunity({ domain: "resource_data", gap_type: readiness.reason_code, target_key: `resource:${readiness.resource_id}`, reason, priority })
}

export function researchHandoff(item = {}) {
  const readiness = mapReadiness(item), worker = MAINTENANCE_RESEARCH_WORKERS[readiness.reason_code]
  if (!worker) return null
  return {
    recommendation_id: hash([readiness.resource_id, readiness.reason_code, worker]),
    resource_id: readiness.resource_id,
    research_class: readiness.reason_code,
    reason_code: readiness.reason_code,
    desired_information: readiness.reason_code === "mapping_missing_geocoder_evidence" ? "current exact BC geocoder package for the already-supported civic address" : "current program-specific authoritative occupancy evidence",
    authority_requirement: "existing controlled worker and independent persisted evidence",
    estimated_cost: readiness.reason_code === "mapping_missing_geocoder_evidence" ? "low" : "bounded",
    risk: readiness.state === "human_review_required" ? "human_review" : "low",
    recommended_worker_class: worker,
    automatic_execution: false,
  }
}

export function resourceFreshnessOpportunity(fact = {}, now = new Date()) {
  const field = text(fact.field)
  if (!field) return null
  const assessment = recheckPriority({ field, lastVerifiedAt: fact.last_verified_at, sourceStillExists: fact.source_still_exists !== false }, now)
  if (assessment.reasonCode === "verification_current") return null
  const target = text(fact.resource_id || fact.subject_id)
  if (!target) return null
  return growthOpportunity({
    domain: "resource_data",
    gap_type: `stale_${field}_evidence`,
    target_key: `resource:${target}`,
    reason: assessment.reasonCode === "source_disappeared" ? `The previous ${field} source is unavailable and needs a fresh check; this does not prove the fact is wrong.` : `The ${field} evidence is old enough to check again; stale does not mean incorrect.`,
    priority: assessment.priority === "urgent" ? 95 : assessment.priority === "high" ? 80 : 60,
  })
}

export function buildMaintenanceToolbox({ mapContexts = [], freshnessFacts = [], securityPulse = null, securityFindings = [] } = {}, now = new Date()) {
  const readiness = mapContexts.slice(0, 100).map(mapReadiness)
  const security = classifySecurityMaintenance({ pulse: securityPulse, findings: securityFindings, now })
  const healing_needs = [...mapContexts.map(machineQcHealingNeed).filter(Boolean), ...security.healing_needs.map((item) => ({ ...item, context: securityPulse }))].slice(0, 20)
  const growth_opportunities = [...mapContexts.map(mappingGrowthOpportunity), ...freshnessFacts.map((fact) => resourceFreshnessOpportunity(fact, now))].filter(Boolean).slice(0, 40)
  const research_handoffs = mapContexts.map(researchHandoff).filter(Boolean).slice(0, 20)
  const capability_gaps = capabilityGapsFromMaintenance({ growth_opportunities, security })
  return { readiness, healing_needs, growth_opportunities, growth_ranking: rankGrowth([...growth_opportunities, ...capability_gaps]), capability_gaps, security, research_handoffs, external_requests: 0, publication_mutations: 0 }
}

export async function createInitialMachineQcHealing({ db, item, actorId, loadState } = {}) {
  const need = machineQcHealingNeed(item)
  if (!need || !actorId || typeof loadState !== "function") return { classification: "not_applicable", verified: false, reason: "machine_qc_preconditions_not_met" }
  const before = await loadState(item.resource.id)
  if (before.qc || Number(before.location_count || 0) !== Number(item.locations?.length || 0)) return { classification: "not_applicable", verified: false, reason: "machine_qc_state_changed" }
  const result = await db.rpc("create_machine_initial_location_qc_from_evidence", { p_resource_id: item.resource.id, p_occupancy_claim_id: item.occupancyClaim.id, p_geocoder_evidence_id: item.geocoderEvidence.id, p_actor_id: actorId })
  if (result.error) throw result.error
  const after = await loadState(item.resource.id)
  const verified = after.qc?.origin === "machine_initial" && after.qc?.decision === "manual_review" && Number(after.location_count || 0) === Number(before.location_count || 0) && after.public_map === before.public_map
  return { classification: verified ? "improved" : "inconclusive", verified, before, after, action_id: need.action_id, target_id: item.resource.id }
}
