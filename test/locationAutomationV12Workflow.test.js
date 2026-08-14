import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("Phase 1O runner is bounded, refuses apply, and records zero provider work while blocked", () => {
  const source = fs.readFileSync(new URL("../scripts/location-automation-1o.mjs", import.meta.url), "utf8")
  assert.match(source, /CANDIDATE_MAX = 100, REQUEST_MAX = 100/); assert.match(source, /Phase 1O apply is prohibited/); assert.match(source, /bc_requests: 0/); assert.match(source, /productive_batch_started: false/)
})
test("automation dry run remains protected and exposes requested queue labels", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), ui = fs.readFileSync(new URL("../src/map/LocationAutomationReview.jsx", import.meta.url), "utf8")
  assert.match(server, /app\.get\("\/api\/admin\/location-automation\/dry-run", requireAdmin/)
  for (const label of ["Automatically mapped", "Quality check", "Needs my decision", "Could not map", "Public", "History"]) assert.match(ui, new RegExp(label))
  assert.match(ui, /No coordinate; not public/)
})
