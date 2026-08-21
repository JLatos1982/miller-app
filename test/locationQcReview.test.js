import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readLocationQcStore, reconcileLocationQcReview, saveLocationQcDecision } from "../server/locationQcReview.js"

const item = { canonical_uuid: "22c9ff25-1305-5403-a127-53e3cbed6f10", resource_name: "A Better Life Foundation", policy_version: "miller-location-auto-v1.2.1", public_map: false }
const report = { policy_version: "miller-location-auto-v1.2.1", classification_fingerprint: "fixture", quality_control_sample: [item], shared_address_groups: [] }
const actor = { id: "00000000-0000-0000-0000-000000000001" }

test("QC decisions persist, reconcile after refresh, and never publish", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "miller-qc-")), file = path.join(directory, "decisions.json")
  try {
    const saved = saveLocationQcDecision({ report, storeFile: file, canonicalUuid: item.canonical_uuid, decision: "pilot_eligible", expectedVersion: 0, actor, now: () => "2026-08-16T00:00:00.000Z" })
    assert.equal(saved.ok, true); assert.equal(saved.location_created, false); assert.equal(saved.publication_created, false); assert.equal(saved.public_map_changed, false)
    const refreshed = reconcileLocationQcReview(report, readLocationQcStore(file)); assert.equal(refreshed.active.length, 0); assert.equal(refreshed.completed.length, 1); assert.equal(refreshed.eligible_for_later_pilot.length, 1)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
test("optimistic concurrency rejects stale decisions and revision appends audit", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "miller-qc-")), file = path.join(directory, "decisions.json")
  try {
    assert.equal(saveLocationQcDecision({ report, storeFile: file, canonicalUuid: item.canonical_uuid, decision: "defer", expectedVersion: 0, actor }).ok, true)
    assert.equal(saveLocationQcDecision({ report, storeFile: file, canonicalUuid: item.canonical_uuid, decision: "manual_review", expectedVersion: 0, actor }).status, 409)
    assert.equal(saveLocationQcDecision({ report, storeFile: file, canonicalUuid: item.canonical_uuid, decision: "manual_review", expectedVersion: 1, actor }).ok, true)
    const store = readLocationQcStore(file); assert.equal(store.decisions[item.canonical_uuid].version, 2); assert.equal(store.audit.length, 2); assert.equal(store.audit[0].new_decision, "defer"); assert.equal(store.audit[1].new_decision, "manual_review")
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
test("unknown records and decisions fail closed", () => {
  const file = path.join(os.tmpdir(), `miller-qc-${process.pid}-missing.json`)
  assert.equal(saveLocationQcDecision({ report, storeFile: file, canonicalUuid: "00000000-0000-0000-0000-000000000099", decision: "defer", expectedVersion: 0, actor }).status, 404)
  assert.equal(saveLocationQcDecision({ report, storeFile: file, canonicalUuid: item.canonical_uuid, decision: "publish", expectedVersion: 0, actor }).status, 400)
})
test("server routes are protected and contain no publication or geocoder call", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), section = server.slice(server.indexOf('app.get("/api/admin/location-qc-review"'), server.indexOf('app.post("/api/admin/location-automation/pause"'))
  assert.match(section, /requireAdmin/); assert.match(section, /resource_registry/); assert.match(section, /expected_version/); assert.doesNotMatch(section, /resource_locations|requestBcAddressGeocode|public_map:\s*true/)
})
test("forward migration separates decisions, enforces versions, audit, RLS, and service-only execution", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/202608160001_create_location_qc_reviews.sql", import.meta.url), "utf8")
  for (const expected of ["location_qc_reviews", "location_qc_review_audit", "enable row level security", "review version conflict", "append-only", "grant execute", "service_role", "pg_advisory_xact_lock"]) assert.match(sql, new RegExp(expected, "i"))
  assert.doesNotMatch(sql, /insert into public\.resource_locations|update public\.resource_locations/)
})
