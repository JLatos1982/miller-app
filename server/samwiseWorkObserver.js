import { createHash, randomUUID } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

export const SAMWISE_WORK_OBSERVER_ID = "samwise_work_observer"
export const WORK_OBSERVER_SCOPES = Object.freeze(["xcode", "terminal", "vscode", "git", "samwise_jobs", "supabase", "project_directory"])
export const WORK_OBSERVER_EVENT_TYPES = Object.freeze(["build_started", "build_finished", "build_failed", "test_finished", "simulator_launch", "runtime_error", "git_state", "files_changed", "job_started", "job_finished", "api_error", "supabase_validation", "fix_applied", "owner_note"])
const DEFAULT_RETENTION = Object.freeze({ raw_logs_days: 14, screenshots_days: 7, structured_events: "durable", pinned_artifacts: "until_explicit_removal", screenshots_enabled: false })
const clean = (value, maximum = 1_000) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, maximum)
const hash = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")
const countFiles = directory => !existsSync(directory) ? 0 : readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => total + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1), 0)

export function redactWorkObserverText(value) {
  return clean(value, 8_000)
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b(sk|pk|sbp|eyJ)[-_A-Za-z0-9.]{16,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(postgres(?:ql)?:\/\/)[^\s"']+/gi, "$1[REDACTED_CONNECTION]")
    .replace(/\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*[^\s]+/g, "[REDACTED_SECRET]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
}

export function validateWorkObserverCapability(capability) {
  if (capability?.schema_version !== "samwise-work-observer-v1" || capability.capability_id !== SAMWISE_WORK_OBSERVER_ID) throw new Error("samwise_work_observer_capability_invalid")
  if (capability.mutation_authority !== false || capability.publication_authority !== false || capability.supabase_mode !== "private_schema_prepared_not_applied") throw new Error("samwise_work_observer_authority_invalid")
  if (!Array.isArray(capability.scopes) || capability.scopes.join("|") !== WORK_OBSERVER_SCOPES.join("|")) throw new Error("samwise_work_observer_scopes_invalid")
  if (!Array.isArray(capability.pipeline) || capability.pipeline.join("|") !== ["observe", "normalize", "redact", "classify", "store", "summarize", "learn"].join("|")) throw new Error("samwise_work_observer_pipeline_invalid")
  return { valid: true, capability_id: capability.capability_id, observers: capability.phase_1_observers?.length || 0 }
}

export function normalizeWorkEvent(input = {}) {
  if (!WORK_OBSERVER_SCOPES.includes(input.source) || !WORK_OBSERVER_EVENT_TYPES.includes(input.event_type)) throw new Error("samwise_work_event_scope_or_type_invalid")
  if (!clean(input.session_id, 120) || !clean(input.project, 160) || !clean(input.summary, 500)) throw new Error("samwise_work_event_incomplete")
  const timestamp = input.timestamp || new Date().toISOString()
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("samwise_work_event_timestamp_invalid")
  const core = {
    schema_version: "samwise-work-event-v1", session_id: clean(input.session_id, 120), timestamp, project: clean(input.project, 160),
    application: clean(input.application, 120) || null, tool: clean(input.tool, 120) || null, event_type: input.event_type, source: input.source,
    summary: redactWorkObserverText(input.summary).slice(0, 500), sanitized_details: redactWorkObserverText(input.sanitized_details).slice(0, 4_000) || null,
    severity: ["info", "warning", "error"].includes(input.severity) ? input.severity : "info",
    related_files: (input.related_files || []).map(file => clean(path.basename(file), 180)).filter(Boolean).slice(0, 30),
    command_identifier: redactWorkObserverText(input.command_identifier).slice(0, 300) || null,
    status: ["started", "passed", "failed", "blocked", "observed", "fixed"].includes(input.status) ? input.status : "observed",
    prior_event_id: clean(input.prior_event_id, 120) || null, resulting_event_id: clean(input.resulting_event_id, 120) || null,
    resolution_status: ["open", "resolved", "unknown"].includes(input.resolution_status) ? input.resolution_status : "unknown",
    owner_annotation: redactWorkObserverText(input.owner_annotation).slice(0, 500) || null,
  }
  const dedupe_fingerprint = hash({ session_id: core.session_id, project: core.project, application: core.application, tool: core.tool, event_type: core.event_type, source: core.source, summary: core.summary, sanitized_details: core.sanitized_details, severity: core.severity, related_files: core.related_files, command_identifier: core.command_identifier, status: core.status, resolution_status: core.resolution_status })
  return Object.freeze({ event_id: `swo_${hash(core).slice(0, 24)}`, ...core, fingerprint: hash(core), dedupe_fingerprint })
}

export function createWorkObserverStore(root, { retention = DEFAULT_RETENTION, now = () => new Date() } = {}) {
  const directory = path.resolve(root, "artifacts/samwise/runtime/work-observer")
  const sessionPath = path.join(directory, "work-sessions-v1.json")
  const eventPath = path.join(directory, "work-events-v1.ndjson")
  const retentionPath = path.join(directory, "retention-v1.json")
  mkdirSync(directory, { recursive: true })
  const read = (file, fallback) => { try { return JSON.parse(readFileSync(file, "utf8")) } catch { return fallback } }
  const sessions = () => read(sessionPath, { schema_version: "samwise-work-sessions-v1", sessions: [] })
  const save = value => { const temp = `${sessionPath}.tmp`; writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); renameSync(temp, sessionPath) }
  if (!existsSync(retentionPath)) writeFileSync(retentionPath, `${JSON.stringify({ schema_version: "samwise-work-retention-v1", ...DEFAULT_RETENTION, ...retention }, null, 2)}\n`, { mode: 0o600 })
  const events = () => { try { return readFileSync(eventPath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { return [] } }
  return {
    paths: { directory, sessionPath, eventPath, retentionPath },
    start({ project, scopes, duration_minutes = null, project_directories = [] } = {}) {
      if (!clean(project) || !Array.isArray(scopes) || !scopes.length || scopes.some(scope => !WORK_OBSERVER_SCOPES.includes(scope))) throw new Error("samwise_work_session_scope_invalid")
      if (duration_minutes !== null && (!Number.isInteger(duration_minutes) || duration_minutes < 1 || duration_minutes > 720)) throw new Error("samwise_work_session_duration_invalid")
      const state = sessions(); if (state.sessions.some(item => item.status === "active")) throw new Error("samwise_work_session_already_active")
      const session = { session_id: `sws_${randomUUID().replaceAll("-", "").slice(0, 24)}`, project: clean(project, 160), scopes: [...new Set(scopes)], project_directories: project_directories.map(item => clean(item, 300)).filter(Boolean).slice(0, 10), started_at: now().toISOString(), ends_at: duration_minutes ? new Date(now().getTime() + duration_minutes * 60_000).toISOString() : null, stopped_at: null, status: "active" }
      save({ ...state, sessions: [...state.sessions, session] }); return session
    },
    stop(sessionId, reason = "owner_stopped") { const state = sessions(); const session = state.sessions.find(item => item.session_id === sessionId && item.status === "active"); if (!session) throw new Error("samwise_work_session_not_active"); session.status = "stopped"; session.stopped_at = now().toISOString(); session.stop_reason = clean(reason, 120); save(state); return session },
    status() { const state = sessions(); const active = state.sessions.filter(item => item.status === "active"); const all = events(); const policy = read(retentionPath, DEFAULT_RETENTION); const day = now().toISOString().slice(0, 10); return { active_sessions: active, current_scopes: [...new Set(active.flatMap(item => item.scopes))], event_count: all.length, events_today: all.filter(item => item.timestamp.startsWith(day)).length, local_storage_bytes: readdirSync(directory).reduce((sum, file) => sum + statSync(path.join(directory, file)).size, 0), supabase_records_written: 0, screenshots_retained: countFiles(path.join(directory, "screenshots")), screenshots_enabled: policy.screenshots_enabled === true } },
    record(input) { const active = sessions().sessions.find(item => item.session_id === input.session_id && item.status === "active"); if (!active) throw new Error("samwise_work_session_not_active"); if (active.ends_at && Date.parse(active.ends_at) <= now().getTime()) throw new Error("samwise_work_session_expired"); if (!active.scopes.includes(input.source) || input.source === "work_observer") throw new Error("samwise_work_event_scope_not_active"); const event = normalizeWorkEvent(input); const prior = events(); if (prior.some(item => item.dedupe_fingerprint === event.dedupe_fingerprint && Math.abs(Date.parse(item.timestamp) - Date.parse(event.timestamp)) < 5_000)) return { event, duplicate: true }; appendFileSync(eventPath, `${JSON.stringify(event)}\n`, { mode: 0o600 }); return { event, duplicate: false } },
    recent(limit = 25) { return events().slice(-Math.min(Math.max(Number(limit) || 25, 1), 100)).reverse() },
    summary(sessionId) { const session = sessions().sessions.find(item => item.session_id === sessionId); if (!session) throw new Error("samwise_work_session_missing"); const rows = events().filter(item => item.session_id === sessionId); return { session, events: rows.length, by_type: Object.fromEntries(Object.entries(Object.groupBy(rows, row => row.event_type)).map(([key, value]) => [key, value.length])), failures: rows.filter(row => row.status === "failed").length, fixes: rows.filter(row => row.event_type === "fix_applied").length, open: rows.filter(row => row.resolution_status === "open").length } },
    patterns() { const failures = events().filter(item => item.status === "failed"); const grouped = Object.groupBy(failures, item => `${item.application || item.source}|${item.summary.toLowerCase().replace(/\d+/g, "#")}`); return Object.values(grouped).filter(rows => rows.length >= 2).map(rows => ({ signature: rows[0].summary, occurrences: rows.length, advisory: "Review prior fixes; do not mutate automatically.", related_event_ids: rows.map(row => row.event_id) })) },
    cleanup() { const policy = read(retentionPath, DEFAULT_RETENTION); const removed = []; for (const [folder, days] of [["raw", policy.raw_logs_days], ["screenshots", policy.screenshots_days]]) { const target = path.join(directory, folder); if (!existsSync(target)) continue; for (const file of readdirSync(target)) { const item = path.join(target, file); if (now().getTime() - statSync(item).mtimeMs > Number(days) * 86_400_000) { rmSync(item, { recursive: true, force: true }); removed.push(`${folder}/${file}`) } } } return { removed, structured_events_retained: true } },
  }
}

export function nativeAppAttemptsToWorkEvents(memory, { session_id, project = "miller_navigator_ios" } = {}) {
  return (memory?.attempts || []).map(attempt => normalizeWorkEvent({ session_id, project, source: "xcode", application: "Xcode", tool: attempt.tool, event_type: attempt.install_result === "failed" ? "build_failed" : attempt.install_result === "passed" ? "simulator_launch" : attempt.stage === "test" ? "test_finished" : "fix_applied", summary: attempt.failure_class || attempt.observations?.[0] || attempt.attempt_id, sanitized_details: [...(attempt.evidence || []), ...(attempt.unresolved_blockers || [])].join(" "), severity: attempt.result === "failed" || attempt.result === "blocked" ? "error" : "info", status: attempt.result, resolution_status: attempt.install_result === "passed" ? "resolved" : attempt.result === "failed" ? "open" : "unknown" }))
}

export function gitStateToWorkEvent({ session_id, project, branch = null, before = {}, after = {}, related_files = [] } = {}) {
  const beforeState = before.clean === true ? "clean" : "dirty"
  const afterState = after.clean === true ? "clean" : "dirty"
  const changed = clean(after.commit || after.head || branch, 120) || "uncommitted state"
  return normalizeWorkEvent({
    session_id, project, source: "git", application: "Git", tool: "git status", event_type: "git_state",
    summary: `Repository ${beforeState} → ${afterState} on ${changed}.`,
    sanitized_details: `Branch: ${clean(branch, 120) || "unknown"}; tracked file names only; no source contents captured.`,
    related_files, severity: afterState === "dirty" ? "warning" : "info", status: "observed",
  })
}

export function samwiseJobToWorkEvent({ session_id, project, job = {} } = {}) {
  const complete = ["passed", "failed", "blocked", "observed"].includes(job.status)
  const status = complete ? job.status : "started"
  return normalizeWorkEvent({
    session_id, project, source: "samwise_jobs", application: "Samwise/Codex", tool: clean(job.capability_id, 120) || "manual_job", event_type: complete ? "job_finished" : "job_started",
    summary: clean(job.summary, 500) || `Samwise job ${status}.`, sanitized_details: job.result ? clean(job.result, 4_000) : null,
    related_files: job.changed_files || [], severity: status === "failed" || status === "blocked" ? "error" : "info", status,
    resolution_status: status === "failed" || status === "blocked" ? "open" : status === "passed" ? "resolved" : "unknown",
  })
}

export function privateSupabasePersistencePlan() {
  return Object.freeze({ mode: "proposal_only_not_applied", destination: "private schema", automatic_uploads: false, never_upload: ["screenshots", "raw terminal history", "large logs", "binaries", "secrets", "service-role credentials"], approval_required: ["database migration", "binary or artifact uploads", "any new external destination"], durable_records: ["sessions", "events", "patterns"] })
}
