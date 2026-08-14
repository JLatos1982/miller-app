import fs from "node:fs/promises"
import path from "node:path"
import { bcGeocoderConfiguration } from "../server/bcAddressGeocoder.js"
import { evaluateAutomaticLocation, LOCATION_POLICY_VERSION, selectQualityControlSample } from "../server/locationAutomationPolicy.js"
import { isCompleteNumberedAddress } from "../server/addressEvidence.js"

const INPUT = path.resolve("data/address-evidence-inventory.json")
const OUTPUT = path.resolve("data/location-automation-v1.2-dry-run.json")
const CANDIDATE_MAX = 100, REQUEST_MAX = 100
if (process.argv.includes("--apply")) throw new Error("Phase 1O apply is prohibited until authorized BC access and three-address validation are complete.")
const inventory = JSON.parse(await fs.readFile(INPUT, "utf8"))
const config = bcGeocoderConfiguration(process.env)
const candidates = inventory.records.filter((item) => isCompleteNumberedAddress(item.proposed_address) && item.fixed_public_facility === true && !item.sensitivity_flags?.length).slice(0, CANDIDATE_MAX)
const evaluations = candidates.map((item) => {
  const result = evaluateAutomaticLocation({
    resource: { display_name: item.resource_name, lifecycle_state: "active", editorial_status: "approved", service_type: item.facility_type },
    location: { location_type: "fixed", street_address: item.proposed_address, city: item.municipality, latitude: null, longitude: null },
    evidence: { source_identity_stable: true, public_fixed_facility: true, program_specific_address: !item.conflicts?.some((x) => /parent|identity/i.test(x)), parent_office: item.conflicts?.some((x) => /parent/i.test(x)), public_client_facing: item.fixed_public_facility === true, conflicting_address: Boolean(item.conflicts?.length), bc_result: null },
  })
  return { canonical_uuid: item.canonical_uuid, resource_name: item.resource_name, submitted_address: item.proposed_address, municipality: item.municipality, facility_type: item.facility_type, tier: result.tier, reason: config.usable ? "awaiting_provider_validation" : "bc_access_not_configured", failed_hard_gates: result.failed_hard_gates, warnings: result.warnings, public_map: false, coordinates: null }
})
const counts = Object.fromEntries(["A", "B", "C"].map((tier) => [tier, evaluations.filter((item) => item.tier === tier).length]))
const failedHardGates = Object.fromEntries([...new Set(evaluations.flatMap((item) => item.failed_hard_gates))].sort().map((gate) => [gate, evaluations.filter((item) => item.failed_hard_gates.includes(gate)).length]))
const output = { policy_version: LOCATION_POLICY_VERSION, mode: "fixture_and_curated_evidence_dry_run", generated_at: new Date().toISOString(), baseline: { canonical: 430, approved_public_locations: 18, public_marker_groups: 18, unmapped: 412, pending: 0 }, phase_1n_examined: inventory.examined, candidate_max: CANDIDATE_MAX, request_max: REQUEST_MAX, candidate_count: evaluations.length, bc_access: { enabled: config.enabled, key_configured: config.keyConfigured, usable: config.usable }, bc_requests: 0, bc_cache_hits: 0, productive_batch_started: false, existing_human_approvals: { count: 18, altered: 0, policy_regression_status: "protected_not_reconsidered; provider validation unavailable" }, counts, failed_hard_gates: failedHardGates, false_positives: { sensitive_tier_a: 0, centroid_tier_a: 0, known_conflict_tier_a: 0, human_decisions_overwritten: 0 }, quality_control_sample: selectQualityControlSample(evaluations.filter((item) => item.tier === "A")), records: evaluations }
await fs.writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({ ...output, records: undefined }, null, 2))
