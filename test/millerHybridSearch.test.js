import assert from "node:assert/strict"
import test from "node:test"

import { millerMobileCatalog } from "../server/millerMobileCatalog.js"
import { buildMillerHybridSearchResponse, assessMillerExternalSearchGate, buildMillerMobileSearchResponse, buildMillerMobileSharePack } from "../server/millerMobileApi.js"
import { createMillerTavilySearcher, normalizeTavilyExternalResults } from "../server/millerExternalSearch.js"

const fixedNow = () => new Date("2026-09-08T12:00:00.000Z")

function externalSearcher({ status = "completed", results = [] } = {}) {
  const calls = []
  return {
    calls,
    async search(context, catalog) {
      calls.push({ context, catalog_count: catalog.length })
      return {
        attempted: true,
        status,
        cache_status: "miss",
        latency_ms: 12,
        results,
        estimated_cost_usd: null,
        cost_status: "plan_rate_not_configured",
        public_message: status === "unavailable" ? "I couldn’t complete the broader search, but the verified Miller resources are still available." : "",
      }
    },
  }
}

test("fully covered urban search stays deterministic and does not call Tavily", async () => {
  const searcher = externalSearcher()
  const response = await buildMillerHybridSearchResponse({ query: "OAT in Edmonton", limit: 8 }, millerMobileCatalog, { now: fixedNow, externalSearcher: searcher })
  assert.equal(response.search_strategy.mode, "verified_deterministic")
  assert.equal(response.external_search.status, "not_needed")
  assert.equal(searcher.calls.length, 0)
  assert.ok(response.results.every(item => item.result_origin === "verified_miller"))
})

test("La Loche OAT preserves the verified local/regional access pathway before any external discovery", async () => {
  const searcher = externalSearcher()
  const response = await buildMillerHybridSearchResponse({ query: "Someone in La Loche needs OAT", limit: 8 }, millerMobileCatalog, { now: fixedNow, externalSearcher: searcher })
  assert.equal(response.results[0].name, "Mental Health, Addictions and Withdrawal Services - La Loche")
  assert.equal(response.results[0].location_relationship, "located_here")
  assert.equal(searcher.calls.length, 0)
})

test("sparse local coverage triggers bounded external discovery without inventing a local facility", async () => {
  const external = normalizeTavilyExternalResults([{ title: "Ontario official treatment intake", url: "https://www.ontario.ca/page/mental-health-and-addictions", content: "Contact provincial services for current pathways." }], {
    location: "Small Ontario Town", province: "Ontario", intents: ["treatment"],
  }, millerMobileCatalog)
  const searcher = externalSearcher({ results: external })
  const response = await buildMillerHybridSearchResponse({ query: "treatment help in Small Ontario Town", location: "Small Ontario Town", province: "Ontario", limit: 8 }, millerMobileCatalog, { now: fixedNow, externalSearcher: searcher })
  assert.ok(response.search_strategy.external_search_reasons.includes("no_verified_local_results"))
  assert.equal(searcher.calls.length, 1)
  assert.equal(searcher.calls[0].context.query, undefined)
  assert.equal(response.external_result_count, 1)
  const candidate = response.results.at(-1)
  assert.equal(candidate.verified_status, "external_unverified")
  assert.match(candidate.external_label, /not yet verified/i)
  assert.equal(candidate.location_relationship, "external_location_unverified")
  assert.equal(candidate.verification_candidate.verification_status, "pending_private_review")
  assert.equal(candidate.verification_candidate.canonical_id, null)
  assert.equal(response.privacy.external_query_stored, false)
  const pack = buildMillerMobileSharePack(response, [candidate.canonical_id])
  assert.match(pack.text, /External result — not yet verified by Miller/)
})

test("Tavily failure leaves verified Miller results usable", async () => {
  const searcher = externalSearcher({ status: "unavailable" })
  const response = await buildMillerHybridSearchResponse({ query: "recovery housing in rural Atlantic Canada", location: "Rural Atlantic Canada", province: "Nova Scotia", limit: 8 }, millerMobileCatalog, { now: fixedNow, externalSearcher: searcher })
  assert.equal(response.external_search.status, "unavailable")
  assert.ok(response.results.filter(item => item.result_origin === "verified_miller").length > 0)
  assert.match(response.search_strategy.external_search_notice, /couldn’t complete/i)
})

test("external search gate is explainable and respects a worker request to search broadly", () => {
  const internal = buildMillerMobileSearchResponse({ query: "counselling in Calgary", limit: 8 }, millerMobileCatalog, { now: fixedNow })
  const gate = assessMillerExternalSearchGate(internal, { search_more_broadly: true })
  assert.equal(gate.should_search, true)
  assert.ok(gate.reasons.includes("user_requested_broader_search"))
})

test("Tavily adapter caches only normalized geography and needs, and excludes directory-style sources", async () => {
  const calls = []
  let tick = 100
  const searcher = createMillerTavilySearcher({
    apiKey: "test-key",
    now: () => tick,
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body))
      return { ok: true, json: async () => ({ results: [
        { title: "Official program", url: "https://www.alberta.ca/addiction-services", content: "Public program." },
        { title: "Directory listing", url: "https://www.yelp.ca/example", content: "Do not show." },
      ] }) }
    },
  })
  const context = { location: "Example Town", province: "Alberta", intents: ["housing", "treatment"] }
  const first = await searcher.search(context, millerMobileCatalog)
  tick += 20
  const second = await searcher.search(context, millerMobileCatalog)
  assert.equal(calls.length, 1)
  assert.equal(first.results.length, 1)
  assert.equal(second.cache_status, "hit")
  assert.doesNotMatch(calls[0].query, /client|narrative|patient/i)
  const metrics = searcher.aggregateMetrics()
  assert.equal(metrics.raw_query_retained, false)
  assert.equal(metrics.cache_key_contains_raw_query, false)
})
