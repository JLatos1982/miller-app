import assert from "node:assert/strict"
import test from "node:test"

import evidence from "../src/data/indigenous-healthcare-evidence-groups-public-v1.json" with { type: "json" }
import incidents from "../src/data/miller-north-serious-harm-public-v1.json" with { type: "json" }
import { evidenceDisplayTitle, incidentDisplayTitle, incidentMetadata, isGenericEvidenceTitle } from "../src/site/millerNorthDisplayTitles.js"

test("evidence headings describe the source subject rather than repeating a generic evidence role", () => {
  for (const record of evidence.groups) {
    const title = evidenceDisplayTitle(record)
    assert.ok(title.length > 8)
    assert.equal(isGenericEvidenceTitle(title), false, record.public_record_id)
  }
  const base = { summary: "A public source reports concerns about emergency-department treatment.", evidence_status: "reported_account" }
  assert.match(evidenceDisplayTitle({ ...base, source: { title: "NEWS RELEASE" } }), /Public account described/i)
  assert.match(evidenceDisplayTitle({ ...base, source: { title: "Leadership outraged by racist behavior" } }), /Public account described/i)
})

test("incident headings lead with the event or formal issue and keep identity in metadata", () => {
  const solonas = incidents.incidents.find(record => record.public_incident_id === "mnsh_nadine_solonas_2017")
  const anonymous = incidents.incidents.find(record => record.public_incident_id === "mnsh_cpsbc_rural_discharge_2024")
  assert.match(incidentDisplayTitle(solonas), /^Inquest examined/)
  assert.doesNotMatch(incidentDisplayTitle(solonas), /Nadine/)
  assert.match(incidentMetadata(solonas), /Nadine Marcy Solonas · British Columbia · Inquest · 2017/)
  assert.match(incidentDisplayTitle(anonymous), /^Rural emergency discharge reviewed/)
  assert.match(incidentMetadata(anonymous), /^Anonymous affected person · British Columbia · Regulator review/)
})

test("all public incident headings avoid anonymous pseudo-names", () => {
  for (const record of incidents.incidents) {
    assert.doesNotMatch(incidentDisplayTitle(record), /^Anonymous (?:Indigenous|Métis)/)
  }
})
