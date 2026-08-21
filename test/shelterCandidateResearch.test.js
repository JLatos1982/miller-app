import test from "node:test"
import assert from "node:assert/strict"
import { shelterResearchFingerprint } from "../server/shelterCandidateResearch.js"

test("candidate research fingerprints are deterministic and distinguish changed evidence", () => {
  const first = shelterResearchFingerprint(17, "needs_research", { name: "Example" }, "v1")
  assert.equal(first, shelterResearchFingerprint(17, "needs_research", { name: "Example" }, "v1"))
  assert.notEqual(first, shelterResearchFingerprint(17, "ready_to_approve", { name: "Example" }, "v1"))
  assert.match(first, /^[0-9a-f]{64}$/)
})
