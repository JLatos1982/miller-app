import { NEXT_BEST_ACTIONS, selfAuditNextActions } from "./selfAudit.js"

const protectedTerms = /safe home|transition house|confidential|undisclosed|recovery (?:home|house)|domestic violence|trafficking/i
const current = (claim) => !["superseded", "rejected", "unknown"].includes(claim.status)

export const EVIDENCE_GAP_TASK_TYPES = Object.freeze({
  SAFETY_REVIEW: "safety_sensitive_location_review",
  ENTITY_RELATIONSHIP: "investigate_entity_relationship",
  ADDRESS_CONFLICT: "resolve_authoritative_address_conflict",
  PROGRAMME_SITE: "verify_programme_at_site",
  STALE_EVIDENCE: "reconfirm_stale_authoritative_evidence",
  HUMAN_REVIEW: "request_human_review_no_gain",
})

const taskSpec = Object.freeze({
  [NEXT_BEST_ACTIONS.INVESTIGATE_ENTITY_RELATIONSHIP]: { type: EVIDENCE_GAP_TASK_TYPES.ENTITY_RELATIONSHIP, priority: 90, investigation: "Find authoritative evidence that links or separates the two canonical identities. Retain both records separately until then." },
  [NEXT_BEST_ACTIONS.RESOLVE_ADDRESS_CONFLICT]: { type: EVIDENCE_GAP_TASK_TYPES.ADDRESS_CONFLICT, priority: 85, investigation: "Compare current authoritative location sources and determine whether an address correction or human review is required." },
  [NEXT_BEST_ACTIONS.FIND_PROGRAMME_AT_SITE]: { type: EVIDENCE_GAP_TASK_TYPES.PROGRAMME_SITE, priority: 75, investigation: "Find a current authoritative source that names this specific programme at the public civic address. Do not geocode parent-only evidence." },
  [NEXT_BEST_ACTIONS.RECONFIRM_STALE_EVIDENCE]: { type: EVIDENCE_GAP_TASK_TYPES.STALE_EVIDENCE, priority: 60, investigation: "Reconfirm the stale fact from a current authoritative provider or government source." },
  [NEXT_BEST_ACTIONS.STOP_RETRYING]: { type: EVIDENCE_GAP_TASK_TYPES.HUMAN_REVIEW, priority: 40, investigation: "Request human review before any further research; recent attempts did not add authoritative evidence." },
})

export function planEvidenceGapWork({ resources = [], claims = [], evidence = [], locations = [], researchItems = [], auditFindings = null, matchCandidates = [], qc = [] } = {}) {
  const audits = auditFindings || selfAuditNextActions({ resources, claims, evidence, researchItems, matchCandidates, qc })
  const claimsByResource = new Map(), evidenceByClaim = new Map()
  for (const claim of claims) if (current(claim)) claimsByResource.set(claim.resource_id, [...(claimsByResource.get(claim.resource_id) || []), claim])
  for (const item of evidence) evidenceByClaim.set(item.claim_id, [...(evidenceByClaim.get(item.claim_id) || []), item])
  const tasks = []
  for (const audit of audits) {
    const resource = resources.find((item) => item.id === audit.resource_id)
    if (!resource || audit.recommended_next_action === NEXT_BEST_ACTIONS.NO_ACTION) continue
    const resourceClaims = claimsByResource.get(resource.id) || []
    const sensitive = protectedTerms.test(resource.display_name || "") || locations.some((item) => item.resource_id === resource.id && ["confidential", "undisclosed"].includes(item.location_type))
    if (sensitive) {
      tasks.push(makeTask({ resource, audit, claim: null, evidence: [], task_type: EVIDENCE_GAP_TASK_TYPES.SAFETY_REVIEW, priority: 100, actionable: false, blockers: ["sensitive_or_protected_location", "human_review_required"], investigation: "Do not research or geocode a potentially protected location automatically. Request authorized human safety review." }))
      continue
    }
    const spec = taskSpec[audit.recommended_next_action]
    if (!spec) continue
    const claim = resourceClaims.find((item) => item.field_name === "location_occupancy") || null
    const linkedEvidence = claim ? evidenceByClaim.get(claim.id) || [] : []
    const failed = Number(audit.current_state?.prior_failed_attempts || 0)
    const diminishing = audit.recommended_next_action === NEXT_BEST_ACTIONS.STOP_RETRYING || failed >= 2
    tasks.push(makeTask({ resource, audit, claim, evidence: linkedEvidence, task_type: spec.type, priority: spec.priority, actionable: !diminishing, blockers: diminishing ? ["repeated_no_gain", "human_review_required"] : [], investigation: spec.investigation }))
  }
  return dedupe(tasks).sort((a, b) => b.priority - a.priority || a.task_id.localeCompare(b.task_id))
}

function makeTask({ resource, audit, claim, evidence, task_type, priority, actionable, blockers, investigation }) {
  const evidence_ids = evidence.map((item) => item.id).filter(Boolean).sort()
  const task_id = `${resource.id}:${task_type}:${claim?.id || "none"}`
  return Object.freeze({ task_id, resource_id: resource.id, claim_id: claim?.id || null, task_type, priority, actionable, blockers, reason_codes: [...new Set(audit.reason_codes || [])], evidence_ids, previous_attempts: Number(audit.current_state?.prior_failed_attempts || 0), recommended_next_investigation: investigation, explanation: explain(resource, task_type, audit.reason_codes || []), read_only: true })
}

function dedupe(tasks) { return [...new Map(tasks.map((task) => [task.task_id, task])).values()] }
function explain(resource, type, reasons) { return `${type.replaceAll("_", " ")}: ${resource.display_name || resource.id}. ${reasons.join(", ") || "deterministic evidence gap"}.` }
