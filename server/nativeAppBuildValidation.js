import { createHash } from "node:crypto"

export const NATIVE_APP_BUILD_VALIDATION_ID = "native_app_build_validation"
export const NATIVE_APP_BUILD_LIFECYCLE = Object.freeze(["inspect", "toolchain_check", "build", "diagnose", "bounded_fix", "rebuild", "test", "runtime_smoke_test", "readiness_handoff"])
export const NATIVE_APP_ACTION_CLASSES = Object.freeze(["safe_automatic", "requires_owner_approval", "human_runtime_observation"])
export const NATIVE_APP_ATTEMPT_RESULTS = Object.freeze(["not_attempted", "passed", "failed", "blocked", "deferred", "observed"])

const clean = (value, limit = 500) => String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, limit)
const timestamp = value => typeof value === "string" && !Number.isNaN(Date.parse(value))
const digest = value => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")

export function validateNativeAppBuildCapability(capability) {
  if (capability?.schema_version !== "native-app-build-validation-v1" || capability.capability_id !== NATIVE_APP_BUILD_VALIDATION_ID) throw new Error("native_app_build_capability_invalid")
  if (capability.mutation_authority !== "bounded_development_fixes_only" || capability.publication_authority !== false || capability.release_authority !== false) throw new Error("native_app_build_authority_invalid")
  if (!Array.isArray(capability.lifecycle) || capability.lifecycle.join("|") !== NATIVE_APP_BUILD_LIFECYCLE.join("|")) throw new Error("native_app_build_lifecycle_invalid")
  if (!Array.isArray(capability.action_classes) || capability.action_classes.join("|") !== NATIVE_APP_ACTION_CLASSES.join("|")) throw new Error("native_app_build_actions_invalid")
  if (!Array.isArray(capability.adapters) || !capability.adapters.some(adapter => adapter.adapter_id === "xcode_swiftui")) throw new Error("native_app_build_adapter_missing")
  return { valid: true, capability_id: capability.capability_id, adapters: capability.adapters.length }
}

export function validateNativeAppProjectProfile(profile) {
  if (profile?.schema_version !== "native-app-project-profile-v1" || !clean(profile.project_id) || !clean(profile.platform) || !clean(profile.project_type)) throw new Error("native_app_project_profile_invalid")
  if (!Array.isArray(profile.safe_candidate_commands) || !Array.isArray(profile.runtime_workflows) || !Array.isArray(profile.known_unknowns)) throw new Error("native_app_project_profile_incomplete")
  if (profile.signing?.requires_owner_approval !== true) throw new Error("native_app_signing_owner_gate_missing")
  return { valid: true, project_id: profile.project_id, platform: profile.platform }
}

export function createNativeAppBuildAttempt({ attempt_id, stage, action_class, command = null, tool = null, started_at, result = "not_attempted", build_result = null, install_result = null, failure_class = null, evidence = [], compiler_errors = [], fixes_applied = [], observations = [], unresolved_blockers = [] } = {}) {
  if (!clean(attempt_id, 120) || !NATIVE_APP_BUILD_LIFECYCLE.includes(stage) || !NATIVE_APP_ACTION_CLASSES.includes(action_class) || !timestamp(started_at) || !NATIVE_APP_ATTEMPT_RESULTS.includes(result)) throw new Error("native_app_attempt_invalid")
  if (action_class !== "safe_automatic" && command) throw new Error("native_app_nonautomatic_command_forbidden")
  if (action_class === "safe_automatic" && stage === "bounded_fix" && fixes_applied.some(fix => /sign|certificate|provision|release|publish|submit/i.test(fix))) throw new Error("native_app_unsafe_fix_forbidden")
  const normalized = {
    attempt_id: clean(attempt_id, 120), stage, action_class, command: command ? clean(command, 1_000) : null, tool: tool ? clean(tool, 120) : null, started_at, result,
    build_result: build_result && NATIVE_APP_ATTEMPT_RESULTS.includes(build_result) ? build_result : null,
    install_result: install_result && NATIVE_APP_ATTEMPT_RESULTS.includes(install_result) ? install_result : null,
    failure_class: failure_class ? clean(failure_class, 120).replace(/[^a-z0-9_]/gi, "_").toLowerCase() : null,
    evidence: evidence.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
    compiler_errors: compiler_errors.map(item => clean(item, 1_000)).filter(Boolean).slice(0, 30),
    fixes_applied: fixes_applied.map(item => clean(item, 500)).filter(Boolean).slice(0, 20),
    observations: observations.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
    unresolved_blockers: unresolved_blockers.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
  }
  return Object.freeze({ ...normalized, fingerprint: digest(normalized) })
}

export function createNativeAppOperationalMemory({ project_id, updated_at, toolchain = {}, last_successful_build = null, last_successful_test = null, known_simulator = null, commands = {}, recurring_errors = [], project_quirks = [], critical_smoke_tests = [], attempts = [] } = {}) {
  if (!clean(project_id) || !timestamp(updated_at) || !Array.isArray(recurring_errors) || !Array.isArray(project_quirks) || !Array.isArray(critical_smoke_tests) || !Array.isArray(attempts)) throw new Error("native_app_memory_invalid")
  const normalized = {
    schema_version: "native-app-build-operational-memory-v1", project_id: clean(project_id), updated_at,
    toolchain: { xcode: clean(toolchain.xcode, 120) || null, swift: clean(toolchain.swift, 120) || null, macos: clean(toolchain.macos, 120) || null },
    last_successful_build: last_successful_build || null, last_successful_test: last_successful_test || null, known_simulator: known_simulator || null,
    commands: Object.fromEntries(Object.entries(commands).map(([key, value]) => [clean(key, 80), clean(value, 1_000)]).filter(([key, value]) => key && value)),
    recurring_errors: recurring_errors.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
    project_quirks: project_quirks.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
    critical_smoke_tests: critical_smoke_tests.map(item => clean(item, 500)).filter(Boolean).slice(0, 30),
    attempts: attempts.map(attempt => createNativeAppBuildAttempt(attempt)),
  }
  return Object.freeze({ ...normalized, fingerprint: digest(normalized) })
}

export function planNativeAppValidationJob({ capability, profile, memory, requested_stage = "inspect" } = {}) {
  validateNativeAppBuildCapability(capability)
  validateNativeAppProjectProfile(profile)
  if (!NATIVE_APP_BUILD_LIFECYCLE.includes(requested_stage)) throw new Error("native_app_requested_stage_invalid")
  const adapter = capability.adapters.find(item => item.adapter_id === profile.adapter_id)
  if (!adapter) throw new Error("native_app_project_adapter_missing")
  return Object.freeze({
    job_type: NATIVE_APP_BUILD_VALIDATION_ID,
    project_id: profile.project_id,
    requested_stage,
    adapter_id: adapter.adapter_id,
    authority: { mutation: "bounded_development_fixes_only", publication: false, release: false, signing_changes: "owner_approval_required" },
    next_action: requested_stage === "runtime_smoke_test" ? "await_human_runtime_observation" : "safe_inspection_or_toolchain_evidence_only",
    last_known_successful_build: memory?.last_successful_build || null,
    records_only: ["attempt metadata", "sanitized compiler errors", "owner-approved bounded fixes", "human runtime observations"],
    never: ["App Store submission", "production publication", "certificate or profile changes", "secret creation or rotation", "destructive restructuring", "hidden migration", "autonomous release"],
  })
}
