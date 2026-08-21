import test from "node:test"
import assert from "node:assert/strict"
import { buildShelterAutomationReport, classifyShelterCandidate } from "../server/shelterAutomation.js"

const base = { id: 1, name: "Harbour Emergency Shelter", shelter_type: "emergency_shelter", community: "Prince George", source_name: "211 British Columbia", source_url: "https://example.org", retrieved_title: "Harbour shelter", source_excerpt: "Current service details", evidence_notes: "", checked_at: "2026-08-20T00:00:00.000Z", confidence: "high", review_status: "pending", location_disclosure_status: "public", possible_matches: [], additional_sources: ["https://operator.example.org"] }
test("shelter dry run separates duplicates, safety, research, and a potential automatic category", () => {
  assert.equal(classifyShelterCandidate(base, { now: new Date("2026-08-21") }).category, "auto_approval_eligible")
  assert.equal(classifyShelterCandidate({ ...base, possible_matches: [{}] }, { now: new Date("2026-08-21") }).category, "duplicate_already_represented")
  assert.equal(classifyShelterCandidate({ ...base, location_disclosure_status: "confidential" }, { now: new Date("2026-08-21") }).category, "safety_sensitive")
  assert.equal(classifyShelterCandidate({ ...base, confidence: "medium" }, { now: new Date("2026-08-21") }).category, "strong_administrator_review")
})

test("throughput queue exposes direct human decisions without any map-publication control", async () => {
  const fs = await import("node:fs")
  const ui = fs.readFileSync(new URL("../src/admin/ShelterThroughputQueue.jsx", import.meta.url), "utf8")
  for (const label of ["Approve directory resource", "Approve directory resource — keep location private", "Needs more research", "Reject", "Exclude", "Review possible duplicate"]) assert.match(ui, new RegExp(label))
  assert.match(ui, /\/api\/admin\/discovery-candidates\/\$\{item\.id\}/)
  assert.match(ui, /Directory resource approved\. No map location was created\./)
  assert.doesNotMatch(ui, /publish_verified_map_pin/)
})
test("automation is observe-only while comparable human-decision validation is absent", () => {
  const report = buildShelterAutomationReport([base, { ...base, id: 2, review_status: "approved" }], { now: new Date("2026-08-21") })
  assert.equal(report.automatic_approval_enabled, false); assert.equal(report.location_publication_changed, false); assert.equal(report.validation.agreement_available, false)
})
