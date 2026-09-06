import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import practicalPublic from "../src/data/miller-practical-supports-public-v1.json" with { type: "json" }
import millerFunding from "../src/data/miller-funding-assistance-public-v1.json" with { type: "json" }
import millerNorthFunding from "../src/data/miller-north-funding-assistance-public-v1.json" with { type: "json" }
import { buildEmailResultIndex, buildResultsEmail, createEmailSender, normalizeEmailResult, resolveEmailResults } from "../server/millerEmailResults.js"
import { curatedMapResources } from "../server/mapResources.js"
import { fundingFreshnessSummary, materialFundingChanges, nextFundingCheckDue, validatePublicFundingProjection } from "../server/millerFundingListener.js"

const forbidden = /owner_review|private_notes|patient_name|client_name|username|medical_record/i

test("practical supports projection publishes 17 reviewed records without private state or duplicate identities", () => {
  assert.equal(practicalPublic.schema_version, "miller-practical-supports-public-v1")
  assert.equal(practicalPublic.records.length, 17)
  assert.equal(new Set(practicalPublic.records.map(record => record.id)).size, 17)
  assert.equal(practicalPublic.records.every(record => /^https:\/\//.test(record.website) && record.last_verified_at === "2026-09-06"), true)
  assert.doesNotMatch(JSON.stringify(practicalPublic), forbidden)
  assert.equal(practicalPublic.records.filter(record => record.id.startsWith("curated:")).length, 4)
  assert.equal(practicalPublic.records.filter(record => record.id.startsWith("support:")).length, 13)
})

test("public funding projections expose only validated fields and the high-confidence First Nations subset", () => {
  assert.deepEqual(validatePublicFundingProjection(millerFunding), { records: 7, audience: "miller" })
  assert.deepEqual(validatePublicFundingProjection(millerNorthFunding), { records: 22, audience: "miller-north" })
  assert.doesNotMatch(JSON.stringify(millerFunding), forbidden)
  assert.doesNotMatch(JSON.stringify(millerNorthFunding), forbidden)
})

test("funding listener cadence is bounded and material interpretation changes stay review-gated", () => {
  assert.equal(nextFundingCheckDue("open", "2026-09-06"), "2026-09-13")
  assert.equal(nextFundingCheckDue("recurring", "2026-09-06"), "2026-10-06")
  assert.equal(nextFundingCheckDue("closed", "2026-09-06"), "2026-12-05")
  assert.equal(nextFundingCheckDue("archived", "2026-09-06"), "2027-03-05")
  const changes = materialFundingChanges({ status: "open", who_can_apply: "Individuals" }, { status: "closed", who_can_apply: "Organizations" })
  assert.deepEqual(changes.map(change => [change.field, change.owner_review_required]), [["status", false], ["who_can_apply", true]])
  assert.equal(fundingFreshnessSummary(millerNorthFunding, "2026-09-07").overdue_checks, 0)
})

test("funding email uses a privacy-safe subject and funding disclaimer", () => {
  const record = millerFunding.records[0]
  const email = buildResultsEmail({ resources: [normalizeEmailResult({ id: record.id, kind: "funding", name: record.name, organization: record.funder, eligibility: record.who_can_apply, access: record.application_method, website: record.application_url, approved: true })] })
  assert.equal(email.subject, "Funding opportunities from Miller")
  assert.match(email.text, /Funding availability, deadlines and eligibility can change/)
  assert.doesNotMatch(email.text, forbidden)
})

test("controlled clinician pilot packages seven existing Miller resources without retaining recipient data", async () => {
  const selected = curatedMapResources.slice(0, 7)
  const index = buildEmailResultIndex(curatedMapResources)
  const resources = resolveEmailResults(selected.map(record => record.id), index)
  const message = buildResultsEmail({ resources, city: "Lower Mainland", categories: ["Treatment resources"] })
  const calls = []
  const sender = createEmailSender({ MILLER_EMAIL_PROVIDER: "resend", RESEND_API_KEY: "test-only", MILLER_EMAIL_FROM: "Miller <resources@example.org>" }, async (_url, options) => {
    calls.push(JSON.parse(options.body))
    return { ok: true, json: async () => ({ id: "controlled_test_message" }) }
  })
  const result = await sender({ recipient: "controlled-test@example.org", ...message })
  assert.equal(result.message_id, "controlled_test_message")
  assert.equal(resources.length, 7)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].to, ["controlled-test@example.org"])
  assert.equal(calls[0].subject, "Miller resources for Lower Mainland")
  assert.doesNotMatch(`${calls[0].text}\n${calls[0].html}`, /raw search|diagnosis|private_notes|owner_review/i)
})

test("public pages expose modest navigation and publication-safe email seams", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const practical = readFileSync(new URL("../src/site/MillerPracticalSupports.jsx", import.meta.url), "utf8")
  const funding = readFileSync(new URL("../src/site/MillerFundingAssistance.jsx", import.meta.url), "utf8")
  assert.match(app, /href="\/practical-supports"/)
  assert.match(app, /href="\/funding-assistance"/)
  assert.match(practical, /Email these supports/)
  assert.match(funding, /Email these results/)
  assert.doesNotMatch(`${practical}\n${funding}`, /owner_review|private_notes|RESEND_API_KEY/)
})
