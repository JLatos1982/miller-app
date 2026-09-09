import assert from "node:assert/strict"
import test from "node:test"

import capability from "../src/data/native-app-build-validation-v1.json" with { type: "json" }
import profile from "../src/data/native-app-project-profile-miller-navigator-v1.json" with { type: "json" }
import memory from "../artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json" with { type: "json" }
import { createNativeAppBuildAttempt, createNativeAppOperationalMemory, planNativeAppValidationJob, validateNativeAppBuildCapability, validateNativeAppProjectProfile } from "../server/nativeAppBuildValidation.js"

test("native-app capability is non-publishing and has the required lifecycle", () => {
  assert.deepEqual(validateNativeAppBuildCapability(capability), { valid: true, capability_id: "native_app_build_validation", adapters: 5 })
  assert.deepEqual(validateNativeAppProjectProfile(profile), { valid: true, project_id: "miller_navigator_ios", platform: "iOS" })
  assert.equal(capability.publication_authority, false)
  assert.equal(capability.release_authority, false)
})

test("operational memory records the observed simulator-install failure without inventing a post-repair success", () => {
  const saved = createNativeAppOperationalMemory(memory)
  assert.equal(saved.last_successful_build.product, "Miller.app")
  assert.equal(saved.last_successful_test, null)
  assert.equal(saved.known_simulator, "iPhone 16e simulator")
  assert.equal(saved.attempts.length, 7)
  assert.equal(saved.attempts[0].build_result, "passed")
  assert.equal(saved.attempts[0].install_result, "failed")
  assert.equal(saved.attempts[0].failure_class, "missing_bundle_identifier")
  assert.equal(saved.attempts[1].build_result, "passed")
  assert.equal(saved.attempts[1].install_result, "failed")
  assert.equal(saved.attempts[1].failure_class, "missing_or_invalid_cf_bundle_executable")
  assert.equal(saved.attempts[2].install_result, "passed")
  assert.equal(saved.attempts[3].stage, "bounded_fix")
  assert.equal(saved.attempts[4].failure_class, "host_swift_toolchain_sdk_mismatch")
  assert.equal(saved.attempts[5].stage, "bounded_fix")
  assert.equal(saved.attempts[5].failure_class, "unsupported_accessibility_live_region_api")
  assert.equal(saved.attempts[5].build_result, "not_attempted")
  assert.equal(saved.attempts[6].failure_class, "active_developer_directory_command_line_tools")
  assert.equal(saved.attempts[6].build_result, "blocked")
})

test("attempts distinguish automated facts from human runtime observations and reject unsafe fixes", () => {
  const runtime = createNativeAppBuildAttempt({ attempt_id: "runtime-1", stage: "runtime_smoke_test", action_class: "human_runtime_observation", started_at: "2026-09-08T01:00:00.000Z", result: "observed", observations: ["Owner observed launch result."] })
  assert.equal(runtime.command, null)
  assert.throws(() => createNativeAppBuildAttempt({ attempt_id: "unsafe-1", stage: "bounded_fix", action_class: "safe_automatic", started_at: "2026-09-08T01:00:00.000Z", fixes_applied: ["Changed provisioning profile."] }), /unsafe_fix/)
  assert.throws(() => createNativeAppBuildAttempt({ attempt_id: "approval-1", stage: "build", action_class: "requires_owner_approval", command: "xcodebuild build", started_at: "2026-09-08T01:00:00.000Z" }), /nonautomatic_command/)
})

test("Farm-equivalent job seam is record-only and waits for a person at runtime", () => {
  const plan = planNativeAppValidationJob({ capability, profile, memory, requested_stage: "runtime_smoke_test" })
  assert.equal(plan.job_type, "native_app_build_validation")
  assert.equal(plan.next_action, "await_human_runtime_observation")
  assert.equal(plan.authority.publication, false)
  assert.match(plan.never.join(" "), /App Store submission/)
})
