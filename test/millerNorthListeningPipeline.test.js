import assert from "node:assert/strict"
import test from "node:test"

import watch from "../src/data/miller-north-accountability-watch-v1.json" with { type: "json" }
import { listenerDocumentId, runMillerNorthListenerCycle, suggestAccountabilityLinks, validateMillerNorthListenerMemory } from "../server/millerNorthListeningPipeline.js"

const source = { adapter_id: "indigenous_media", url: "https://example.org/story?utm_source=test", title: "Hospital security response", summary: "A public report concerning hospital security in Saskatchewan.", province: "saskatchewan", facility: "Example Hospital", event_year: 2026, relevance: "potentially_relevant" }

test("listener memory distinguishes new, unchanged and updated documents", () => {
  const first = runMillerNorthListenerCycle([source], undefined, { checkedAt: "2026-09-07T00:00:00Z" })
  assert.equal(first.metrics.documents_new, 1)
  validateMillerNorthListenerMemory(first)
  const replay = runMillerNorthListenerCycle([source], first, { checkedAt: "2026-09-07T01:00:00Z" })
  assert.equal(replay.metrics.documents_new, 0)
  assert.equal(replay.changes.length, 0)
  const updated = runMillerNorthListenerCycle([{ ...source, summary: `${source.summary} An internal review was announced.` }], replay, { checkedAt: "2026-09-07T02:00:00Z" })
  assert.equal(updated.metrics.documents_updated, 1)
  assert.equal(listenerDocumentId(source), listenerDocumentId({ ...source, url: "https://example.org/story" }))
})

test("accountability links are suggestions and always require owner review", () => {
  const links = suggestAccountabilityLinks({ listening_item_id: "mnl_test", title: "Saskatchewan hospital response", summary: "The First Nations Health Ombudsperson complaint raised northern service concerns.", province: "saskatchewan", sources: [] }, watch.chains)
  assert.ok(links.length > 0)
  assert.ok(links.every(item => item.owner_review_required === true))
  assert.ok(links.every(item => item.relationship_status !== "insufficient"))
})

test("broad geography and hospital wording alone do not create accountability links", () => {
  const links = suggestAccountabilityLinks({ listening_item_id: "mnl_broad", title: "Saskatchewan hospital response", summary: "A review was reported at a Saskatoon hospital.", province: "saskatchewan", sources: [] }, watch.chains)
  assert.deepEqual(links, [])
})
