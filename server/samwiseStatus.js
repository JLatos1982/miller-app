import { createHash, timingSafeEqual } from "node:crypto"
import { publicHealthSourceStatus } from "./publicHealthSources.js"

const MAX_COUNT = 1000000
const ACTIVE_LIFECYCLES = new Set(["new", "active", "recurring", "needs_review", "reappeared"])
const ALIGNMENTS = new Set(["aligned", "build_unknown", "schema_unknown", "schema_behind_build", "schema_ahead_of_build", "migration_gap", "compatibility_unknown"])
const PULSE_STATES = new Set(["completed", "degraded", "failed", "running", "never_run"])
const SOURCE_FRESHNESS = new Set(["current", "stale", "never_run", "failed", "live_disabled", "unknown"])

const count = (value) => Math.max(0, Math.min(MAX_COUNT, Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0))
const timestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ? value : null
const activeFinding = (item) => ACTIVE_LIFECYCLES.has(String(item?.lifecycle || ""))

export function getSamwiseBearerToken(headerValue) {
  const match = String(headerValue || "").match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] || ""
}

// Hashing first gives timingSafeEqual same-length inputs without retaining or
// returning either credential. This is a dedicated integration secret only.
export function samwiseTokenMatches(supplied, configured) {
  if (!configured || !supplied) return false
  const actual = createHash("sha256").update(String(supplied)).digest()
  const expected = createHash("sha256").update(String(configured)).digest()
  return timingSafeEqual(actual, expected)
}

export function createRequireSamwiseStatus({ getToken = () => process.env.SAMWISE_STATUS_TOKEN } = {}) {
  return function requireSamwiseStatus(req, res, next) {
    const configured = String(getToken() || "")
    const supplied = getSamwiseBearerToken(req.headers?.authorization)
    if (!samwiseTokenMatches(supplied, configured)) { res.setHeader("Cache-Control", "no-store"); return res.status(401).json({ error: "Unauthorized" }) }
    return next()
  }
}

function sourceMode(source) {
  if (source.retrieval === "fixed_live_ready") return "manual"
  if (source.retrieval === "fixture_validated_live_disabled") return "live_disabled"
  return "unknown"
}

function sourceFreshness(source) {
  if (source.retrieval === "fixture_validated_live_disabled" || source.status === "fixture_validated_live_disabled" || source.status === "disabled") return "live_disabled"
  if (source.status === "never_checked") return "never_run"
  if (source.status === "degraded") return "failed"
  return SOURCE_FRESHNESS.has(source.status) ? source.status : "unknown"
}

function maintenanceState(item, now) {
  if (!item) return { state: "unknown", last_completed_at: null }
  if (item.status === "completed") return { state: "healthy", last_completed_at: timestamp(item.completed_at) || timestamp(item.started_at) }
  if (["failed", "security_halt", "degraded"].includes(item.status)) return { state: "degraded", last_completed_at: timestamp(item.completed_at) }
  if (item.status === "running") return { state: now - new Date(item.started_at || 0).getTime() > 20 * 60 * 1000 ? "stale" : "running", last_completed_at: null }
  return { state: "unknown", last_completed_at: null }
}

function overallState({ database, findings, latestCheck, maintenance, queues, deployment }) {
  if (database.state === "degraded" || findings.critical > 0 || findings.high > 0 || ["degraded", "stale"].includes(maintenance.state)) return "degraded"
  if (findings.medium > 0 || ["failed", "degraded"].includes(latestCheck.state) || ["running", "stale"].includes(maintenance.state) || Object.values(queues).some((value) => value > 0)) return "review_required"
  if (database.state === "unknown" || ["build_unknown", "schema_unknown", "compatibility_unknown"].includes(deployment)) return "unknown"
  return "healthy"
}

export function buildSamwiseStatus({ now = Date.now(), build = {}, database = {}, securityFindings = [], pulse = null, deploymentAlignment = "compatibility_unknown", maintenance = null, checkpoints = [], queues = {} } = {}) {
  const generated_at = new Date(now).toISOString()
  const open_findings = securityFindings.filter(activeFinding).reduce((result, item) => {
    if (["critical", "high", "medium"].includes(item?.severity)) result[item.severity] += 1
    return result
  }, { critical: 0, high: 0, medium: 0 })
  const latest_check = { state: pulse ? (PULSE_STATES.has(pulse.status) ? pulse.status : "unknown") : "never_run", completed_at: timestamp(pulse?.completed_at) }
  const maintenanceStatus = maintenanceState(maintenance, now)
  const safeQueues = { resource_review: count(queues.resource_review), shelter_review: count(queues.shelter_review), location_qc: count(queues.location_qc), attachment_scan: count(queues.attachment_scan) }
  const db = { state: ["healthy", "degraded", "unknown"].includes(database.state) ? database.state : "unknown", observed_at: timestamp(database.observed_at) || generated_at }
  const deployment = ALIGNMENTS.has(deploymentAlignment) ? deploymentAlignment : "compatibility_unknown"
  const sources = publicHealthSourceStatus(checkpoints, now).map((source) => ({ id: source.id, mode: sourceMode(source), freshness: sourceFreshness(source), last_success_at: timestamp(source.last_success_at) }))
  const security = { self_check_scope: pulse ? "local_only" : "not_run", latest_check, open_findings, deployment_alignment: deployment }
  const operations = { database: db, maintenance: maintenanceStatus, queues: safeQueues }
  return {
    schema_version: "miller-status-v1",
    application: { id: "miller", generated_at, build: build.git_sha || build.build_id ? "known" : "unknown" },
    overall: overallState({ database: db, findings: open_findings, latestCheck: latest_check, maintenance: maintenanceStatus, queues: safeQueues, deployment }),
    security,
    operations,
    sources,
  }
}
