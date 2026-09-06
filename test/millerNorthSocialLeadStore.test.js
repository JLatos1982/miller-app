import assert from "node:assert/strict"
import test from "node:test"
import { buildMillerNorthSocialLeadBatch, millerNorthSocialLeadId } from "../server/millerNorthSocialLeadStore.js"

test("private social leads have stable IDs and remain separate from incident evidence", () => {
  const source_url = "https://www.reddit.com/r/example/comments/lead"
  const [lead] = buildMillerNorthSocialLeadBatch({ leads: [{ platform: "reddit", source_url, public_excerpt: "Public indexed lead", lead_status: "verification_needed" }] })
  assert.equal(lead.social_lead_id, millerNorthSocialLeadId(source_url))
  assert.equal(lead.provenance.private_social_lead_only, true)
  assert.equal(lead.timing_semantic, "unknown")
})

test("social lead batch rejects duplicate public URLs", () => {
  assert.throws(() => buildMillerNorthSocialLeadBatch({ leads: [{ platform: "reddit", source_url: "https://example.test/a", public_excerpt: "one", lead_status: "new_social_lead" }, { platform: "reddit", source_url: "https://example.test/a", public_excerpt: "two", lead_status: "new_social_lead" }] }), /duplicate/)
})
