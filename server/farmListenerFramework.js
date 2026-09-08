import { createHash } from "node:crypto"

export const FARM_LISTENER_CONTRACT_VERSION = "farm-listener-contract-v1"
export const FARM_PROJECT_SCOPES = Object.freeze(["miller", "miller_north", "both", "farm"])
export const FARM_WORKERS = Object.freeze(["samwise", "igor", "either"])
export const FARM_RUN_STATUSES = Object.freeze(["completed", "no_material_change", "deferred", "quarantined", "failed"])

const PROJECTS = new Set(FARM_PROJECT_SCOPES)
const WORKERS = new Set(FARM_WORKERS)
const STATUSES = new Set(FARM_RUN_STATUSES)
const DOMAIN_KEYS = new Set(["healthcare", "policing_custody_corrections", "government_services_funding", "child_welfare_youth_services", "housing_homelessness", "human_rights_public_services", "transportation_access", "education_exploratory"])
const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const number = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0

export function validateFarmListenerRegistry(registry) {
  if (registry?.schema_version !== "farm-listener-registry-v1" || !Array.isArray(registry.listeners)) throw new Error("invalid_farm_listener_registry")
  const ids = new Set()
  for (const listener of registry.listeners) {
    if (!listener.listener_id || ids.has(listener.listener_id)) throw new Error("duplicate_farm_listener_id")
    if (!PROJECTS.has(listener.project_scope) || !WORKERS.has(listener.execution_target)) throw new Error("invalid_farm_listener_routing")
    if (!listener.source_family || !listener.purpose || !listener.adapter) throw new Error("incomplete_farm_listener_definition")
    if (!listener.schedule || !["interval", "milestone", "manual"].includes(listener.schedule.kind)) throw new Error("invalid_farm_listener_schedule")
    if (listener.schedule.kind === "interval" && (!Number.isInteger(listener.schedule.days) || listener.schedule.days < 1 || listener.schedule.days > 366)) throw new Error("invalid_farm_listener_interval")
    if (listener.mutation_authority !== false || listener.publication_authority !== false) throw new Error("farm_listener_authority_must_be_false")
    ids.add(listener.listener_id)
  }
  return {
    valid: true,
    total: registry.listeners.length,
    enabled: registry.listeners.filter(item => item.enabled).length,
    disabled: registry.listeners.filter(item => !item.enabled).length,
    by_worker: Object.fromEntries(FARM_WORKERS.map(worker => [worker, registry.listeners.filter(item => item.execution_target === worker).length])),
  }
}

export function farmOutputFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex")
}

export function normalizeFarmListenerResult(value = {}) {
  const domain_counts = Object.fromEntries(Object.entries(value.domain_counts || {}).filter(([domain, metrics]) => DOMAIN_KEYS.has(domain) && metrics && typeof metrics === "object").map(([domain, metrics]) => [domain, Object.fromEntries(Object.entries(metrics).filter(([key]) => ["checked", "changed", "relevant", "owner_review"].includes(key)).map(([key, amount]) => [key, number(amount)]))]))
  const result = {
    contract_version: FARM_LISTENER_CONTRACT_VERSION,
    status: STATUSES.has(value.status) ? value.status : "completed",
    checked: number(value.checked ?? value.fetched ?? value.documents_checked),
    new_documents: number(value.new_documents),
    updated_documents: number(value.updated_documents ?? value.amended_documents),
    unchanged_documents: number(value.unchanged_documents),
    new_events: number(value.new_events),
    existing_events_strengthened: number(value.existing_events_strengthened),
    owner_review: number(value.owner_review ?? value.owner_review_count ?? value.candidates),
    publication_safe: number(value.publication_safe),
    duplicates_suppressed: number(value.duplicates_suppressed),
    errors: number(value.errors ?? value.failed),
    material_changes: number(value.material_changes ?? value.changed_rows),
    cost_usd: number(value.cost_usd),
    output_titles: Array.isArray(value.output_titles) ? value.output_titles.map(item => clean(item, 160)).filter(Boolean).slice(0, 12) : [],
    owner_review_labels: Array.isArray(value.owner_review_labels) ? value.owner_review_labels.map(item => clean(item, 120)).filter(Boolean).slice(0, 12) : [],
    notes: Array.isArray(value.notes) ? value.notes.map(item => clean(item, 240)).filter(Boolean).slice(0, 12) : [],
    domain_counts,
  }
  if (result.status === "completed" && result.new_documents + result.updated_documents + result.new_events + result.existing_events_strengthened + result.material_changes === 0) result.status = "no_material_change"
  result.output_fingerprint = farmOutputFingerprint(result)
  return Object.freeze(result)
}

export function protectFarmListenerMemory({ previous = null, candidate = null, result } = {}) {
  if (!result || ["failed", "deferred", "quarantined"].includes(result.status)) return previous
  return candidate ?? previous
}

export function detectFarmListenerAnomaly(result, { absoluteNewLimit = 50, ratioLimit = 0.6 } = {}) {
  const observedNew = result.new_documents + result.updated_documents
  const ratio = result.checked ? observedNew / result.checked : 0
  const anomalous = observedNew >= absoluteNewLimit || (result.checked >= 20 && ratio > ratioLimit)
  return { anomalous, observed_new: observedNew, checked: result.checked, ratio, action: anomalous ? "quarantine_owner_review" : "continue" }
}

export function transparentSourceYield(history = []) {
  const completed = history.filter(item => ["completed", "no_material_change"].includes(item.status))
  const total = field => completed.reduce((sum, item) => sum + number(item[field]), 0)
  const checked = total("checked")
  const qualifying = total("new_events") + total("existing_events_strengthened") + total("publication_safe")
  const useful = qualifying + total("material_changes")
  const failures = history.filter(item => item.status === "failed").length
  const metrics = {
    runs: history.length,
    completed_runs: completed.length,
    documents_checked: checked,
    qualifying_items: qualifying,
    material_items: useful,
    qualifying_per_100_documents: checked ? Number((qualifying / checked * 100).toFixed(2)) : 0,
    material_items_per_cycle: completed.length ? Number((useful / completed.length).toFixed(2)) : 0,
    duplicate_rate: checked ? Number((total("duplicates_suppressed") / checked).toFixed(3)) : 0,
    failure_rate: history.length ? Number((failures / history.length).toFixed(3)) : 0,
    external_cost_usd: Number(total("cost_usd").toFixed(4)),
  }
  return { ...metrics, yield_class: classifyTransparentYield(metrics) }
}

export function classifyTransparentYield(metrics) {
  if (metrics.failure_rate >= 0.5) return "paused_review_required"
  if (metrics.qualifying_per_100_documents >= 2 || metrics.material_items_per_cycle >= 1) return "high_yield"
  if (metrics.documents_checked && metrics.material_items_per_cycle === 0) return "useful_monitoring"
  return "insufficient_history"
}

export function recommendTransparentCadence(listener, metrics) {
  if (["operational", "operational_health"].includes(listener.yield_class)) return { action: "keep_configured", days: listener.schedule?.days || null, reason: "Operational health/reporting cadence is policy-driven rather than research-yield-driven." }
  if (listener.schedule?.kind === "milestone") return { action: "keep_milestone", reason: "A known documentary trigger is more useful than periodic polling." }
  if (listener.schedule?.kind === "manual") return { action: "keep_manual", reason: "The source requires bounded, supervised retrieval." }
  if (metrics.completed_runs < 3) return { action: "observe", days: listener.schedule?.days || null, reason: "At least three completed cycles are required before changing cadence." }
  if (metrics.failure_rate >= 0.5) return { action: "pause_for_review", days: null, reason: "At least half of recorded runs failed." }
  if (metrics.qualifying_per_100_documents >= 2 || metrics.material_items_per_cycle >= 1) return { action: "increase_or_keep_weekly", days: 7, reason: "The listener is producing at least one material item per cycle or two qualifying items per 100 documents." }
  if (metrics.material_items_per_cycle >= 0.25) return { action: "keep_biweekly", days: 14, reason: "The listener produces occasional material changes with acceptable reliability." }
  if (metrics.documents_checked > 0 && metrics.material_items_per_cycle === 0) return { action: "reduce_to_monthly", days: 30, reason: "Three or more completed cycles produced no material change; retain monitoring at lower cost." }
  return { action: "observe", days: listener.schedule?.days || null, reason: "There is not enough auditable yield history to recommend a change." }
}

export function reconcileListenerDocument({ listenerId, sourceId, canonicalUrl, documentFingerprint, eventFingerprint, previousDocuments = [] } = {}) {
  const priorBySource = new Map(previousDocuments.map(item => [`${item.listener_id}|${item.source_id}`, item]))
  const priorByEvent = new Map(previousDocuments.filter(item => item.event_fingerprint).map(item => [item.event_fingerprint, item]))
  const prior = priorBySource.get(`${listenerId}|${sourceId}`)
  const sameEvent = eventFingerprint ? priorByEvent.get(eventFingerprint) : null
  const change = !prior ? "new_document" : prior.document_fingerprint === documentFingerprint ? "unchanged" : "updated_document"
  const eventDisposition = sameEvent ? "existing_event_new_evidence" : "event_review_required"
  return { listener_id: listenerId, source_id: sourceId, canonical_url: canonicalUrl, document_fingerprint: documentFingerprint, event_fingerprint: eventFingerprint || null, change, event_disposition: change === "unchanged" ? "no_change" : eventDisposition }
}
