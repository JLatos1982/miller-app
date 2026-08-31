import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildCorrectionReadinessChangeDigest, formatCorrectionReadinessChangeDigest } from "../server/correctionReadinessDigest.js"

const fixture = JSON.parse(readFileSync(new URL("./fixtures/correction-readiness-digest-v1.json", import.meta.url), "utf8"))
const options = { now: Date.parse(fixture.now) }

test("digest detects newly ready, new conflict, resolved conflict, and proposed value changes", () => {
  const digest = buildCorrectionReadinessChangeDigest(fixture.previous, fixture.current, options)
  assert.equal(digest.important_changes_count, 4)
  assert.equal(digest.quiet, false)
  const byResource = new Map(digest.changes.map((change) => [change.resource_id, change]))
  assert.deepEqual(byResource.get("digest-new-ready").reasons, ["newly_ready", "readiness_class_changed", "material_score_changed"])
  assert.ok(byResource.get("digest-new-conflict").reasons.includes("new_conflict"))
  assert.ok(byResource.get("digest-resolved").reasons.includes("conflict_resolved"))
  assert.deepEqual(byResource.get("digest-value").reasons, ["proposed_value_changed"])
  assert.equal(byResource.has("digest-unchanged"), false)
})

test("digest emits a stable compact owner format and a quiet result for unchanged runs", () => {
  const digest = buildCorrectionReadinessChangeDigest(fixture.previous, fixture.current, options)
  const output = formatCorrectionReadinessChangeDigest(digest)
  assert.match(output, /4 important changes\./)
  assert.match(output, /Synthetic Newly Ready/)
  assert.match(output, /Run trusted-writer preview\./)
  const quiet = buildCorrectionReadinessChangeDigest(fixture.current, fixture.current, options)
  assert.equal(quiet.quiet, true)
  assert.equal(formatCorrectionReadinessChangeDigest(quiet), "# Miller Farm correction readiness digest\n\nNo meaningful candidate readiness changes.\n")
})

test("digest detects candidate appearance and disappearance by stable resource plus field identity", () => {
  const candidate = fixture.current.find((item) => item.resource_id === "digest-value")
  const appeared = buildCorrectionReadinessChangeDigest([], [candidate], options)
  const disappeared = buildCorrectionReadinessChangeDigest([candidate], [], options)
  assert.deepEqual(appeared.changes[0].reasons, ["candidate_appeared"])
  assert.deepEqual(disappeared.changes[0].reasons, ["candidate_disappeared"])
  assert.equal(appeared.changes[0].identity, "digest-value\u001fwebsite")
})
