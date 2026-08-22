import { planEvidenceGapWork } from "./evidenceGapPlanner.js"
import { selfAuditNextActions } from "./selfAudit.js"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const PLANNER_DIAGNOSTIC_MAX_RESOURCES = 50
const bounded = (value) => Math.max(1, Math.min(PLANNER_DIAGNOSTIC_MAX_RESOURCES, Number(value) || 20))

export async function loadPlannerDiagnosticState(db, { resourceId = null, limit = 20 } = {}) {
  if (resourceId && !UUID.test(resourceId)) throw new Error("invalid_resource_id")
  const resourceQuery = db.from("resource_registry").select("id,display_name,lifecycle_state,editorial_status").eq("lifecycle_state", "active").neq("editorial_status", "hidden").order("id").limit(resourceId ? 1 : bounded(limit))
  const resourcesResult = resourceId ? await resourceQuery.eq("id", resourceId) : await resourceQuery
  if (resourcesResult.error) throw resourcesResult.error
  const resources = resourcesResult.data || [], ids = resources.map((item) => item.id)
  if (!ids.length) return emptyState()
  const [claimsResult, locationsResult, qcResult, aliasesResult, runItemsResult] = await Promise.all([
    db.from("resource_fact_claims").select("id,resource_id,field_name,proposed_value,status").in("resource_id", ids),
    db.from("resource_locations").select("resource_id,location_type").in("resource_id", ids),
    db.from("location_qc_reviews").select("canonical_resource_id,version,origin").in("canonical_resource_id", ids),
    db.from("resource_source_aliases").select("resource_id,source_type,source_native_id").in("resource_id", ids),
    db.from("canonical_authoritative_research_run_items").select("resource_id,outcome,reason_code,attempted_at,completed_at").in("resource_id", ids).order("attempted_at", { ascending: false }).limit(ids.length * 10),
  ])
  if ([claimsResult, locationsResult, qcResult, aliasesResult, runItemsResult].some((item) => item.error)) throw new Error("planner_state_unavailable")
  const claimIds = (claimsResult.data || []).map((item) => item.id)
  const evidenceResult = claimIds.length ? await db.from("resource_fact_evidence").select("id,claim_id,source_url,source_authority,stale,retrieved_at,source_type").in("claim_id", claimIds).limit(claimIds.length * 10) : { data: [], error: null }
  if (evidenceResult.error) throw evidenceResult.error
  const aliases = aliasesResult.data || [], aliasIndex = new Map(aliases.map((item) => [`${item.source_type}:${item.source_native_id}`, item.resource_id]))
  const candidatesResult = aliases.length ? await db.from("resource_match_candidates").select("left_source_type,left_source_native_id,right_source_type,right_source_native_id,classification,decision").eq("decision", "pending").limit(ids.length * 10) : { data: [], error: null }
  if (candidatesResult.error) throw candidatesResult.error
  const matchCandidates = (candidatesResult.data || []).map((item) => ({ ...item, left_resource_id: aliasIndex.get(`${item.left_source_type}:${item.left_source_native_id}`) || null, right_resource_id: aliasIndex.get(`${item.right_source_type}:${item.right_source_native_id}`) || null })).filter((item) => item.left_resource_id || item.right_resource_id)
  return { resources, claims: claimsResult.data || [], evidence: evidenceResult.data || [], locations: locationsResult.data || [], qc: qcResult.data || [], researchItems: runItemsResult.data || [], matchCandidates }
}

export function buildPlannerDiagnostic(state = {}) {
  const audit_findings = selfAuditNextActions(state)
  const tasks = planEvidenceGapWork({ ...state, auditFindings: audit_findings })
  const by_type = Object.fromEntries([...new Set(tasks.map((item) => item.task_type))].sort().map((type) => [type, tasks.filter((item) => item.task_type === type).length]))
  const by_priority = Object.fromEntries([...new Set(tasks.map((item) => item.priority))].sort((a, b) => b - a).map((priority) => [priority, tasks.filter((item) => item.priority === priority).length]))
  return { summary: { resources_inspected: state.resources?.length || 0, resources_with_no_action: audit_findings.filter((item) => item.recommended_next_action === "no_action_needed").length, total_tasks: tasks.length, actionable_tasks: tasks.filter((item) => item.actionable).length, human_review_tasks: tasks.filter((item) => !item.actionable).length, by_task_type: by_type, by_priority, repeated_no_gain_cases: tasks.filter((item) => item.task_type === "request_human_review_no_gain").length, stale_evidence_cases: tasks.filter((item) => item.task_type === "reconfirm_stale_authoritative_evidence").length, unresolved_relationship_cases: tasks.filter((item) => item.task_type === "investigate_entity_relationship").length, authoritative_address_conflicts: tasks.filter((item) => item.task_type === "resolve_authoritative_address_conflict").length }, audit_findings, tasks }
}

function emptyState() { return { resources: [], claims: [], evidence: [], locations: [], qc: [], researchItems: [], matchCandidates: [] } }
