import { createHash } from "node:crypto"

const SHA = /^[a-f0-9]{64}$/
const REQUEST_TYPES = new Set(["run_listener", "research_case", "verify_resource", "investigate_address", "refresh_legal_citation", "generate_owner_report"])
const PARAMETER_KEYS = new Set(["jurisdiction", "date_from", "date_to", "depth", "reason"])
const REVIEW_TYPES = new Set(["research_candidate", "evidence_upgrade", "legal_decision_candidate", "support_resource_candidate", "data_quality_issue", "security_issue", "milestone_reached"])
const REQUEST_RESULT_CODES = new Set(["accepted", "completed_no_change", "completed_with_review", "invalid_target", "unsupported", "duplicate", "worker_unavailable", "source_unavailable", "failed_closed"])
const safeText = (value, limit = 180) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const sum = (items, field) => items.reduce((total, item) => total + Number(item?.[field] || 0), 0)
const latest = (items, family) => [...items].reverse().find(item => item.source_family === family) || null
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")

export function validateFarmOwnerRequest(input = {}) {
  const requestType = safeText(input.request_type, 60)
  const targetId = safeText(input.target_id, 200)
  const parameters = input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters) ? input.parameters : {}
  if (!REQUEST_TYPES.has(requestType)) throw new Error("farm_request_type_unsupported")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{1,199}$/.test(targetId)) throw new Error("farm_request_target_invalid")
  if (Object.keys(parameters).some(key => !PARAMETER_KEYS.has(key))) throw new Error("farm_request_parameters_unsupported")
  if (parameters.depth != null && !["single", "bounded", "standard"].includes(parameters.depth)) throw new Error("farm_request_depth_invalid")
  const normalized = Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, safeText(value, key === "reason" ? 300 : 80)]).filter(([, value]) => value))
  if (JSON.stringify(normalized).length > 1800) throw new Error("farm_request_parameters_too_large")
  return { schema_version: "farm-owner-request-v1", request_type: requestType, target_id: targetId, parameters: normalized, request_fingerprint: hash({ request_type: requestType, target_id: targetId, parameters: normalized }) }
}

export function buildFarmStatusSnapshot({ inventory = [], history = [], workerHealth = {}, now = new Date() } = {}) {
  const generatedAt = new Date(now).toISOString()
  const enabled = inventory.filter(item => item.enabled)
  const disabled = inventory.filter(item => !item.enabled)
  const next = enabled.filter(item => item.next_run_at).sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))[0] || null
  const recentCutoff = new Date(generatedAt).getTime() - 7 * 86_400_000
  const recent = history.filter(item => new Date(item.completed_at || 0).getTime() >= recentCutoff)
  const igor = workerHealth.igor || {}
  const failed = enabled.filter(item => ["failed", "quarantined"].includes(item.status) || Number(item.consecutive_failures || 0) > 0)
  const deferred = enabled.filter(item => item.status === "deferred")
  const reviewCount = sum(recent, "owner_review")
  const overallState = failed.length || igor.authenticated === false ? "degraded" : reviewCount || deferred.length ? "attention" : "healthy"
  return {
    schema_version: "farm-owner-status-v1",
    generated_at: generatedAt,
    overall_state: overallState,
    digest: {
      schema_version: "farm-owner-status-v1",
      generated_at: generatedAt,
      listeners: { registered: inventory.length, enabled: enabled.length, disabled: disabled.length, failed: failed.length, deferred: deferred.length, recent_runs: recent.length, checked_this_week: sum(recent, "checked") },
      changes: { new_documents: sum(recent, "new_documents"), updated_documents: sum(recent, "updated_documents"), new_events: sum(recent, "new_events"), strengthened_events: sum(recent, "existing_events_strengthened"), duplicates_suppressed: sum(recent, "duplicates_suppressed") },
      igor: { online: Boolean(igor.available || igor.online), authenticated: Boolean(igor.authenticated), state: safeText(igor.state || igor.status || "unknown", 30), version: safeText(igor.version || igor.worker_version || "unknown", 80), capabilities: Array.isArray(igor.capabilities) ? igor.capabilities.map(item => safeText(item, 60)).slice(0, 12) : [], last_heartbeat: safeText(igor.last_heartbeat || "", 40), last_successful_job: safeText(igor.last_successful_job || "", 100) },
      security: { last_status: safeText(latest(recent, "security_and_operations")?.status || "unknown", 40), issues: Number(latest(recent, "security_and_operations")?.owner_review || 0) + Number(latest(recent, "dependency_security")?.owner_review || 0), production_health: safeText(latest(recent, "production_health")?.status || "unknown", 40), listener_memory: safeText(latest(recent, "listener_state_integrity")?.status || "unknown", 40) },
      data_quality: { last_status: safeText(latest(recent, "miller_location_data_quality")?.status || "unknown", 40), checked: Number(latest(recent, "miller_location_data_quality")?.checked || 0), proposed_corrections: Number(latest(recent, "miller_location_data_quality")?.material_changes || 0), owner_review: Number(latest(recent, "miller_location_data_quality")?.owner_review || 0) },
      resource_health: { last_status: safeText(latest(recent, "shared_canonical_resources")?.status || "unknown", 40), checked: Number(latest(recent, "shared_canonical_resources")?.checked || 0), review_candidates: Number(latest(recent, "shared_canonical_resources")?.owner_review || 0) },
      owner_review: { count: reviewCount, failed_listeners: failed.map(item => safeText(item.listener_id, 100)).slice(0, 10), deferred_listeners: deferred.map(item => safeText(item.listener_id, 100)).slice(0, 10) },
      next_scheduled: next ? { listener_id: safeText(next.listener_id, 100), at: safeText(next.next_run_at, 40), worker: safeText(next.execution_target, 30) } : null,
    },
  }
}

export function buildFarmReviewItemsFromRuns(runs = [], observedAt = new Date().toISOString()) {
  const items = []
  for (const run of runs.filter(item => Number(item.owner_review || 0) > 0 || ["failed", "quarantined", "deferred"].includes(item.status))) {
    const labels = Array.isArray(run.output_titles) && run.output_titles.length ? run.output_titles.slice(0, 6) : [`${run.listener_id}: ${run.status}`]
    for (const [index, label] of labels.entries()) {
      const sourceFamily = safeText(run.source_family, 100)
      const itemType = sourceFamily.includes("legal") || sourceFamily.includes("human_rights") ? "legal_decision_candidate" : sourceFamily.includes("quality") ? "data_quality_issue" : sourceFamily.includes("security") || sourceFamily.includes("health") ? "security_issue" : "research_candidate"
      const canonicalId = `farm:${safeText(run.listener_id, 80).toLowerCase().replace(/[^a-z0-9:_-]+/g, "-")}:${hash({ label, index }).slice(0, 16)}`
      items.push({
        canonical_id: canonicalId,
        item_type: REVIEW_TYPES.has(itemType) ? itemType : "research_candidate",
        project_scope: ["miller", "miller_north", "both", "farm"].includes(run.project_scope) ? run.project_scope : "farm",
        title: safeText(label || "Farm review item", 180),
        summary: safeText(`${run.listener_id} reported ${run.status}; review the bounded source or operational evidence before any downstream action.`, 700),
        jurisdiction: null,
        source_family: sourceFamily || null,
        source_reference: null,
        priority: ["failed", "quarantined"].includes(run.status) ? "high" : run.status === "deferred" ? "milestone" : "normal",
        review_state: "pending",
        metadata: { listener_id: safeText(run.listener_id, 100), status: safeText(run.status, 40), suggested_action: "owner_review", counts: { checked: Number(run.checked || 0), changes: Number(run.material_changes || 0) + Number(run.new_documents || 0) + Number(run.updated_documents || 0) } },
        first_observed_at: safeText(run.completed_at || observedAt, 40),
        last_observed_at: safeText(run.completed_at || observedAt, 40),
      })
    }
  }
  return items
}

export function createFarmSupabasePublisher({ url, serviceRoleKey, ownerId, enabled = false, fetchImpl = fetch } = {}) {
  const configured = enabled && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(url || "")) && String(serviceRoleKey || "").length >= 30 && /^[0-9a-f-]{36}$/i.test(String(ownerId || ""))
  const headers = () => ({ apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", prefer: "return=minimal" })
  const call = async (path, options) => {
    const response = await fetchImpl(`${String(url).replace(/\/$/, "")}/rest/v1/${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } })
    if (!response.ok) throw new Error(`farm_supabase_${response.status}`)
    return response
  }
  return {
    configured,
    async publishStatus(snapshot) {
      if (!configured) return { status: "disabled" }
      if (snapshot?.schema_version !== "farm-owner-status-v1" || snapshot?.digest?.schema_version !== "farm-owner-status-v1") throw new Error("farm_status_invalid")
      await call("farm_owner_status_history", { method: "POST", body: JSON.stringify({ owner_id: ownerId, schema_version: snapshot.schema_version, generated_at: snapshot.generated_at, overall_state: snapshot.overall_state, digest: snapshot.digest }) })
      return { status: "published" }
    },
    async publishReviewItems(items = []) {
      if (!configured) return { status: "disabled", count: 0 }
      if (!items.length) return { status: "no_items", count: 0 }
      await call("farm_owner_review_items?on_conflict=owner_id,canonical_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(items.map(item => ({ ...item, owner_id: ownerId }))) })
      return { status: "published", count: items.length }
    },
    async fetchRunnableRequest() {
      if (!configured) return null
      const response = await call(`farm_owner_requests?owner_id=eq.${encodeURIComponent(ownerId)}&state=eq.pending&request_type=in.(run_listener,generate_owner_report)&select=id,request_type,target_id,parameters,request_fingerprint,requested_at&order=requested_at.asc&limit=1`, { method: "GET" })
      const rows = await response.json()
      return Array.isArray(rows) ? rows[0] || null : null
    },
    async completeRequest(requestId, { state, resultCode, resultReference = null } = {}) {
      if (!configured) return { status: "disabled" }
      if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ""))) throw new Error("farm_request_id_invalid")
      if (!["completed", "rejected", "deferred"].includes(state)) throw new Error("farm_request_completion_state_invalid")
      if (!REQUEST_RESULT_CODES.has(resultCode)) throw new Error("farm_request_result_code_invalid")
      await call(`farm_owner_requests?id=eq.${encodeURIComponent(requestId)}&owner_id=eq.${encodeURIComponent(ownerId)}&state=eq.pending`, {
        method: "PATCH",
        body: JSON.stringify({ state, result_code: safeText(resultCode, 80), result_reference: resultReference ? safeText(resultReference, 500) : null, completed_at: state === "deferred" ? null : new Date().toISOString() }),
      })
      return { status: state }
    },
  }
}

export const farmConversationalExamples = Object.freeze([
  "What did the Farm find today?",
  "Which listeners failed or deferred?",
  "What is Igor doing?",
  "What needs my review?",
  "Which Miller location issues are unresolved?",
  "What is the next scheduled listener?",
])
