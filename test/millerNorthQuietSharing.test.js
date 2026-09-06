import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import fnho from "../src/data/miller-north-fnho-public-v1.json" with { type: "json" }
import supports from "../src/data/miller-north-first-nations-supports-public-v1.json" with { type: "json" }
import { validateMillerNorthFirstNationsSupportsPublic } from "../server/millerNorthFirstNationsSupportsPublic.js"

const sourceBacked = item => Array.isArray(item.sources) && item.sources.every(source => /^https:\/\//.test(source.url))

test("FNHO quiet-share dossier is aggregate, source-backed and governance-safe", () => {
  assert.equal(fnho.slug, "first-nations-health-ombudsperson")
  assert.equal(fnho.recommendations.length, 4)
  assert.deepEqual(fnho.metrics.slice(0, 4).map(item => item.value), ["391", "224", "167", "64%"])
  assert.equal(224 + 167, 391)
  assert.ok(fnho.timeline.every(sourceBacked))
  assert.ok(fnho.evidence_path.every(sourceBacked))
  assert.match(fnho.one_thing_to_remember, /funding does not imply federal operational control/i)
  assert.match(fnho.what_remains_unclear[0].text, /was not located/i)
  assert.doesNotMatch(JSON.stringify(fnho), /owner_review|patient_name|complainant_name|private_notes|operational control by/i)
})

test("First Nations Supports projection publishes a bounded reviewed subset", () => {
  assert.deepEqual(validateMillerNorthFirstNationsSupportsPublic(supports), {
    valid: true,
    records: 19,
    by_province: { "British Columbia": 12, Alberta: 3, Saskatchewan: 4 },
    fraser_north: 9,
  })
  assert.ok(supports.records.some(record => record.organization === "Katzie First Nation" && record.governance_type === "first_nations_governed_nation_health_program"))
  assert.ok(supports.records.some(record => record.organization === "kʷikʷəƛ̓əm First Nation" && record.fraser_north))
  assert.ok(!supports.records.some(record => ["fns_ab_aivcc", "fns_sk_wellness_wheel"].includes(record.public_support_id)))
})

test("quiet-sharing removes main entry affordances and applies noindex to Miller North navigation", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const evidence = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  assert.doesNotMatch(app, /name: "North"/)
  assert.doesNotMatch(evidence, /ihe-feather|FirstNationsHealthcareEvidenceFeather/)
  assert.match(app, /indigenous-healthcare-evidence\/first-nations-supports/)
  assert.match(nav, /noindex, nofollow/)
  assert.match(nav, /data-miller-north-quiet-sharing/)
})

test("supports page is responsive, source-followable and does not expose review internals", () => {
  const page = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.jsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.css", import.meta.url), "utf8")
  assert.match(page, /aria-label="First Nations Supports filters"/)
  assert.match(page, /Service details and source/)
  assert.match(page, /Funding, governance and service delivery are different/)
  assert.match(css, /@media\(max-width:700px\)/)
  assert.doesNotMatch(page, /owner_review|confidence|private_notes/)
})
