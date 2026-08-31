import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { rankCorrectionReadiness, scoreCorrectionReadiness } from "../server/correctionReadiness.js"

const fixture = JSON.parse(readFileSync(new URL("./fixtures/correction-readiness-v1.json", import.meta.url), "utf8"))
const options = { now: Date.parse(fixture.now) }

test("synthetic correction candidates receive strict deterministic readiness classes", () => {
  const results = new Map(rankCorrectionReadiness(fixture.candidates, options).map((item) => [item.id, item]))
  assert.equal(results.get("strong-website").readiness_class, "ready_for_trusted_writer_preview")
  assert.equal(results.get("stale-website").readiness_class, "likely_ready_after_revalidation")
  assert.equal(results.get("conflicting-website").readiness_class, "conflict")
  assert.equal(results.get("wrong-domain-website").readiness_class, "needs_more_evidence")
  assert.equal(results.get("ambiguous-identity").readiness_class, "human_review")
  assert.equal(results.get("valid-phone").readiness_class, "likely_ready_after_revalidation")
  assert.equal(results.get("valid-location").readiness_class, "likely_ready_after_revalidation")
  assert.equal(results.get("ai-only").readiness_class, "human_review")
  assert.equal(results.get("strong-website").writer_compatible, true)
  assert.equal(results.get("valid-phone").writer_compatible, false)
})

test("ranking is stable and ties break by candidate ID", () => {
  const one = rankCorrectionReadiness(fixture.candidates, options).map((item) => item.id)
  const two = rankCorrectionReadiness([...fixture.candidates].reverse(), options).map((item) => item.id)
  assert.deepEqual(one, two)
  const tied = [{ ...fixture.candidates[5], id: "z" }, { ...fixture.candidates[5], id: "a" }]
  assert.deepEqual(rankCorrectionReadiness(tied, options).map((item) => item.id), ["a", "z"])
})

test("terminal penalties control readiness even when base score remains positive", () => {
  const conflict = scoreCorrectionReadiness(fixture.candidates.find((item) => item.id === "conflicting-website"), options)
  const aiOnly = scoreCorrectionReadiness(fixture.candidates.find((item) => item.id === "ai-only"), options)
  assert.ok(conflict.penalties.includes("conflicting_sources"))
  assert.ok(aiOnly.penalties.includes("ai_only_support"))
  assert.equal(conflict.readiness_class, "conflict")
  assert.equal(aiOnly.readiness_class, "human_review")
})
