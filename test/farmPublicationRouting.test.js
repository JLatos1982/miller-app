import assert from "node:assert/strict"
import test from "node:test"

import registry from "../src/data/miller-shared-resource-registry-v1.json" with { type: "json" }
import { isOriginalMillerPublicResource, routeFarmPublicationItem } from "../server/farmPublicationRouting.js"
import { projectSharedResources } from "../server/sharedResourceRegistry.js"

const verifiedService = {
  record_kind: "service_resource",
  verification_status: "verified_active",
  project_visibility: ["miller", "miller_north"],
  source_url: "https://example.org/service",
}

test("verified practical services may route to Miller without publishing their research origin", () => {
  assert.deepEqual(routeFarmPublicationItem(verifiedService), {
    routing_disposition: "miller_resource_candidate",
    original_miller_public: true,
    miller_north_public: false,
    owner_review_required: false,
    reason: "verified_practical_resource_allowed",
  })
})

test("legal, incident, policing and accountability records are denied from original Miller", () => {
  for (const record_kind of ["legal_decision", "incident", "police_investigation", "coroner_inquest", "accountability_watch_chain", "child_welfare_investigation"]) {
    const routed = routeFarmPublicationItem({ ...verifiedService, record_kind })
    assert.equal(routed.original_miller_public, false, record_kind)
    assert.equal(routed.owner_review_required, true, record_kind)
    assert.equal(routed.routing_disposition, "miller_north_evidence_candidate", record_kind)
  }
})

test("unverified or source-less resources remain shared review candidates", () => {
  assert.equal(routeFarmPublicationItem({ ...verifiedService, verification_status: "needs_review" }).routing_disposition, "shared_resource_candidate")
  assert.equal(routeFarmPublicationItem({ ...verifiedService, source_url: "" }).original_miller_public, false)
})

test("private review always overrides an otherwise valid resource route", () => {
  const routed = routeFarmPublicationItem({ ...verifiedService, private_research: true })
  assert.equal(routed.routing_disposition, "miller_north_evidence_candidate")
  assert.equal(routed.original_miller_public, false)
})

test("the canonical Miller projection accepts resource records and rejects evidence-shaped impostors", () => {
  const projected = projectSharedResources(registry, "miller")
  assert.equal(projected.length, 109)
  assert.ok(projected.every(isOriginalMillerPublicResource))
  const valid = projected[0]
  assert.equal(isOriginalMillerPublicResource({ ...valid, legal_record_id: "case-1" }), false)
  assert.equal(isOriginalMillerPublicResource({ ...valid, publication_route: "research_context_only" }), false)
})
