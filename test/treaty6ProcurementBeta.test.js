import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import publicBeta from "../src/data/treaty6-procurement-beta-public-v1.json" with { type: "json" }
import { treaty6ProcurementAssistantV2 } from "../src/data/treaty6-procurement-assistant-v2-public.js"
import {
  buildTreaty6ProcurementBeta,
  evaluateTreaty6BetaPublicationPolicy,
  TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1,
  validateTreaty6ProcurementBetaPublic,
} from "../server/treaty6ProcurementBeta.js"
import { filterAndSortTreaty6Beta } from "../src/site/treaty6ProcurementBetaFilters.js"

const now = "2026-09-13T18:00:00.000Z"
const source = "https://canadabuys.canada.ca/en/tender-opportunities/tender-notice/example"
const record = {
  opportunity_id: "test-rfi",
  buyer: "Public Services and Procurement Canada",
  title: "Indigenous supplier capacity RFI",
  province: "Federal / Alberta / Saskatchewan",
  community_region: "Alberta and Saskatchewan",
  treaty6_relevance: { primary: "INDIGENOUS_SPECIFIC", geographic_relevance_established: true },
  categories: ["PROFESSIONAL_SERVICES"],
  posted_date: "2026-09-10T00:00:00.000Z",
  close_date: "2026-09-30T20:00:00.000Z",
  status: "OPEN",
  indigenous_relevance_class: "INDIGENOUS_PARTICIPATION_ENCOURAGED",
  actionability: "RFI_ONLY",
  small_business_fit: { classification: "INSUFFICIENT_INFORMATION" },
  possible_fit_for: ["consultants"],
  source_url: source,
  verified_at: "2026-09-13T16:00:00.000Z",
  last_changed_at: "2026-09-13T16:00:00.000Z",
  licensing_class: "PUBLIC_REUSE_CLEAR",
  source_current: true,
  source_conflict: false,
  public_fields_complete: true,
  restricted_material: false,
}
const monitor = { opportunity_id: "test-rfi", procurement_method: "Request for information", explicit_indigenous_relevance: true, relevance_evidence: "The official RFI explicitly asks Indigenous businesses to describe their supplier capacity." }

test("beta publication policy requires current, reusable, source-supported public records", () => {
  const decision = evaluateTreaty6BetaPublicationPolicy(record, monitor, { now })
  assert.equal(decision.policy, TREATY6_PROCUREMENT_BETA_PUBLICATION_POLICY_V1)
  assert.equal(decision.publishable, true)
  assert.equal(evaluateTreaty6BetaPublicationPolicy({ ...record, licensing_class: "LICENSING_REVIEW_REQUIRED" }, monitor, { now }).publishable, false)
  assert.equal(evaluateTreaty6BetaPublicationPolicy(record, { ...monitor, explicit_indigenous_relevance: false }, { now }).publishable, false)
  assert.equal(evaluateTreaty6BetaPublicationPolicy({ ...record, actionability: "CLOSED" }, monitor, { now }).result, "EXPIRED")
})

test("public beta keeps planning separate from open bids and retains tender caveats", () => {
  assert.equal(publicBeta.sections.current_opportunities.length, 0)
  assert.equal(publicBeta.sections.watching.length, 1)
  assert.equal(publicBeta.sections.watching[0].actionability, "RFI_ONLY")
  assert.equal(publicBeta.sections.watching[0].action_label, "RFI / PLANNING")
  assert.match(publicBeta.sections.watching[0].plain_language_summary, /not an open contract bid/i)
  assert.equal(publicBeta.sections.watching[0].business_qualification_claim, false)
  assert.match(publicBeta.sections.watching[0].requirements_note, /official tender/i)
})

test("public projection contains no personalized business profiles or private matching state", () => {
  const serialized = JSON.stringify(publicBeta)
  assert.equal(validateTreaty6ProcurementBetaPublic(publicBeta, { now }).valid, true)
  assert.doesNotMatch(serialized, /business_id|profile_checksum|match_id|win_probability|company_profile|qualification_state|private_notes/i)
  assert.match(publicBeta.accountability_boundary, /Low award share does not by itself establish discrimination/i)
  assert.equal(publicBeta.feedback.collection_enabled, false)
})

test("public business watchlists recover only the six retained public profiles and never expose match internals", () => {
  const names = publicBeta.sections.business_watchlists.map(item => item.canonical_name)
  assert.deepEqual(names, [
    "Kitsaki Management Limited Partnership",
    "Canada North Environmental Services",
    "Kitsaki Vegetation Services",
    "R8dius",
    "A2SKI Industrial",
    "Young Spirit Supplies",
  ])
  assert.ok(publicBeta.sections.business_watchlists.every(item => item.website.startsWith("https://") && item.source_url.startsWith("https://") && item.capabilities.length && /does not establish qualification/i.test(item.qualification_disclaimer)))
  assert.equal(publicBeta.sections.business_watchlists.flatMap(item => item.watchlist).length, 2)
  assert.doesNotMatch(JSON.stringify(publicBeta.sections.business_watchlists), /business_id|profile_checksum|match_id|win_probability|source_refs/i)
})

test("v2 assistant enrichment remains source-linked, public-only and explicit about qualification", () => {
  const model = treaty6ProcurementAssistantV2
  assert.equal(model.sections.business_watchlists.length, 6)
  assert.ok(model.sections.business_watchlists.every(item => item.public_summary && item.watch_categories.length && item.official_links.every(link => link.url.startsWith("https://"))))
  assert.ok(model.sections.buyer_intelligence.every(item => item.source_url.startsWith("https://") && /infer|confirm/i.test(item.indigenous_signal)))
  assert.equal(model.sections.weekly_digest[0].event_type, "MARKET_PASS_COMPLETED")
  assert.ok(model.sections.contract_pathways.every(item => item.source_url.startsWith("https://") && ["PUBLIC_LINK_ONLY", "ACCOUNT_REQUIRED", "MEMBERSHIP_REQUIRED"].includes(item.access)))
  assert.doesNotMatch(JSON.stringify(model), /business_id|profile_checksum|match_id|win_probability|qualification_state|internal_notes/i)
})

test("public business watchlists reject orphaned or stale opportunity references", () => {
  const invalid = structuredClone(publicBeta)
  invalid.sections.business_watchlists[0].watchlist[0].opportunity_id = "not-a-published-opportunity"
  const result = validateTreaty6ProcurementBetaPublic(invalid, { now })
  assert.equal(result.valid, false)
  assert.ok(result.errors.some(error => error.startsWith("business_watch_invalid:")))
})

test("filters and transparent sorts handle action, relevance, closing soon and buyer", () => {
  const values = [{ ...publicBeta.sections.watching[0], opportunity_id: "later", close_date: "2026-09-30T20:00:00.000Z" }, { ...publicBeta.sections.watching[0], opportunity_id: "soon", buyer: "A Buyer", close_date: "2026-09-16T20:00:00.000Z" }]
  assert.equal(filterAndSortTreaty6Beta(values, { action: "RFI_ONLY" }, "CLOSING_SOON", now)[0].opportunity_id, "soon")
  assert.equal(filterAndSortTreaty6Beta(values, { closing_soon: true }, "BUYER", now).length, 1)
  assert.equal(filterAndSortTreaty6Beta(values, { buyer: "A Buyer", relevance: "INDIGENOUS_PARTICIPATION_ENCOURAGED" }, "BUYER", now).length, 1)
})

test("builder preserves monitor, licensing, buyer and Treaty context boundaries", () => {
  const built = buildTreaty6ProcurementBeta({
    dataset: { schema_version: "treaty6-procurement-private-dataset-v1", records: [record], supports: [], historical_signals: [] },
    monitor_snapshot: { records: [monitor] },
    source_registry: [{ source_id: "FED-CANADABUYS-NOTICES", organization: "CanadaBuys", title: "Tender notices", jurisdiction: "Federal", url: "https://canadabuys.canada.ca/en/tender-opportunities", source_kind: "OPPORTUNITY", alerts_or_subscriptions: "Alerts available", authentication_for_full_documents: false, licensing_reuse_status: "PUBLIC_SOURCE_REUSE_DOCUMENTED" }],
    buyer_registry: [{ buyer_id: "PSPC", name: record.buyer, province: "Federal", buyer_type: "FEDERAL_DEPARTMENT", healthcare_lane: false, registry_status: "OBSERVED_BUYER", procurement_source_url: "https://canadabuys.canada.ca/en/tender-opportunities" }],
    geography_model: { references: [{ title: "Treaty text", source_url: "https://example.gc.ca/treaty", limitations: "Not an eligibility map." }] },
    change_feed: { events: [] },
    generated_at: now,
  })
  assert.equal(built.model.refresh.duplicate_scraper, false)
  assert.equal(built.model.owner_approval_required, true)
  assert.equal(built.model.sections.watching.length, 1)
})

test("route, navigation, metadata, accessibility and mobile layout are wired", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8")
  const page = readFileSync(new URL("../src/site/Treaty6ProcurementPreview.jsx", import.meta.url), "utf8")
  const css = readFileSync(new URL("../src/site/Treaty6ProcurementPreview.css", import.meta.url), "utf8")
  const nav = readFileSync(new URL("../src/site/millerNorthPublicTaxonomy.js", import.meta.url), "utf8")
  assert.match(app, /\/north\/procurement/)
  assert.match(page, /MillerNorthPublicNav current="procurement"/)
  assert.match(page, /aria-label="Procurement opportunity filters"/)
  assert.match(page, /Treaty 6 Procurement Opportunities \| Miller North/)
  assert.match(page, /No form is collecting business or personal information/)
  assert.match(page, /Business watchlists/)
  assert.match(page, /Best opportunities to review now/)
  assert.doesNotMatch(page, /<h2 id="t6p-week">Market digest<\/h2>/)
  assert.match(page, /How Samwise decides what is worth reviewing/)
  assert.match(page, /Ways businesses can find opportunities/)
  assert.match(css, /@media\(max-width:560px\)/)
  assert.match(nav, /label: "Procurement"/)
})
