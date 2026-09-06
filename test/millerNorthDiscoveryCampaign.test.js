import assert from "node:assert/strict"
import test from "node:test"
import { buildMillerNorthDiscoveryCampaignV2, normalizeCampaignQuery } from "../server/millerNorthDiscoveryCampaign.js"
import { startQuery } from "../server/millerNorthDiscoveryCheckpoint.js"

test("campaign v2 plans a non-duplicated 80/80/40 regional search allocation", () => {
  const campaign = buildMillerNorthDiscoveryCampaignV2()
  assert.equal(campaign.queries.length, 200)
  assert.deepEqual(Object.fromEntries(["alberta", "saskatchewan", "british_columbia"].map(province => [province, campaign.queries.filter(query => query.province === province).length])), { alberta: 80, saskatchewan: 80, british_columbia: 40 })
  assert.equal(new Set(campaign.queries.map(query => `${query.province}\u001f${normalizeCampaignQuery(query.query)}`)).size, 200)
  assert.ok(campaign.queries.filter(query => query.regional_context === "Treaty 6 research geography").length >= 100)
})

test("campaign query IDs are versioned separately from prior regional discovery", () => {
  const manifest = { version: "miller-north-discovery-checkpoint-v2", queries: {} }
  const v2 = startQuery(manifest, "alberta", "Indigenous patient racism Edmonton hospital", manifest.version)
  const v1 = startQuery(manifest, "alberta", "Indigenous patient racism Edmonton hospital", "v1")
  assert.notEqual(v2.id, v1.id)
})
