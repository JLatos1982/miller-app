const DAY_MS = 24 * 60 * 60 * 1000

export const SAMWISE_OPERATIONAL_HEALTH_SCHEMA = "samwise-operational-health-v1"
export const OPERATIONAL_STATES = Object.freeze(["healthy", "attention", "degraded", "unavailable", "stale", "unknown", "intentionally_disabled", "maintenance", "completed", "idle"])
export const OBSERVATION_AUTHORITIES = Object.freeze(["authoritative", "derived", "cached"])
export const WARNING_LIFECYCLES = Object.freeze(["new", "active", "acknowledged", "stale", "resolved", "superseded", "false_positive"])
export const REQUEST_LIFECYCLES = Object.freeze(["queued", "claimed", "running", "completed", "failed", "blocked", "expired", "cancelled"])
export const HANDOFF_LIFECYCLES = Object.freeze(["queued", "accepted", "running", "progress", "completed", "failed", "expired"])

const VALID_STATES = new Set(OPERATIONAL_STATES)
const VALID_AUTHORITIES = new Set(OBSERVATION_AUTHORITIES)
const AUTHORITY_SCORE = Object.freeze({ authoritative: 3, derived: 2, cached: 1 })
const CURRENT_STATES = new Set(["healthy", "attention", "degraded", "unavailable", "maintenance", "completed", "idle"])
const iso = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
const at = value => iso(value) ? Date.parse(value) : null
const boundedText = (value, limit = 240) => String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, limit)
const state = value => VALID_STATES.has(value) ? value : "unknown"
const authority = value => VALID_AUTHORITIES.has(value) ? value : "cached"
const confidence = value => value === "authoritative" ? "high" : value === "derived" ? "moderate" : "low"

export function evaluateObservationFreshness(observation = {}, now = new Date()) {
  const observedAt = iso(observation.observed_at)
  const expectedNextAt = iso(observation.expected_next_at)
  const staleAfter = iso(observation.stale_after)
  const sourceState = state(observation.state_at_observation)
  const sourceAuthority = authority(observation.authority)
  const result = {
    component: boundedText(observation.component, 100) || "unknown",
    source_id: boundedText(observation.source_id, 160) || "unknown",
    authority: sourceAuthority,
    observed_at: observedAt,
    expected_next_at: expectedNextAt,
    stale_after: staleAfter,
    source_latency_ms: Number.isFinite(Number(observation.source_latency_ms)) ? Math.max(0, Number(observation.source_latency_ms)) : null,
    state_at_observation: sourceState,
    last_good_at: iso(observation.last_good_at),
    last_failure_at: iso(observation.last_failure_at),
    details: boundedText(observation.details, 500) || null,
  }
  if (sourceState === "intentionally_disabled") return { ...result, state: "intentionally_disabled", freshness: "not_applicable", reason: "source_disabled_by_design" }
  if (!observedAt) return { ...result, state: "unknown", freshness: "unknown", reason: "observation_missing" }
  if (staleAfter && at(staleAfter) < new Date(now).getTime()) return { ...result, state: "stale", freshness: "stale", reason: "observation_past_declared_stale_after" }
  if (!staleAfter) return { ...result, state: sourceState, freshness: "unbounded", reason: "source_has_no_declared_stale_threshold" }
  return { ...result, state: sourceState, freshness: "current", reason: "within_declared_freshness_window" }
}

export function reconcileOperationalComponent({ component, observations = [], now = new Date() } = {}) {
  const evaluated = observations.map(item => evaluateObservationFreshness({ ...item, component: component || item.component }, now))
  const current = evaluated.filter(item => item.freshness === "current" || item.freshness === "unbounded")
  const candidates = current.length ? current : evaluated
  const selected = [...candidates].sort((left, right) => {
    const authorityDifference = AUTHORITY_SCORE[right.authority] - AUTHORITY_SCORE[left.authority]
    return authorityDifference || (at(right.observed_at) || 0) - (at(left.observed_at) || 0)
  })[0] || evaluateObservationFreshness({ component, source_id: "no_observation", authority: "cached" }, now)
  const priorFailure = evaluated.some(item => ["degraded", "unavailable"].includes(item.state_at_observation) && (at(item.observed_at) || 0) < (at(selected.observed_at) || 0))
  const recovered = selected.state === "healthy" && priorFailure
  const reason = recovered ? "newer_healthy_observation_supersedes_older_failure" : selected.reason
  return {
    schema_version: SAMWISE_OPERATIONAL_HEALTH_SCHEMA,
    component: boundedText(component, 100) || selected.component,
    state: selected.state,
    confidence: selected.state === "unknown" ? "low" : confidence(selected.authority),
    observed_at: selected.observed_at,
    last_good_at: selected.last_good_at || (selected.state === "healthy" ? selected.observed_at : null),
    last_failure_at: selected.last_failure_at || evaluated.filter(item => ["degraded", "unavailable"].includes(item.state_at_observation)).sort((left, right) => (at(right.observed_at) || 0) - (at(left.observed_at) || 0))[0]?.observed_at || null,
    expected_next_at: selected.expected_next_at,
    stale_after: selected.stale_after,
    reason,
    recovered,
    evidence: evaluated.map(item => ({ source_id: item.source_id, authority: item.authority, observed_at: item.observed_at, state_at_observation: item.state_at_observation, derived_state: item.state, freshness: item.freshness })).slice(0, 12),
  }
}

export function reconcileMillerHealth({ publicObservations = [], mobileApiObservations = [], internalObservabilityObservations = [], now = new Date() } = {}) {
  const public_health = reconcileOperationalComponent({ component: "miller_public", observations: publicObservations, now })
  const mobile_api = reconcileOperationalComponent({ component: "miller_mobile_api", observations: mobileApiObservations, now })
  const internal_observability = reconcileOperationalComponent({ component: "miller_internal_observability", observations: internalObservabilityObservations, now })
  const publicAvailable = public_health.state === "healthy" || mobile_api.state === "healthy"
  const serviceState = public_health.state === "degraded" || public_health.state === "unavailable" ? public_health.state : publicAvailable ? "healthy" : public_health.state === "stale" && mobile_api.state === "stale" ? "stale" : "unknown"
  return {
    schema_version: SAMWISE_OPERATIONAL_HEALTH_SCHEMA,
    component: "miller",
    state: serviceState,
    confidence: publicAvailable ? "high" : "low",
    reason: publicAvailable && ["degraded", "unavailable", "stale", "unknown"].includes(internal_observability.state) ? "public_service_healthy_internal_observability_separate" : "public_and_mobile_health_reconciled",
    public_health,
    mobile_api,
    internal_observability,
  }
}

export function classifyListenerHealth({ listener = {}, current = {}, now = new Date(), overdueGraceMs = DAY_MS } = {}) {
  const schedule = listener.schedule || {}
  const nextAt = current.next_run_at || schedule.next_expected_at || schedule.first_run_at || null
  const lastSuccess = current.last_successful_at || null
  const base = { listener_id: boundedText(listener.listener_id, 120) || "unknown", last_run_at: current.last_attempted_at || null, last_success_at: lastSuccess, next_due_at: nextAt, consecutive_failures: Math.max(0, Number(current.consecutive_failures || 0)) }
  if (!listener.enabled) return { ...base, state: "intentionally_disabled", listener_state: "disabled", reason: "listener_disabled_by_configuration" }
  if (schedule.kind === "manual") return { ...base, state: "idle", listener_state: "idle-by-design", reason: "manual_listener_has_no_expected_heartbeat" }
  if (["failed", "quarantined"].includes(current.last_status) || base.consecutive_failures > 0) return { ...base, state: "degraded", listener_state: "failing", reason: "last_listener_run_failed_or_quarantined" }
  if (!lastSuccess) return { ...base, state: "unknown", listener_state: "unknown", reason: "no_successful_listener_run_recorded" }
  if (nextAt && at(nextAt) + overdueGraceMs < new Date(now).getTime()) return { ...base, state: "stale", listener_state: "overdue", reason: "listener_missed_expected_cadence" }
  if (schedule.kind === "milestone") return { ...base, state: "idle", listener_state: "idle-by-design", reason: "milestone_listener_waiting_for_declared_trigger" }
  return { ...base, state: "healthy", listener_state: "healthy", reason: "successful_run_within_configured_cadence" }
}

export function reconcileWarningLifecycle({ warning = {}, now = new Date() } = {}) {
  const lifecycle = WARNING_LIFECYCLES.includes(warning.lifecycle) ? warning.lifecycle : "new"
  const lastSeen = iso(warning.last_seen) || iso(warning.first_seen)
  const staleAfter = iso(warning.stale_after)
  const base = { warning_id: boundedText(warning.warning_id, 160) || "unknown", first_seen: iso(warning.first_seen), last_seen: lastSeen, resolved_at: iso(warning.resolved_at), resolution_reason: boundedText(warning.resolution_reason, 300) || null }
  if (warning.false_positive === true) return { ...base, lifecycle: "false_positive", still_active: false, reason: "deterministic_false_positive_evidence" }
  if (warning.superseded_by) return { ...base, lifecycle: "superseded", still_active: false, superseded_by: boundedText(warning.superseded_by, 160), reason: "newer_warning_replaces_same_condition" }
  if (base.resolved_at || warning.resolution_evidence === true) return { ...base, lifecycle: "resolved", still_active: false, resolved_at: base.resolved_at || new Date(now).toISOString(), reason: base.resolution_reason || "resolution_evidence_present" }
  if (staleAfter && at(staleAfter) < new Date(now).getTime()) return { ...base, lifecycle: "stale", still_active: false, reason: "warning_has_no_current_confirmation" }
  return { ...base, lifecycle, still_active: ["new", "active", "acknowledged"].includes(lifecycle), reason: "current_warning_evidence_retained" }
}

export function reconcileReviewItems(items = []) {
  const normalized = items.map(item => ({ ...item, candidate_id: boundedText(item.candidate_id || item.canonical_id, 180) || "unknown", prior_state: boundedText(item.state || item.review_state, 80) || "pending" }))
  const owner_attention = normalized.filter(item => !["needs_more_research", "duplicate", "superseded", "stale", "false_positive", "resolved"].includes(item.prior_state))
  const research_follow_up = normalized.filter(item => item.prior_state === "needs_more_research")
  return { schema_version: SAMWISE_OPERATIONAL_HEALTH_SCHEMA, total: normalized.length, owner_attention_count: owner_attention.length, research_follow_up_count: research_follow_up.length, items: normalized }
}

export function reconcileRequestLifecycle({ request = {}, now = new Date(), defaultTtlMs = 7 * DAY_MS } = {}) {
  const requestedAt = iso(request.requested_at)
  const expiresAt = iso(request.expires_at) || (requestedAt ? new Date(at(requestedAt) + defaultTtlMs).toISOString() : null)
  const lifecycle = REQUEST_LIFECYCLES.includes(request.state) ? request.state : "queued"
  if (["completed", "failed", "cancelled", "expired"].includes(lifecycle)) return { ...request, state: lifecycle, expires_at: expiresAt, still_active: false }
  if (lifecycle === "blocked") return { ...request, state: "blocked", expires_at: expiresAt, still_active: true, requires_owner_attention: true, derived_only: true }
  if (expiresAt && at(expiresAt) < new Date(now).getTime()) return { ...request, state: "expired", expires_at: expiresAt, still_active: false, resolution_reason: "request_expired_without_processing", derived_only: true }
  return { ...request, state: lifecycle, expires_at: expiresAt, still_active: true, derived_only: true }
}

export function buildOwnerStatusV2({ components = [], warnings = [], review = null, now = new Date() } = {}) {
  const current = components.filter(item => ["degraded", "unavailable", "attention"].includes(item.state))
  const stale = components.filter(item => ["stale", "unknown"].includes(item.state))
  const recovered = components.filter(item => item.recovered)
  const activeWarnings = warnings.filter(item => item.still_active)
  return {
    schema_version: "samwise-owner-status-v2",
    generated_at: new Date(now).toISOString(),
    overall_state: current.some(item => ["degraded", "unavailable"].includes(item.state)) ? "attention" : current.length || activeWarnings.length || Number(review?.owner_attention_count || 0) ? "attention" : "healthy",
    current_issues: current.map(item => ({ component: item.component, state: item.state, confidence: item.confidence, reason: item.reason })),
    stale_or_unknown: stale.map(item => ({ component: item.component, state: item.state, confidence: item.confidence, reason: item.reason })),
    recovered: recovered.map(item => ({ component: item.component, reason: item.reason, observed_at: item.observed_at })),
    owner_attention: review ? { count: Number(review.owner_attention_count || 0), research_follow_up_count: Number(review.research_follow_up_count || 0) } : { count: 0, research_follow_up_count: 0 },
    change_only_notification: current.length > 0 || activeWarnings.length > 0 || recovered.length > 0,
  }
}
