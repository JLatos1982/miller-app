import { createHash } from "node:crypto"

import { SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID } from "./samwisePublicRecordsIntelligence.js"

export const PALANTIR_DISPLAY_NAME = "Palantír"
export const PALANTIR_QUALIFIED_NAME = "Samwise Palantír"
export const PALANTIR_PLAN_STATES = Object.freeze(["draft", "approved", "running", "paused", "completed", "cancelled", "failed", "owner_review"])

const PLAN_STATES = new Set(PALANTIR_PLAN_STATES)
const DEPTH_LIMITS = Object.freeze({ single: 12, bounded: 50, standard: 100 })
const TERMINAL = new Set(["completed", "cancelled", "failed", "owner_review"])
const clean = (value, limit = 300) => String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
const iso = value => new Date(value).toISOString()

const transitions = Object.freeze({
  draft: new Set(["approved", "cancelled"]),
  approved: new Set(["running", "paused", "cancelled"]),
  running: new Set(["paused", "completed", "cancelled", "failed", "owner_review"]),
  paused: new Set(["approved", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(["approved", "cancelled"]),
  owner_review: new Set(["approved", "cancelled"]),
})

function allocateBudgets(sourcePlan, total) {
  if (!sourcePlan.length) return []
  let remaining = total
  return sourcePlan.map((source, index) => {
    const sourcesLeft = sourcePlan.length - index
    const budget = Math.max(1, Math.floor(remaining / sourcesLeft))
    remaining -= budget
    return { ...source, document_budget: budget }
  })
}

export function createPalantirResearchPlan(basePlan, { now = new Date(), requestedBy = "owner" } = {}) {
  if (basePlan?.schema_version !== "samwise-universal-research-plan-v1" || basePlan.capability_id !== SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID) throw new Error("palantir_base_plan_invalid")
  const documentLimit = Math.min(DEPTH_LIMITS[basePlan.parameters?.depth] || 50, Math.max(1, Number(basePlan.limits?.documents || 50)))
  const sourcePlan = allocateBudgets(basePlan.source_plan || [], documentLimit).map(source => ({
    ...source,
    why_selected: [...(source.selection_reasons || [])],
    expected_document_types: [...(source.operations || [])],
    scheduled_listener_data_available: Boolean(source.scheduled_listener_id),
    previously_researched: Boolean(basePlan.continuation_of && source.selection_reasons?.some(reason => reason === "continuation:previously_productive")),
    estimated_cost_usd: 0,
    execution_adapter: clean(source.operations?.[0] || "registered_listener", 80),
    execution_status: "pending",
  }))
  const createdAt = iso(now)
  return Object.freeze({
    ...basePlan,
    schema_version: "palantir-supervised-research-plan-v1",
    display_name: PALANTIR_DISPLAY_NAME,
    formal_name: "Samwise Public Records Intelligence",
    plan_id: `palantir-plan:${hash({ request: basePlan.request_fingerprint, createdAt }).slice(0, 24)}`,
    source_plan: sourcePlan,
    limits: {
      sources: Math.min(8, Number(basePlan.limits?.sources || 8)),
      documents: documentLimit,
      branch_depth: Math.min(2, Number(basePlan.limits?.branch_depth || 2)),
      branch_documents: 50,
      retries_per_source: 1,
      execution_ms: 120_000,
      cost_usd: 5,
    },
    state: sourcePlan.length ? "draft" : "failed",
    requested_by: clean(requestedBy, 80),
    created_at: createdAt,
    updated_at: createdAt,
    state_history: [{ state: sourcePlan.length ? "draft" : "failed", at: createdAt, actor: "samwise", reason: sourcePlan.length ? "explainable_plan_created" : "no_registered_source_match" }],
    approval_required: true,
    automatic_execution: false,
    registered_sources_only: true,
    mutation_authority: false,
    publication_authority: false,
  })
}

export function transitionPalantirResearchPlan(plan, nextState, { actor = "owner", reason = null, now = new Date() } = {}) {
  if (plan?.schema_version !== "palantir-supervised-research-plan-v1" || !PLAN_STATES.has(plan.state) || !PLAN_STATES.has(nextState)) throw new Error("palantir_plan_state_invalid")
  if (!transitions[plan.state].has(nextState)) throw new Error("palantir_plan_transition_invalid")
  if (nextState === "approved" && clean(actor, 80) !== "owner") throw new Error("palantir_owner_approval_required")
  if (nextState === "approved" && !plan.source_plan.length) throw new Error("palantir_plan_has_no_registered_sources")
  const at = iso(now)
  return Object.freeze({ ...plan, state: nextState, updated_at: at, state_history: [...plan.state_history, { state: nextState, at, actor: clean(actor, 80), reason: clean(reason, 180) || null }] })
}

export function createPalantirExecution(plan, { now = new Date() } = {}) {
  if (plan?.schema_version !== "palantir-supervised-research-plan-v1" || !["approved", "running"].includes(plan.state)) throw new Error("palantir_approved_plan_required")
  const at = iso(now)
  return {
    schema_version: "palantir-research-execution-v1",
    capability_id: SAMWISE_PUBLIC_RECORDS_CAPABILITY_ID,
    display_name: PALANTIR_DISPLAY_NAME,
    execution_id: `palantir-execution:${hash({ plan_id: plan.plan_id, at }).slice(0, 24)}`,
    plan_id: plan.plan_id,
    research_request_id: plan.research_request_id,
    state: "running",
    started_at: at,
    updated_at: at,
    source_checkpoints: plan.source_plan.map(source => ({ source_id: source.source_id, execution_adapter: source.execution_adapter, status: "pending", documents_checked: 0, useful_findings: 0, cross_domain_discoveries: 0, cost_usd: 0, attempts: 0, document_fingerprints: [], finding_ids: [], errors: [], stopping_reason: null, completed_at: null })),
    documents: [],
    findings: [],
    cross_domain_discoveries: [],
    errors: [],
    stopping_reason: null,
    cost_usd: 0,
    mutation_authority: false,
    publication_authority: false,
  }
}

function normalizeAdapterResult(result, sourceId, budget) {
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("palantir_adapter_malformed")
  const documents = Array.isArray(result.documents) ? result.documents.slice(0, budget).map(document => {
    const documentId = clean(document.document_id || document.id || document.citation, 180)
    const fingerprint = clean(document.fingerprint, 128) || hash({ sourceId, documentId, url: clean(document.source_url || document.url, 500), title: clean(document.title, 240) })
    if (!documentId) throw new Error("palantir_document_identity_missing")
    return { source_id: sourceId, document_id: documentId, fingerprint, source_url: clean(document.source_url || document.url, 500) || null, review_level: document.review_level === "full_document" ? "full_document" : "index_only" }
  }) : []
  const findings = Array.isArray(result.findings) ? result.findings.map(finding => ({ ...finding, canonical_finding_id: clean(finding.canonical_finding_id || finding.id, 180) })).filter(finding => finding.canonical_finding_id) : []
  const crossDomain = Array.isArray(result.cross_domain_discoveries) ? result.cross_domain_discoveries.filter(item => clean(item.primary_domain, 80) && Array.isArray(item.secondary_domains) && item.secondary_domains.length && ["explicit_source", "reviewed_citation", "deterministic_canonical_match"].includes(item.evidence_basis)) : []
  return { documents, findings, cross_domain_discoveries: crossDomain, cost_usd: Math.max(0, Number(result.cost_usd || 0)), stopping_reason: clean(result.stopping_reason || "source_complete", 80), anomaly: result.anomaly === true }
}

export async function executePalantirResearch({ plan, execution = null, adapters = {}, persistCheckpoint = async () => {}, igorManifestValidator = null, now = () => new Date(), maxExecutionMs, costCeilingUsd, signal } = {}) {
  if (plan?.schema_version !== "palantir-supervised-research-plan-v1" || !["approved", "running"].includes(plan.state)) throw new Error("palantir_approved_plan_required")
  const state = execution ? structuredClone(execution) : createPalantirExecution(plan, { now: now() })
  if (state.schema_version !== "palantir-research-execution-v1" || state.plan_id !== plan.plan_id || TERMINAL.has(state.state)) throw new Error("palantir_execution_invalid")
  if (igorManifestValidator) {
    try {
      const validation = await igorManifestValidator({ plan_id: plan.plan_id, sources: plan.source_plan.map(item => ({ source_id: item.source_id, adapter: item.execution_adapter, document_budget: item.document_budget })) })
      if (validation?.valid !== true) throw new Error("palantir_igor_manifest_invalid")
    } catch (error) {
      state.state = "paused"
      state.stopping_reason = "igor_manifest_validation_unavailable"
      state.errors.push({ source_id: null, code: clean(error?.message || error, 120) })
      state.updated_at = iso(now())
      await persistCheckpoint(structuredClone(state))
      return Object.freeze(state)
    }
  }
  const started = now().getTime()
  const maxMs = Math.min(Number(maxExecutionMs || plan.limits.execution_ms), plan.limits.execution_ms)
  const costLimit = Math.min(Number(costCeilingUsd ?? plan.limits.cost_usd), plan.limits.cost_usd)
  const seen = new Set(state.documents.map(item => item.fingerprint))
  for (const source of plan.source_plan) {
    const checkpoint = state.source_checkpoints.find(item => item.source_id === source.source_id)
    if (["completed", "no_material_change"].includes(checkpoint.status)) continue
    if (signal?.aborted) { state.state = "paused"; state.stopping_reason = "owner_paused"; break }
    if (now().getTime() - started >= maxMs) { state.state = "paused"; state.stopping_reason = "execution_time_limit"; break }
    if (state.cost_usd >= costLimit) { state.state = "paused"; state.stopping_reason = "cost_ceiling"; break }
    if (state.documents.length >= plan.limits.documents) { state.state = "completed"; state.stopping_reason = "document_limit"; break }
    const adapter = adapters[source.source_id] || adapters[source.execution_adapter]
    if (typeof adapter !== "function") {
      checkpoint.status = "deferred"; checkpoint.stopping_reason = "adapter_unavailable"; state.errors.push({ source_id: source.source_id, code: "adapter_unavailable" }); state.state = "owner_review"
      await persistCheckpoint(structuredClone(state)); break
    }
    if (checkpoint.attempts > plan.limits.retries_per_source) {
      checkpoint.status = "deferred"; checkpoint.stopping_reason = "retry_limit"; state.errors.push({ source_id: source.source_id, code: "retry_limit" }); state.state = "owner_review"
      await persistCheckpoint(structuredClone(state)); break
    }
    checkpoint.status = "running"; checkpoint.attempts += 1
    try {
      const remaining = Math.min(source.document_budget, plan.limits.documents - state.documents.length)
      const result = normalizeAdapterResult(await adapter({ source, document_budget: remaining, exclude_fingerprints: [...seen], signal }), source.source_id, remaining)
      if (result.anomaly || result.documents.length > Math.max(12, source.document_budget)) throw new Error("palantir_source_change_anomaly")
      const novel = []
      for (const document of result.documents) {
        if (seen.has(document.fingerprint)) continue
        seen.add(document.fingerprint); novel.push(document); state.documents.push(document)
      }
      const knownFindingIds = new Set(state.findings.map(item => item.canonical_finding_id))
      state.findings.push(...result.findings.filter(item => !knownFindingIds.has(item.canonical_finding_id)))
      state.cross_domain_discoveries.push(...result.cross_domain_discoveries)
      state.cost_usd = Number((state.cost_usd + result.cost_usd).toFixed(4))
      Object.assign(checkpoint, { status: novel.length || result.findings.length ? "completed" : "no_material_change", documents_checked: result.documents.length, useful_findings: result.findings.length, cross_domain_discoveries: result.cross_domain_discoveries.length, cost_usd: result.cost_usd, document_fingerprints: result.documents.map(item => item.fingerprint), finding_ids: result.findings.map(item => item.canonical_finding_id), stopping_reason: result.stopping_reason, completed_at: iso(now()) })
    } catch (error) {
      const code = clean(error?.message || error, 120)
      checkpoint.status = code === "palantir_source_change_anomaly" ? "quarantined" : "interrupted"
      checkpoint.errors.push(code); checkpoint.stopping_reason = code
      state.errors.push({ source_id: source.source_id, code })
      state.state = checkpoint.status === "quarantined" ? "owner_review" : "paused"
      state.stopping_reason = code
    }
    state.updated_at = iso(now())
    await persistCheckpoint(structuredClone(state))
    if (["paused", "owner_review"].includes(state.state)) break
  }
  if (state.state === "running") {
    const pending = state.source_checkpoints.some(item => !["completed", "no_material_change"].includes(item.status))
    state.state = pending ? "paused" : "completed"
    state.stopping_reason = pending ? state.stopping_reason || "source_deferred" : "sources_exhausted"
  }
  state.updated_at = iso(now())
  await persistCheckpoint(structuredClone(state))
  return Object.freeze(state)
}

export function pausePalantirExecution(execution, { now = new Date() } = {}) {
  if (execution?.schema_version !== "palantir-research-execution-v1" || execution.state !== "running") throw new Error("palantir_execution_not_running")
  return Object.freeze({ ...execution, state: "paused", stopping_reason: "owner_paused", updated_at: iso(now) })
}

export function cancelPalantirExecution(execution, { now = new Date() } = {}) {
  if (execution?.schema_version !== "palantir-research-execution-v1" || TERMINAL.has(execution.state)) throw new Error("palantir_execution_not_cancellable")
  return Object.freeze({ ...execution, state: "cancelled", stopping_reason: "owner_cancelled", updated_at: iso(now), documents: [...execution.documents], findings: [...execution.findings] })
}

export function resumePalantirExecution(execution, { now = new Date() } = {}) {
  if (execution?.schema_version !== "palantir-research-execution-v1" || execution.state !== "paused") throw new Error("palantir_execution_not_paused")
  return Object.freeze({ ...execution, state: "running", stopping_reason: null, updated_at: iso(now) })
}

export function buildPalantirReviewPacket(execution, { title = "Palantír research review" } = {}) {
  if (execution?.schema_version !== "palantir-research-execution-v1") throw new Error("palantir_execution_required")
  return Object.freeze({
    schema_version: "palantir-owner-review-packet-v1",
    title: clean(title, 180),
    research_request_id: execution.research_request_id,
    state: execution.state,
    sources_checked: execution.source_checkpoints.filter(item => ["completed", "no_material_change"].includes(item.status)).map(item => item.source_id),
    documents: { checked: execution.documents.length, full: execution.documents.filter(item => item.review_level === "full_document").length, index_only: execution.documents.filter(item => item.review_level === "index_only").length },
    findings: execution.findings.map(item => ({ canonical_finding_id: item.canonical_finding_id, title: clean(item.title, 180), primary_domain: clean(item.primary_domain, 80), destinations: Array.isArray(item.destinations) ? item.destinations.slice(0, 6) : [] })),
    cross_domain_discoveries: execution.cross_domain_discoveries,
    existing_intelligence_strengthened: execution.findings.filter(item => item.related_existing_event || item.related_accountability_chain).map(item => item.canonical_finding_id),
    downstream_opportunities: [...new Set(execution.findings.flatMap(item => item.destinations || []))],
    live_monitoring_opportunities: execution.findings.filter(item => item.next_public_milestone || item.monitoring_source).map(item => item.canonical_finding_id),
    unknowns: execution.errors,
    recommended_next_research: execution.state === "paused" ? "Resume from the first incomplete source after the reported blocker is addressed." : "Review material findings and approve any bounded child branch separately.",
    raw_logs_included: false,
    mutation_authority: false,
    publication_authority: false,
  })
}
