import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { compactOwnerAdvisoryRetrieval, createOwnerAdvisoryInbox } from "./samwiseOwnerAdvisories.js"
import { redactWorkObserverText } from "./samwiseWorkObserver.js"

export const SAMWISE_OWNER_BRIEF_SCHEMA = "samwise-owner-brief-v1"
export const SAMWISE_OWNER_BRIEF_TOOL = "samwise_owner_brief"

const safeText = (value, limit = 360) => redactWorkObserverText(String(value ?? "").normalize("NFKC").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, limit)
const safeId = value => safeText(value, 160).toLowerCase().replace(/[^a-z0-9:_-]/g, "_")
const safeList = (value, limit = 20) => Array.isArray(value) ? [...new Set(value.map(item => safeText(item, 220)).filter(Boolean))].slice(0, limit) : []
const validTimestamp = value => typeof value === "string" && Number.isFinite(Date.parse(value))
const readJson = file => { try { return JSON.parse(readFileSync(file, "utf8")) } catch { return null } }
const readJsonLines = file => { try { return readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
const latestAt = rows => rows.map(row => row.created_at || row.occurred_at || row.completed_at || row.updated_at || row.ended_at || row.started_at || row.recorded_at || row.timestamp).filter(validTimestamp).sort().at(-1) || null

// This is a source inventory, not a claim that every source is currently live.
export function samwiseSignalProducerInventory({ listenerRegistry = null } = {}) {
  const listenerCount = Array.isArray(listenerRegistry?.listeners) ? listenerRegistry.listeners.length : null
  return Object.freeze([
    { id: "miller_security_status", observes: "aggregate security findings, local pulse, deployment alignment, maintenance and review queues", output: "GET /api/integrations/samwise/status", cadence: "on_demand authenticated server read", owner_status: true, emits_change: true, sensitivity: "aggregate operational metadata", advisory_feed: "adapter-ready; no current local status snapshot is imported" },
    { id: "miller_owner_status_and_change_intelligence", observes: "material versus uncertain record changes and owner-review fields", output: "server/palantirChangeIntelligence.js and Miller/Farm status summaries", cadence: "event-driven when its callers run", owner_status: true, emits_change: true, sensitivity: "owner-review evidence metadata", advisory_feed: "adapter-ready" },
    { id: "farm_listener_framework", observes: `${listenerCount === null ? "registered" : listenerCount} bounded public-record, resource-quality, security and maintenance listeners`, output: "src/data/farm-listener-registry-v1.json and Farm job/run records", cadence: "scheduled or manual by listener", owner_status: true, emits_change: true, sensitivity: "public-source results plus private run metadata", advisory_feed: "adapter-ready for material change or failure only" },
    { id: "samwise_public_records_and_igor", observes: "bounded public-record research, comparison and local worker availability", output: "Farm/Samwise listener results and status summaries", cadence: "scheduled or owner-authorized", owner_status: true, emits_change: true, sensitivity: "owner-private research metadata", advisory_feed: "adapter-ready; worker does not become owner authority" },
    { id: "samwise_work_observer", observes: "explicit, scoped work sessions and sanitized work events", output: "artifacts/samwise/runtime/work-observer", cadence: "manual explicit session", owner_status: false, emits_change: true, sensitivity: "private local operational metadata", advisory_feed: "indirect through workflow/capability evidence" },
    { id: "samwise_capability_intelligence", observes: "bounded capability execution outcomes and recurring route signals", output: "artifacts/samwise/runtime/capability-intelligence", cadence: "on recorded execution", owner_status: false, emits_change: true, sensitivity: "private local operational metadata", advisory_feed: "active" },
    { id: "samwise_workflow_memory", observes: "validated workflow episodes, recurring failures, gaps and provisional strategies", output: "artifacts/samwise/runtime/workflow-memory", cadence: "on explicit ingestion", owner_status: false, emits_change: true, sensitivity: "private local operational metadata", advisory_feed: "active" },
    { id: "native_app_build_validation", observes: "bounded iOS project/toolchain/build/test/runtime evidence", output: "artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json", cadence: "manual development validation", owner_status: false, emits_change: true, sensitivity: "private development metadata", advisory_feed: "active through capability/workflow evidence" },
    { id: "farm_weekly_owner_email", observes: "bounded seven-day Farm run aggregates and material changes", output: "server/farmWeeklyOwnerEmail.js", cadence: "weekly when delivery is separately configured", owner_status: false, emits_change: true, sensitivity: "private owner summary", advisory_feed: "fallback only; it is not a canonical advisory source" },
  ])
}

// Converts already-bounded, material source events to the existing advisory shape.
// It intentionally rejects healthy/no-change and unsupported source events.
export function normalizeSignalForOwnerAdvisory(input = {}) {
  const kind = safeId(input.kind)
  const source_system = safeId(input.source_system)
  const source_ids = safeList(input.source_ids, 40)
  if (!source_system || !source_ids.length || input.material !== true || ["healthy", "no_change", "routine"].includes(kind)) return null
  const rules = {
    security: { advisory_type: "security_change", significance: "important", urgency: "high" },
    listener: { advisory_type: "listener_change", significance: "meaningful", urgency: "normal" },
    miller: { advisory_type: "miller_change", significance: "meaningful", urgency: "normal" },
    learning: { advisory_type: "learning_signal", significance: "meaningful", urgency: "low" },
  }
  const rule = rules[kind]
  if (!rule || !safeText(input.title) || !safeText(input.concise_summary)) return null
  return Object.freeze({
    advisory_type: rule.advisory_type, title: safeText(input.title, 180), concise_summary: safeText(input.concise_summary, 700),
    significance: rule.significance, confidence: ["low", "moderate", "high"].includes(input.confidence) ? input.confidence : "low",
    evidence_count: Number.isInteger(input.evidence_count) && input.evidence_count > 0 ? input.evidence_count : source_ids.length,
    source_system, source_ids, affected_capabilities: safeList(input.affected_capabilities, 20).map(safeId).filter(Boolean),
    suggested_action: safeText(input.suggested_action, 500) || null, owner_decision_required: input.owner_decision_required === true,
    urgency: rule.urgency, blocked: input.blocked === true, safe_artifact_references: safeList(input.safe_artifact_references, 12).map(value => path.basename(value)),
  })
}

export function localSignalProducerState(root, { now = new Date() } = {}) {
  const targets = [
    ["samwise_owner_advisory_inbox", "artifacts/samwise/runtime/owner-advisories/advisories-v1.ndjson"],
    ["samwise_capability_intelligence", "artifacts/samwise/runtime/capability-intelligence/execution-observations-v1.ndjson"],
    ["samwise_workflow_memory", "artifacts/samwise/runtime/workflow-memory/episodes-v1.ndjson"],
    ["samwise_work_observer", "artifacts/samwise/runtime/work-observer/work-events-v1.ndjson"],
    ["native_app_build_validation", "artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json"],
  ]
  return Object.freeze(targets.map(([id, relative]) => {
    const file = path.resolve(root, relative)
    const present = existsSync(file)
    const value = relative.endsWith(".json") ? readJson(file) : readJsonLines(file)
    const rows = Array.isArray(value) ? value : value?.attempts || []
    const last_observed_at = latestAt(rows)
    const age = last_observed_at ? new Date(now).getTime() - Date.parse(last_observed_at) : null
    return { producer_id: id, availability: !present ? "unavailable" : age === null ? "unknown_freshness" : age > 31 * 86_400_000 ? "stale" : "available", last_observed_at, records: rows.length }
  }))
}

export function buildSamwiseOwnerBrief({ advisories = [], producer_states = [], now = new Date(), limit = 12 } = {}) {
  const bounded = compactOwnerAdvisoryRetrieval(advisories, { limit: Math.min(Math.max(Number(limit) || 12, 1), 20) })
  const active = bounded.filter(item => ["new", "seen", "acknowledged"].includes(item.status))
  const bySource = fragment => active.filter(item => item.source_system.includes(fragment))
  const blockers = active.filter(item => ["configuration_problem", "degraded_capability", "repeated_failure"].includes(item.advisory_type))
  const decisions = active.filter(item => item.owner_decision_required)
  const hasImportant = active.some(item => item.significance === "important" || item.urgency === "high")
  const noMeaningful = active.length === 0
  return Object.freeze({
    schema_version: SAMWISE_OWNER_BRIEF_SCHEMA,
    generated_at: new Date(now).toISOString(), read_only: true, no_meaningful_changes: noMeaningful,
    overall_state: noMeaningful ? "no_meaningful_changes" : hasImportant ? "attention_required" : "meaningful_changes_available",
    advisories: bounded,
    attention_items: active.filter(item => item.significance !== "notice" || item.urgency !== "low"),
    security_changes: bySource("security"), listener_findings: active.filter(item => item.advisory_type === "listener_change"),
    capability_and_workflow_learning: active.filter(item => ["learning_signal", "successful_new_workflow", "capability_gap", "repeated_failure"].includes(item.advisory_type)),
    blockers, owner_decisions_needed: decisions.map(item => ({ advisory_id: item.advisory_id, title: item.title, suggested_action: item.suggested_action })),
    suggested_next_work: active.filter(item => item.suggested_action).map(item => ({ advisory_id: item.advisory_id, suggested_action: item.suggested_action })).slice(0, 12),
    producer_states: producer_states.slice(0, 16),
  })
}

// This is the only retrieval seam intended for ChatGPT/MCP wiring. It accepts no
// path, SQL, filter language, or mutation operation.
export function createReadOnlySamwiseOwnerBriefSurface(root, { now = () => new Date() } = {}) {
  const inbox = createOwnerAdvisoryInbox(root)
  return Object.freeze({
    tool_name: SAMWISE_OWNER_BRIEF_TOOL, read_only: true, allowed_arguments: ["limit"], forbidden_capabilities: ["filesystem_path", "sql", "raw_logs", "secrets", "mutations"],
    retrieve({ limit = 12 } = {}) {
      if (!Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 20) throw new Error("samwise_owner_brief_limit_invalid")
      return buildSamwiseOwnerBrief({ advisories: inbox.list({ limit: 100 }), producer_states: localSignalProducerState(root, { now: now() }), now: now(), limit: Number(limit) })
    },
  })
}

export function diagnoseChatGptBridge({ configured_servers = [], bridge_process_observed = null, probe = null } = {}) {
  const known = safeList(configured_servers, 40).map(safeId)
  const samwiseConfigured = known.some(name => name.includes("samwise"))
  const status = probe?.http_status
  let state = "not_observable_from_workspace"
  let diagnosis = "No Samwise MCP/SSE connection configuration is present in this workspace inspection."
  if (status === 404) { state = "tunnel_reachable_route_not_found"; diagnosis = "The probe reached an HTTP responder but the requested MCP/SSE route was not mounted there. The 404 alone cannot distinguish a stale connection URL from a missing local bridge route." }
  else if (probe?.attempted && status >= 200 && status < 400) { state = "probe_reachable"; diagnosis = "The probed endpoint responded; protocol and authentication validation still remain." }
  else if (samwiseConfigured) { state = bridge_process_observed === false ? "configured_bridge_not_observed" : "configured_bridge_unverified"; diagnosis = "A Samwise connection is configured but local bridge/probe evidence is unavailable." }
  return Object.freeze({ schema_version: "samwise-chatgpt-bridge-health-v1", read_only_diagnostic: true, state, configured_server_present: samwiseConfigured, bridge_process_observed, probe: probe ? { attempted: probe.attempted === true, http_status: Number.isInteger(status) ? status : null, route_kind: safeId(probe.route_kind) || null } : null, diagnosis, owner_action: state === "tunnel_reachable_route_not_found" ? "In ChatGPT, reconnect the existing read-only Samwise connection to the bridge's currently verified MCP route, then run its bounded health/owner-brief probe. Do not create a public unauthenticated route." : null })
}
