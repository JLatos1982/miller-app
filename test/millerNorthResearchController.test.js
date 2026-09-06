import test from "node:test"
import assert from "node:assert/strict"
import { buildMillerNorthAutonomousWork, selectMillerNorthAutonomousWork, strategyScore } from "../server/millerNorthResearchController.js"

test("controller prefers named/source-family work and rejects generic routing", () => {
  const work = buildMillerNorthAutonomousWork({ manifest: {}, knownQueries: new Set(), socialLeads: [] })
  assert.ok(work.length >= 10)
  assert.ok(work[0].expected_value > work.find((item) => item.strategy === "facility_first_recent").expected_value)
  assert.equal(strategyScore("named_case_followup") > strategyScore("facility_first_recent"), true)
  assert.equal(selectMillerNorthAutonomousWork({ candidates: work, budget: 3 }).length, 3)
})

test("controller needs person plus facility before spending on a social lead", () => {
  const withoutPerson = buildMillerNorthAutonomousWork({ manifest: {}, socialLeads: [{ lead_status: "high_value_social_lead", verification_state: "targeted_verification_needed", province: "saskatchewan", facility: "Example Hospital", public_excerpt: "A hospital allegation." }] })
  assert.equal(withoutPerson.some((item) => item.social_lead_id), false)
})

test("Pilot 3 uses a fresh recent source-family input set", () => {
  const work = buildMillerNorthAutonomousWork({ manifest: {}, knownQueries: new Set(), socialLeads: [], generation: "pilot3_recent_named" })
  assert.ok(work.length >= 10)
  assert.equal(work.every(item => /2025|2026/.test(item.query)), true)
  assert.equal(work.some(item => item.source_family === "FSIN"), true)
})
