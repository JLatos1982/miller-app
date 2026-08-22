import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const source = fs.readFileSync(new URL("../src/admin/ResearchPlanner.jsx", import.meta.url), "utf8")
test("Research Planner is mounted in the protected admin dashboard and uses the diagnostic endpoint", () => {
  const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  assert.match(app, /import ResearchPlanner/)
  assert.match(app, /<ResearchPlanner\/>/)
  assert.match(source, /adminFetch\("\/api\/admin\/evidence-gap-plan\?limit=20"\)/)
  assert.match(source, /Research Planner/)
})
test("planner presents summary, task states, programme guidance, trace, empty and error states", () => {
  for (const text of ["Actionable investigation", "Human review required", "No investigation required", "Evidence trace", "No evidence gaps requiring investigation", "Research Planner is unavailable", "recommended_next_investigation"]) assert.match(source, new RegExp(text))
  assert.match(source, /task\.claim_id/)
  assert.match(source, /task\.evidence_ids/)
  assert.match(source, /aria-pressed/)
})
test("planner has no execution or mutation control", () => {
  assert.doesNotMatch(source, /method:\s*["'](?:POST|PATCH|PUT|DELETE)/)
  assert.doesNotMatch(source, /\/publish|\/geocode|\/resolve|\/retry|\/approve/)
  assert.doesNotMatch(source, /fetch\(/)
})
