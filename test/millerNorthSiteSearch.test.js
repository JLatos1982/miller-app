import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { buildMillerNorthPublicSearchIndex, expandMillerNorthQuery, retrieveMillerNorthResults, searchIndigenousHealthcareEvidence } from "../server/indigenousHealthcareEvidenceSearch.js"

test("Miller North search index covers public evidence, incidents, Listening, accountability and research", () => {
  const index = buildMillerNorthPublicSearchIndex(), types = new Set(index.map(item => item.result_type))
  assert.deepEqual([...types].sort(), ["accountability", "evidence", "incident", "listening", "research_report"])
  assert.ok(index.length > 350)
  assert.ok(index.every(item => item.destination_route.startsWith("/indigenous-healthcare-evidence")))
  assert.doesNotMatch(JSON.stringify(index), /owner_review|private_note|patient_name|ordinary_username/i)
})

test("site search handles phrases, aliases, geography, settings and typo tolerance with stable ranking", () => {
  const securityResults = retrieveMillerNorthResults("hospital security Saskatchewan")
  assert.match(securityResults[0].title, /hospital|security/i)
  assert.ok(securityResults.some(item => /Hospital security response/i.test(item.title)))
  assert.equal(retrieveMillerNorthResults("In Plain Sight")[0].title, "In Plain Sight")
  assert.match(retrieveMillerNorthResults("Indigenous Patient Safety Advocate")[0].title, /Indigenous Patient Safety Investigator and Advocate/i)
  assert.ok(retrieveMillerNorthResults("emergncy department Alberta").some(item => /emergency|ER/i.test(`${item.title} ${item.description}`)))
  assert.ok(expandMillerNorthQuery("BC First Nations ER").includes("british"))
  assert.deepEqual(retrieveMillerNorthResults("In Plain Sight").map(item => item.result_id), retrieveMillerNorthResults("In Plain Sight").map(item => item.result_id))
  assert.ok(retrieveMillerNorthResults("Nadine Solonas paramedic inquest").some(item => item.underlying_record_id === "mnsh_nadine_solonas_2017"))
  assert.ok(retrieveMillerNorthResults("Indigenous emergency resuscitation regulator").some(item => item.underlying_record_id === "mnsh_bccnm_emergency_assessment_2021"))
  assert.ok(retrieveMillerNorthResults("Kamloops prisoner health Indigenous liaison").some(item => item.underlying_record_id === "mnsh_randy_lampreau_2019"))
  assert.ok(retrieveMillerNorthResults("remote paramedic water taxi Opitsaht").some(item => item.underlying_record_id === "mnsh_julian_jones_2021"))
  assert.ok(retrieveMillerNorthResults("Maskwacis youth recommendations").some(item => item.underlying_record_id === "mnaw_maskwacis_youth_inquiry"))
})

test("filters and duplicate suppression preserve one normalized result identity", () => {
  const onlyReports = retrieveMillerNorthResults("Indigenous health", { resultTypes: ["research_report"], provinces: ["alberta"] })
  assert.ok(onlyReports.length)
  assert.ok(onlyReports.every(item => item.result_type === "research_report" && item.province === "alberta"))
  const results = retrieveMillerNorthResults("In Plain Sight", { limit: 50 })
  assert.equal(new Set(results.map(item => `${item.result_type}:${item.underlying_record_id}`)).size, results.length)
})

test("optional query expansion failure degrades to deterministic results", async () => {
  const result = await searchIndigenousHealthcareEvidence({ query: "In Plain Sight", openai: null, apiKeyPresent: false, queryExpansionProvider: async () => { throw new Error("local model unavailable") } })
  assert.equal(result.summary_available, false)
  assert.ok(result.results.some(item => item.title === "In Plain Sight"))
})

test("Evidence Library page presents a polished site-wide search with lightweight filters", () => {
  const page = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  assert.match(page, /Search Miller North/)
  assert.match(page, /Search incidents, evidence, organizations, reports, and accountability/)
  assert.match(page, /Result type/)
  assert.match(page, /Canada-wide/)
  assert.match(page, /ihe-site-results/)
})
