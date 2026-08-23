import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { answerControlRoomQuestion, buildControlRoomSummary } from "../server/controlRoomSummary.js"

test("quiet state is clear while unknown deployment is not treated as healthy", () => {
  const quiet = buildControlRoomSummary({ deployment: { alignment_state: "aligned", build_identity: "abc" } })
  assert.equal(quiet.posture, "healthy")
  assert.match(quiet.bubble, /normal/i)
  const unknown = buildControlRoomSummary({ deployment: { alignment_state: "build_unknown" } })
  assert.notEqual(unknown.posture, "healthy")
  assert.ok(unknown.important.some((item) => item.domain === "deployment"))
})

test("important alerts, human queues, and plain-language answers come from bounded state", () => {
  const summary = buildControlRoomSummary({ securityFindings: [{ finding_fingerprint: "f", finding_type: "protected route regression", severity: "high", lifecycle: "new" }], resourceReviewCount: 3, shelterReviewCount: 1, locationReviewCount: 2, deployment: { alignment_state: "schema_behind_build" } })
  assert.equal(summary.posture, "degraded")
  assert.equal(summary.needs_you.length, 3)
  assert.match(answerControlRoomQuestion({ question: "What is wrong?", summary }).text, /security|build|database/i)
  assert.match(answerControlRoomQuestion({ question: "Explain this", summary, selectedContext: { type: "deployment" } }).text, /Render|database/i)
})

test("Control Room keeps summary, explanation, and action authority separate", () => {
  const source = fs.readFileSync(new URL("../src/admin/ControlRoom.jsx", import.meta.url), "utf8")
  assert.match(source, /Miller needs you/)
  assert.match(source, /Miller handled this/)
  assert.match(source, /What changed\?/)
  assert.match(source, /Ask Miller/)
  assert.match(source, /security-pulse\/run/)
  assert.doesNotMatch(source, /arbitrary SQL|fix everything|child_process/)
})
