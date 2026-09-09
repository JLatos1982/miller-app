import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import capability from "../src/data/samwise-work-observer-v1.json" with { type: "json" }
import nativeMemory from "../artifacts/samwise/native-app-build-validation-miller-navigator-memory-2026-09-08.json" with { type: "json" }
import { createWorkObserverStore, gitStateToWorkEvent, nativeAppAttemptsToWorkEvents, privateSupabasePersistencePlan, redactWorkObserverText, samwiseJobToWorkEvent, validateWorkObserverCapability } from "../server/samwiseWorkObserver.js"

const temporaryRoot = () => mkdtempSync(path.join(tmpdir(), "samwise-work-observer-"))

test("work observer has no mutation or publication authority", () => {
  assert.deepEqual(validateWorkObserverCapability(capability), { valid: true, capability_id: "samwise_work_observer", observers: 4 })
  assert.equal(capability.retention_defaults.screenshots_enabled, false)
  assert.match(capability.prohibited.join(" "), /keylogging/)
  assert.deepEqual(privateSupabasePersistencePlan().automatic_uploads, false)
})

test("active sessions require explicit scopes, redact records, and deduplicate", () => {
  const store = createWorkObserverStore(temporaryRoot(), { now: () => new Date("2026-09-08T12:00:00.000Z") })
  const session = store.start({ project: "miller-app", scopes: ["samwise_jobs", "git"], duration_minutes: 90, project_directories: ["ios/MillerNavigator"] })
  assert.deepEqual(store.status().current_scopes, ["samwise_jobs", "git"])
  assert.equal(store.status().supabase_records_written, 0)
  assert.equal(store.status().screenshots_retained, 0)
  const input = { session_id: session.session_id, project: "miller-app", source: "samwise_jobs", application: "Samwise/Codex", event_type: "job_started", summary: "Observer implementation started", sanitized_details: "Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz service=postgresql://user:password@host/db email=test@example.com", related_files: ["/private/secret/Info.plist"] }
  const stored = store.record(input)
  assert.equal(stored.duplicate, false)
  assert.match(stored.event.sanitized_details, /\[REDACTED\]/)
  assert.doesNotMatch(stored.event.sanitized_details, /password|test@example.com/)
  assert.deepEqual(stored.event.related_files, ["Info.plist"])
  assert.equal(store.record(input).duplicate, true)
  assert.throws(() => store.record({ ...input, source: "xcode" }), /scope_not_active/)
  assert.equal(store.summary(session.session_id).events, 1)
  store.stop(session.session_id)
  assert.equal(store.status().active_sessions.length, 0)
  assert.match(readFileSync(store.paths.eventPath, "utf8"), /samwise-work-event-v1/)
})

test("adapters preserve bounded, source-free operational observations", () => {
  const xcodeEvents = nativeAppAttemptsToWorkEvents(nativeMemory, { session_id: "sws_native", project: "miller-app" })
  assert.equal(xcodeEvents.length, 7)
  assert.equal(xcodeEvents[0].source, "xcode")
  assert.equal(xcodeEvents[0].event_type, "build_failed")
  const gitEvent = gitStateToWorkEvent({ session_id: "sws_git", project: "miller-app", branch: "main", before: { clean: true }, after: { clean: false }, related_files: ["/repo/server/samwiseWorkObserver.js"] })
  assert.equal(gitEvent.source, "git")
  assert.deepEqual(gitEvent.related_files, ["samwiseWorkObserver.js"])
  const job = samwiseJobToWorkEvent({ session_id: "sws_job", project: "miller-app", job: { capability_id: "samwise_work_observer", status: "passed", summary: "Phase 1 tests passed", changed_files: ["server/samwiseWorkObserver.js"] } })
  assert.equal(job.event_type, "job_finished")
  assert.equal(job.resolution_status, "resolved")
  assert.equal(redactWorkObserverText("API_TOKEN=abc123 and jane@example.com"), "[REDACTED_SECRET] and [REDACTED_EMAIL]")
})

test("failure patterns are advisory only", () => {
  const store = createWorkObserverStore(temporaryRoot())
  const session = store.start({ project: "miller-app", scopes: ["xcode"] })
  for (const timestamp of ["2026-09-08T12:00:00.000Z", "2026-09-08T12:01:00.000Z"]) store.record({ session_id: session.session_id, project: "miller-app", source: "xcode", event_type: "build_failed", summary: "Missing bundle identifier 123", timestamp, severity: "error", status: "failed", resolution_status: "open" })
  const patterns = store.patterns()
  assert.equal(patterns.length, 1)
  assert.match(patterns[0].advisory, /do not mutate automatically/)
})
