import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const load = async name => JSON.parse(await readFile(new URL(`../artifacts/miller-north/${name}`, import.meta.url), "utf8"))
const walkKeys = value => {
  if (Array.isArray(value)) return value.flatMap(walkKeys)
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, nested]) => [key, ...walkKeys(nested)])
}

test("FNHO dossier preserves governance, funding, response and privacy boundaries", async () => {
  const dossier = await load("miller-north-fnho-dossier-candidate-v2-2026-09-06.json")
  assert.equal(dossier.decision, "ready_with_minor_owner_review")
  assert.equal(dossier.recommendations.length, 4)
  assert.equal(dossier.findings.complaint_volume.total, 391)
  assert.equal(dossier.findings.complaint_volume.closed_or_resolved, 224)
  assert.equal(dossier.findings.sha_related_percent, 64)
  assert.match(dossier.governance.caution, /funding.*not.*governance authority|funding.*not.*operational control/i)
  assert.equal(dossier.response.later_formal_response_search_result, "formal_response_not_located_in_public_sources_searched")
  assert.equal(dossier.publication_safety.contains_patient_names, false)
  assert.equal(dossier.publication_safety.contains_changed_case_names, false)
  assert.equal(dossier.publication_safety.governance_and_funding_distinguished, true)
})

test("FNHO browser-ready prototype excludes private review mechanics", async () => {
  const projection = await load("miller-north-fnho-publication-safe-prototype-2026-09-06.json")
  assert.equal(projection.visibility, "private_browser_ready_not_wired")
  assert.equal(projection.recommendations.length, 4)
  const forbidden = new Set(["owner_review", "owner_review_reason", "internal_id", "patient_name", "private_notes"])
  assert.deepEqual(walkKeys(projection).filter(key => forbidden.has(key)), [])
  assert.match(projection.caution, /Missing public evidence does not prove/)
})

test("First Nations supports fixture is deterministic, source-backed and domain-separated", async () => {
  const dataset = await load("miller-north-first-nations-supports-three-province-2026-09-06.json")
  const matches = await load("miller-north-first-nations-supports-resource-matches-2026-09-06.json")
  assert.equal(dataset.records.length, 26)
  assert.equal(new Set(dataset.records.map(item => item.support_id)).size, 26)
  assert.deepEqual(Object.fromEntries(["British Columbia", "Alberta", "Saskatchewan"].map(province => [province, dataset.records.filter(item => item.province === province).length])), {
    "British Columbia": 12,
    Alberta: 6,
    Saskatchewan: 8,
  })
  assert.ok(dataset.records.every(item => item.authoritative_source_url.startsWith("https://") && item.last_verified_date === "2026-09-06"))
  assert.equal(matches.comparison_mode, "read_only")
  assert.equal(matches.records.filter(item => item.outcome === "exact_existing_miller_resource").length, 4)
})

test("Alberta panel crosswalk keeps alignment separate from direct evidence", async () => {
  const crosswalk = await load("miller-north-alberta-22-recommendation-crosswalk-2026-09-06.json")
  assert.equal(crosswalk.rows.length, 22)
  assert.equal(crosswalk.counts.direct_implementation_evidence, 5)
  assert.equal(crosswalk.counts.partial_related_implementation, 7)
  assert.equal(crosswalk.counts.broad_systemic_alignment_only, 3)
  assert.equal(crosswalk.counts.no_clear_public_crosswalk, 7)
  assert.ok(crosswalk.rows.every(row => /not an effectiveness or completion rating/.test(row.caution)))
})
