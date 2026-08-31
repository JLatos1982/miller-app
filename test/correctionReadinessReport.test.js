import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { buildCorrectionReadinessOwnerReport, formatCorrectionReadinessOwnerReport } from "../server/correctionReadinessReport.js"

const fixture = JSON.parse(readFileSync(new URL("./fixtures/correction-readiness-v1.json", import.meta.url), "utf8"))
const options = { now: Date.parse(fixture.now) }

test("owner backlog is compact, grouped, and stable from synthetic readiness results", () => {
  const report = buildCorrectionReadinessOwnerReport(fixture.candidates, options)
  assert.deepEqual(report.summary, { total_candidates: 8, ready_now: 1, revalidate: 3, needs_evidence: 1, conflict: 1, human_review: 2 })
  assert.deepEqual(report.top_candidates.map((row) => row.candidate_id), ["strong-website", "valid-location", "valid-phone", "stale-website", "ai-only", "wrong-domain-website", "ambiguous-identity", "conflicting-website"])
  assert.equal(report.groups.ready_for_trusted_writer_preview[0].candidate_id, "strong-website")
  assert.equal(report.groups.conflict[0].remaining_blocker, "current authoritative sources conflict")
  assert.equal(report.groups.human_review[0].recommended_next_action, "Request human identity/privacy review.")
  assert.equal(report.top_candidates[0].current_value, "https://old-strong.example")
})

test("owner backlog formatting contains only the bounded top ten and preserves grouped actions", () => {
  const report = buildCorrectionReadinessOwnerReport(fixture.candidates, options)
  const output = formatCorrectionReadinessOwnerReport(report)
  assert.match(output, /Synthetic\/local report — 8 candidates: 1 ready now, 3 revalidate, 1 need evidence, 1 conflict, 2 human review\./)
  assert.match(output, /## Ready for trusted-writer preview \(1\)/)
  assert.match(output, /Synthetic Strong Website Centre/)
  assert.match(output, /Next: Run trusted-writer preview\./)
  assert.match(output, /## Conflict \(1\)/)
})
