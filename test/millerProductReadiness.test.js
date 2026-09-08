import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8")
const supportReadiness = JSON.parse(read("../artifacts/miller/miller-fraser-lower-mainland-support-readiness-2026-09-06.json"))
const funding = JSON.parse(read("../artifacts/miller/miller-first-nations-funding-assistance-2026-09-06.json"))

test("short-height fallbacks remove decorative overlap before content", () => {
  const appCss = read("../src/App.css")
  assert.match(appCss, /min-width:901px\) and \(max-height:640px\)/)
  assert.match(appCss, /max-width:1180px\) and \(max-height:820px\) and \(orientation:landscape\)/)
  assert.match(appCss, /\.hero-art\{display:none!important\}/)
  assert.match(appCss, /\.miller-companion-travel\{display:none!important\}/)
  assert.match(appCss, /max-height:760px\)[\s\S]*?\.miller-companion-actor\{left:-106px!important;width:112px!important;height:109px!important\}/)
  assert.match(appCss, /\.results-panel\.has-result-companion\{padding-left:20px\}/)
})

test("Email My Results keeps actions reachable in a short viewport", () => {
  const css = read("../src/site/EmailResultsDialog.css")
  assert.match(css, /@media \(max-height: 820px\)/)
  assert.match(css, /\.email-results-modal \.site-modal-content \{[^}]*overflow-y: auto/s)
  assert.match(css, /\.email-results-submit-row \{[\s\S]*position: sticky/)
})

test("Fraser readiness shortlist is current-source bounded and deduplicated", () => {
  assert.equal(supportReadiness.private, true)
  assert.equal(supportReadiness.publication_state, "owner_review_required")
  assert.equal(supportReadiness.records.length, supportReadiness.counts.shortlist)
  assert.equal(new Set(supportReadiness.records.map((item) => item.name)).size, supportReadiness.records.length)
  assert.equal(supportReadiness.records.filter((item) => item.miller_resource_id).length, supportReadiness.counts.existing_miller_resources)
  assert.equal(supportReadiness.records.filter((item) => item.miller_match.startsWith("new_")).length, supportReadiness.counts.genuinely_new_candidates)
  for (const item of supportReadiness.records) {
    assert.match(item.source, /^https:\/\//)
    assert.ok(item.current_operation)
    assert.ok(item.public_readiness)
    assert.ok(item.category)
  }
})

test("First Nations funding stays private and closes expired intakes", () => {
  assert.equal(funding.private, true)
  assert.equal(funding.publication_state, "owner_review_required")
  assert.equal(funding.records.length, 41)
  const employmentPartnerships = funding.records.find((item) => item.funding_record_id === "fnfund_ab_epp")
  assert.equal(employmentPartnerships.intake_status, "closed")
  assert.match(employmentPartnerships.freshness_note, /deadline has passed/i)
})
