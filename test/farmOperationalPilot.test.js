import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import registry from "../artifacts/farm/open-government-source-registry-2026-09-06.json" with { type: "json" }
import synthesis from "../artifacts/farm/farm-cross-domain-operational-pilot-2026-09-06.json" with { type: "json" }
import miller from "../artifacts/miller/miller-resource-backstory-pilot-2026-09-06.json" with { type: "json" }
import millerNorth from "../artifacts/miller-north/miller-north-legal-government-context-pilot-2026-09-06.json" with { type: "json" }
import { validateBranchMaturity, validateFarmOperationalPilot } from "../server/farmOperationalPilot.js"

const pilot = { ...synthesis, tracks: { miller, miller_north: millerNorth } }

test("cross-domain pilot keeps private domains separate and validates every edge", () => {
  const result = validateFarmOperationalPilot(pilot, registry)
  assert.deepEqual({ resources: result.miller_resources, chains: result.miller_north_chains, edges: result.evidence_edges }, { resources: 6, chains: 7, edges: 39 })
  assert.equal(result.source_registry_size, 36)
  assert.equal(result.source_families_used, 14)
  assert.equal(result.meaningful_source_families, 13)
  assert.deepEqual(result.finding_bands, { review_first: 1, review_next: 8, reference: 2, low_priority: 1 })
  assert.equal(pilot.production_mutations, 0)
  assert.equal(pilot.publication_mutations, 0)
})

test("selected resource backstories preserve funding and operation qualifications", () => {
  assert.equal(miller.resources.length, 6)
  assert.ok(miller.resources.every(item => item.publication_state === "private_owner_review" && item.evidence_edges.length === 3))
  assert.ok(miller.resources.every(item => item.evidence_edges.every(edge => edge.source_references.length >= 1)))
  const inlet = miller.resources.find(item => item.backstory_id === "mrbp_inlet_recovery")
  assert.equal(inlet.opening_or_expansion_date, null)
  assert.match(inlet.owner_review_issues.join(" "), /patient-acceptance milestone/)
  assert.equal(miller.summary.resource_specific_funding_amounts, 0)
})

test("Miller North context preserves legal, treaty and anonymity boundaries", () => {
  const bill = millerNorth.chains.find(item => item.context_id === "mnlc_sk_tubal_ligation")
  assert.match(bill.government_and_governance_context, /royal assent on June 15, 2026/)
  assert.match(bill.owner_review_reason, /case-specific remedy/)
  const fnho = millerNorth.chains.find(item => item.context_id === "mnlc_sk_fn_health_ombudsperson")
  assert.equal(fnho.treaty_context.status, "direct_governance_source")
  assert.match(fnho.treaty_context.summary, /not a judicial treaty-right ruling/)
  const hrc = millerNorth.chains.find(item => item.context_id === "mnlc_sk_hrc_mediation")
  assert.match(hrc.owner_review_reason, /anonymized/)
})

test("branch maturity covers all ten bounded capabilities", () => {
  assert.deepEqual(validateBranchMaturity(synthesis.legal_government_branch_maturity), { working: 4, working_with_limits: 4, prototype: 2, needs_more_design: 0 })
})

test("pilot deliverables keep the standardized human-centred structure", () => {
  const ownerFiles = [
    "../artifacts/miller/miller-resource-backstory-owner-summary-2026-09-06.md",
    "../artifacts/miller-north/miller-north-legal-context-owner-summary-2026-09-06.md",
    "../artifacts/farm/farm-cross-domain-operational-pilot-owner-summary-2026-09-06.md",
  ]
  for (const path of ownerFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    for (const heading of ["What changed", "Why it matters", "Strongest evidence", "Uncertainty / caution", "Recommended next move", "Key metrics"]) assert.match(source, new RegExp(`## ${heading.replace("/", "\\/")}`))
  }
  const briefFiles = [
    "../artifacts/miller/miller-resource-backstory-research-brief-2026-09-06.md",
    "../artifacts/miller-north/miller-north-legal-context-research-brief-2026-09-06.md",
  ]
  for (const path of briefFiles) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8")
    for (const heading of ["Executive summary", "Scope", "Key findings", "Evidence highlights", "Policy/service relationships", "Implementation status", "Unresolved questions", "Method", "Sources", "Limitations"]) assert.match(source, new RegExp(`## ${heading.replace("/", "\\/")}`))
  }
})

test("operational preview is bounded, admin-only and non-publishing", () => {
  const source = readFileSync(new URL("../src/admin/FarmOperationalPilotPreview.jsx", import.meta.url), "utf8")
  assert.match(source, /Administrator only · cross-domain operational pilot/)
  assert.match(source, /\.slice\(0, 3\)/)
  assert.match(source, /This view cannot publish records/)
  assert.doesNotMatch(source, /fetch\(|supabase/)
})
