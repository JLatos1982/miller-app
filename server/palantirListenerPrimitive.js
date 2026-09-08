import { detectFarmListenerAnomaly, normalizeFarmListenerResult, protectFarmListenerMemory, reconcileListenerDocument, transparentSourceYield } from "./farmListenerFramework.js"

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)

export function adaptListenerToPalantirPrimitive(listener = {}) {
  if (!listener.listener_id || !listener.source_family || !listener.jurisdiction) throw new Error("palantir_listener_registration_invalid")
  return Object.freeze({
    schema_version: "palantir-listener-primitive-v1",
    listener_id: clean(listener.listener_id, 120),
    source_family: clean(listener.source_family, 100),
    jurisdiction: clean(listener.jurisdiction, 80),
    schedule: listener.schedule,
    execution_target: clean(listener.execution_target, 30) || "samwise",
    lifecycle: ["source", "fetch", "parse", "normalize", "fingerprint", "reconcile", "classify", "cross_domain_analyze", "verify", "connect", "route", "monitor", "report"],
    scheduler: "farm_job_scheduler",
    preserve_listener_id: true,
    replay_safe_memory: true,
    cross_domain_routing: true,
    mutation_authority: false,
    publication_authority: false,
  })
}

export async function executePalantirListenerPrimitive({ listener, adapter, previousMemory = null, history = [], anomalyOptions = {} } = {}) {
  const primitive = adaptListenerToPalantirPrimitive(listener)
  if (typeof adapter !== "function") throw new Error("palantir_listener_adapter_required")
  try {
    const raw = await adapter({ listener: primitive, previousMemory })
    const result = normalizeFarmListenerResult(raw.result || raw)
    const anomaly = detectFarmListenerAnomaly(result, anomalyOptions)
    const effectiveResult = anomaly.anomalous ? normalizeFarmListenerResult({ ...result, status: "quarantined", owner_review: Math.max(1, result.owner_review), notes: [...result.notes, "Unexpected source-volume change quarantined."] }) : result
    return Object.freeze({ primitive, result: effectiveResult, memory: protectFarmListenerMemory({ previous: previousMemory, candidate: raw.memory, result: effectiveResult }), anomaly, source_yield: transparentSourceYield([...history, effectiveResult]), mutation_authority: false, publication_authority: false })
  } catch (error) {
    const result = normalizeFarmListenerResult({ status: "failed", errors: 1, notes: [clean(error?.message || "listener failed", 240)] })
    return Object.freeze({ primitive, result, memory: previousMemory, anomaly: { anomalous: false, action: "retain_previous_state" }, source_yield: transparentSourceYield([...history, result]), mutation_authority: false, publication_authority: false })
  }
}

export function reconcilePalantirListenerDocument(input) {
  return Object.freeze({ ...reconcileListenerDocument(input), automatic_event_merge: false, event_identity_is_document_identity: false })
}
