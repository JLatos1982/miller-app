import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import comparison from "../src/data/miller-north-accountability-comparison-public-v1.json" with { type: "json" }
import recent from "../src/data/miller-north-recently-changed-public-v1.json" with { type: "json" }
import northSupports from "../src/data/miller-north-first-nations-supports-public-v1.json" with { type: "json" }
import { toMillerNorthSupportEmailResult } from "../src/millerNorthPublicSupportEmail.js"
import { isEmailResultEligible } from "../src/emailResultsApi.js"
import { practicalHelpForCase, MILLER_NORTH_CASE_SUPPORT_CONNECTIONS } from "../src/site/millerNorthPracticalConnections.js"

const read = path => readFileSync(new URL(path, import.meta.url), "utf8")

test("Accountability Snapshot uses the validated public comparison and preserves uncertainty language", () => {
  const app = read("../src/App.jsx")
  const page = read("../src/site/MillerNorthAccountabilitySnapshot.jsx")
  assert.match(app, /indigenous-healthcare-evidence\/accountability-snapshot/)
  assert.match(page, /What we still don’t know/)
  assert.match(page, /Missing public reporting identifies an evidence gap/)
  assert.match(page, /MillerNorthHomeLink/)
  assert.equal(comparison.mechanisms.length, 3)
  assert.equal(comparison.mechanisms.every(item => item.fields.length === 12 && item.fields.every(field => field.source_ids.length)), true)
  assert.match(comparison.mechanisms.find(item => item.province === "Alberta").fields.find(field => field.field === "aggregate_outcome_reporting").value, /321 correspondence items/)
  assert.doesNotMatch(page, /best province|worst province|grade/i)
})

test("North home recent changes come only from the reviewed public material-change projection", () => {
  const home = read("../src/site/IndigenousHealthcareEvidence.jsx")
  const recentView = read("../src/site/MillerNorthRecentlyChanged.jsx")
  assert.match(home, /MillerNorthRecentlyChanged/)
  assert.match(recentView, /miller-north-recently-changed-public-v1\.json/)
  assert.match(recentView, /What changed/)
  assert.match(recentView, /routine checks, formatting or site updates/)
  assert.doesNotMatch(recentView, /owner_review|private_note|candidate_id|internal_id/)
  assert.equal(recent.items.length, 4)
})

test("related practical help uses explicit reviewed record links without random matching", () => {
  const publicIds = new Set(northSupports.records.map(item => item.public_support_id))
  assert.deepEqual(Object.keys(MILLER_NORTH_CASE_SUPPORT_CONNECTIONS).sort(), ["alberta-indigenous-patient-safety", "alberta-indigenous-primary-care", "first-nations-health-ombudsperson", "in-plain-sight", "saskatoon-coerced-sterilization"])
  for (const [slug, connections] of Object.entries(MILLER_NORTH_CASE_SUPPORT_CONNECTIONS)) {
    assert.ok(connections.length >= 2 && connections.length <= 4)
    assert.equal(practicalHelpForCase(slug).length, connections.length)
    assert.equal(practicalHelpForCase(slug).every(item => /^https:\/\//.test(item.website)), true)
    for (const [collection, id] of connections) if (collection === "north") assert.ok(publicIds.has(id))
  }
})

test("First Nations Supports can reuse Email Results without widening its public payload", () => {
  const page = read("../src/site/MillerNorthFirstNationsSupports.jsx")
  const server = read("../server.js")
  const emailRecords = northSupports.records.map(toMillerNorthSupportEmailResult)
  assert.equal(emailRecords.length, northSupports.records.length)
  assert.equal(emailRecords.every(isEmailResultEligible), true)
  assert.equal(emailRecords.every(item => !Object.keys(item).some(key => /owner|private|candidate|patient/i.test(key))), true)
  assert.match(page, /Email these results/)
  assert.match(page, /EmailResultsDialog/)
  assert.match(server, /publicMillerNorthSupports\.records\.map\(toMillerNorthSupportEmailResult\)/)
})
