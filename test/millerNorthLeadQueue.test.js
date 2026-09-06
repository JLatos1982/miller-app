import assert from "node:assert/strict"
import test from "node:test"
import { millerNorthLeadId, rankMillerNorthIncidentLead, routeMillerNorthIncidentLead } from "../server/millerNorthLeadQueue.js"

test("lead queue gives specific Saskatchewan and Treaty 6 incident signals priority", () => {
  const generic = rankMillerNorthIncidentLead({ title: "Racism in health care", excerpt: "systemic report", province: "british_columbia" })
  const specific = rankMillerNorthIncidentLead({ title: "Family files hospital complaint", excerpt: "Elder died in 2024 after emergency department treatment", province: "saskatchewan", regionalContext: "Treaty 6 research geography" })
  assert.ok(specific > generic)
  assert.equal(millerNorthLeadId("https://example.test/a"), millerNorthLeadId("https://example.test/a"))
})

test("lead routing down-ranks known cases without treating names as duplicate proof", () => {
  const known = routeMillerNorthIncidentLead({ title: "Family reports hospital complaint", excerpt: "Specific patient event", province: "saskatchewan", knownCaseMatch: true })
  const novel = routeMillerNorthIncidentLead({ title: "Family reports hospital complaint", excerpt: "Specific patient event in 2025", province: "saskatchewan" })
  const systemic = routeMillerNorthIncidentLead({ title: "Study of systemic racism", excerpt: "Prevalence research", province: "alberta" })
  assert.equal(known.route, "likely_existing_incident_support")
  assert.equal(novel.route, "likely_new_incident")
  assert.equal(novel.recent, true)
  assert.equal(systemic.route, "systemic_or_context")
})
