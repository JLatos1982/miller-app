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

test("Miller North is a main theme while quiet-sharing pages remain noindex", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const evidence = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  assert.match(app, /name: "North"/)
  assert.doesNotMatch(evidence, /ihe-feather|FirstNationsHealthcareEvidenceFeather/)
  assert.match(app, /indigenous-healthcare-evidence\/first-nations-supports/)
  assert.match(nav, /noindex, nofollow/)
  assert.match(nav, /data-miller-north-quiet-sharing/)
})

test("North headers use the existing North landing route rather than the Miller resource finder", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/MillerNorthPublicNav.jsx", import.meta.url), "utf8")
  const northHeaders = [
    "IndigenousHealthcareEvidence.jsx",
    "MillerNorthFirstNationsSupports.jsx",
    "MillerNorthLiveListening.jsx",
    "MillerNorthMethodology.jsx",
    "MillerNorthEmergingCases.jsx",
    "MillerNorthResearchPolicy.jsx",
    "MillerFundingAssistance.jsx",
  ].map(file => readFileSync(new URL(`../src/site/${file}`, import.meta.url), "utf8"))

  assert.match(app, /window\.location\.pathname === "\/indigenous-healthcare-evidence"/)
  assert.match(nav, /MILLER_NORTH_HOME_HREF = "\/indigenous-healthcare-evidence"/)
  assert.match(nav, /Miller North Home/)
  for (const header of northHeaders) assert.match(header, /MillerNorthHomeLink/)
  assert.equal(northHeaders.some(header => /Miller resource finder/.test(header)), false)
})

test("North landing keeps the active evidence-question search and removes the legacy inline filter", () => {
  const page = readFileSync(new URL("../src/site/IndigenousHealthcareEvidence.jsx", import.meta.url), "utf8")
  assert.match(page, /Search Miller North/)
  assert.match(page, /\/api\/indigenous-healthcare-evidence\/search/)
  assert.doesNotMatch(page, /ihe-library-search|ihe-library-query|libraryQuery/)
  assert.doesNotMatch(page, /IndigenousHealthcareEvidenceLibrarySearch\.css/)
})

test("unified Supports & Funding page is responsive, source-followable and does not expose review internals", () => {
  const page = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.jsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../src/site/MillerNorthFirstNationsSupports.css", import.meta.url), "utf8")
  assert.match(page, /aria-label="Supports and Funding filters"/)
  assert.match(page, /Official service or program page/)
  assert.match(page, /miller-shared-resource-registry-v1\.json/)
  assert.doesNotMatch(page, /shared publication-safe resource registry|One resource foundation/)
  assert.match(css, /@media\(max-width:700px\)/)
  assert.doesNotMatch(page, /owner_review|confidence|private_notes/)
})
