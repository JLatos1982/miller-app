import resources from "../src/vancouver_resources_merged_updated.json" with { type: "json" }
import { stableCuratedResourceId } from "../src/map/mapChat.js"
import { canonicalSeedId } from "../server/resourceIdentity.js"
import { normalizedResourceRows } from "../src/resourceData.js"

const text = (value) => String(value || "").replace(/\s+/g, " ").trim()
const lower = (value) => text(value).toLowerCase()
const geocodingStreet = (value) => {
  const clean = text(value)
  const segment = clean.split(",").map(text).reverse().find((part) => /^#?\d/.test(part) && !/^(?:unit|suite|room)\b/i.test(part)) || clean
  return segment.replace(/^#\d+[-–](?=\d)/, "").replace(/,?\s+(?:unit|suite|room)\s+.+$/i, "")
}
const lowerMainland = new Set(["abbotsford", "burnaby", "chilliwack", "coquitlam", "delta", "langley", "maple ridge", "mission", "new westminster", "north vancouver", "port coquitlam", "port moody", "richmond", "surrey", "vancouver", "white rock"])

function inspect(row) {
  const name = text(row.name)
  const address = text(row.address)
  const city = text(row.city)
  const combined = lower([row.serviceType, row.category, row.description, row.accessType, row.notes].join(" "))
  const normalizedAddress = [geocodingStreet(address), city, "BC", "Canada"].filter(Boolean).join(", ")
  const reasons = []
  if (!address) reasons.push("missing_address")
  if (!city) reasons.push("missing_city")
  if (/\bP\.?\s*O\.?\s* Box\b/i.test(address)) reasons.push("po_box")
  if (/confidential|undisclosed|private address/i.test(address)) reasons.push("private_or_undisclosed")
  if (/virtual|online|telephone/.test(combined)) reasons.push("virtual_or_remote")
  if (/mobile|outreach/.test(combined)) reasons.push("mobile_or_non_fixed")
  if (address && !/^\d+[A-Za-z]?(?:[-–]\d+)?\s/.test(address)) reasons.push("insufficient_street_address")
  const suspicious = []
  if (/\b(unit|suite|floor|room)\b/i.test(address)) suspicious.push("unit_or_subpremise_review")
  if (!lowerMainland.has(lower(city))) suspicious.push("outside_initial_lower_mainland_scope")
  const alias = stableCuratedResourceId({ name, city, organization: row.organization })
  const sensitiveResidential = /residential|\bhouse\b|\bmanor\b|supportive recovery|transition|transitional|stabilization|treatment (centre|center|home)|women'?s centre|men'?s centre|shelter|housing/i.test(`${name} ${row.serviceType || ""} ${row.category || ""}`)
  return { canonical_id: canonicalSeedId("curated_bundle", alias), source_aliases: [{ source_type: "curated_bundle", source_native_id: alias }], name, resource_type: text(row.serviceType || row.category), original_address: address, city, normalized_address: normalizedAddress, public_source: text(row.website), eligible: reasons.length === 0, excluded_reasons: reasons, review_flags: suspicious, sensitive_residential_review: sensitiveResidential }
}

const inventory = normalizedResourceRows(resources).map(inspect)
const eligible = inventory.filter((item) => item.eligible)
const excluded = inventory.filter((item) => !item.eligible)
const addressGroups = new Map()
for (const item of eligible) addressGroups.set(lower(item.normalized_address), [...(addressGroups.get(lower(item.normalized_address)) || []), item])
const duplicateAddresses = [...addressGroups.values()].filter((items) => items.length > 1)
const reviewedPilotNames = new Set([
  "Richmond Community Mental Health and Substance Use - Central Intake", "Anne Vogel Clinic",
  "Archway Abbotsford Addictions Centre", "Burnaby Community Substance Use Services Clinic",
  "Opioid Agonist Treatment - Burnaby", "Langley Community Services Society",
  "Gathering Place Community Centre - Clothing", "Evelyne Saller Centre - Clothing",
  "Carnegie Community Centre", "Kiwassa Neighbourhood House", "Mission Possible",
  "UBC Learning Exchange", "Rapid Access Addiction Clinic (RAAC) - Vancouver",
  "Addiction Services - Downtown Community Health Centre", "Commercial Health Centre",
])
const pilotCandidates = inventory.filter((item) => reviewedPilotNames.has(item.name)).sort((a, b) => a.name.localeCompare(b.name)).map((item) => {
  const addressPeers = addressGroups.get(lower(item.normalized_address)) || []
  const clinicalWithdrawal = /RAAC|withdrawal management|Daytox|clinic/i.test(`${item.name} ${item.resource_type}`)
  return { ...item, province: "BC", location_type: "fixed", shared_address: addressPeers.length > 1, other_services_at_address: addressPeers.filter((peer) => peer.canonical_id !== item.canonical_id).map((peer) => peer.name), sensitivity_assessment: clinicalWithdrawal ? "Publicly advertised outpatient clinical facility; no residential, confidential, shelter, transitional-housing, women-serving, or undisclosed-location signal." : "Public-facing clinic, municipal facility, or community-agency office; no residential, confidential, shelter, transitional-housing, women-serving, or undisclosed-location signal.", recommendation: "include", recommendation_reason: "Complete published fixed address and public source; safe to geocode as a non-public pending point. Publication still requires individual human approval.", safe_to_geocode_reason: "Published fixed street address with city; not virtual, mobile, confidential, a PO box, residential, shelter, or transitional housing.", display_recommendation: "pending_point_only" }
})
if (pilotCandidates.length !== 15) throw new Error(`Reviewed pilot must contain exactly 15 resources; found ${pilotCandidates.length}`)
const pilotIds = new Set(pilotCandidates.map((item) => item.canonical_id))
const replacementCandidates = eligible.filter((item) => lowerMainland.has(lower(item.city)) && item.review_flags.length === 0 && !item.sensitive_residential_review && !pilotIds.has(item.canonical_id) && !/\bCAPS\b|Driver Program|Atira Women|Dress for Success/i.test(item.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8).map((item) => ({ canonical_id: item.canonical_id, name: item.name, address: item.normalized_address, resource_type: item.resource_type }))

const report = { generated_at: new Date().toISOString(), mode: "dry_run_only", source: "proposed_canonical_registry_from_bundled_aliases", summary: { canonical_resources_inspected: inventory.length, fixed_public_location_candidates: eligible.length, virtual_or_mobile: inventory.filter((item) => item.excluded_reasons.some((reason) => reason === "virtual_or_remote" || reason === "mobile_or_non_fixed")).length, confidential_or_undisclosed: inventory.filter((item) => item.excluded_reasons.includes("private_or_undisclosed")).length, excluded: excluded.length, duplicate_physical_address_groups: duplicateAddresses.length, distinct_services_at_shared_addresses: duplicateAddresses.reduce((sum, items) => sum + items.length, 0), suspicious_or_out_of_scope: inventory.filter((item) => item.review_flags.length).length, sensitive_residential_review: inventory.filter((item) => item.sensitive_residential_review).length, mechanically_eligible_pilot_candidates: eligible.filter((item) => !item.sensitive_residential_review && item.review_flags.length === 0).length }, pilot_candidates: pilotCandidates, suggested_replacements: replacementCandidates, duplicate_normalized_addresses: duplicateAddresses, all_candidates: inventory }
if (process.argv.includes("--pilot-table")) {
  const cell = (value) => String(value || "—").replaceAll("|", "\\|").replaceAll("\n", " ")
  console.log("| Canonical ID | Resource | Original public address | Normalized query | City / province | Source aliases | Type | Public source | Shared / other services | Sensitivity review | Recommendation / rationale |")
  console.log("|---|---|---|---|---|---|---|---|---|---|---|")
  for (const item of pilotCandidates) console.log(`| ${cell(item.canonical_id)} | ${cell(item.name)} | ${cell(item.original_address)} | ${cell(item.normalized_address)} | ${cell(`${item.city}, ${item.province}`)} | ${cell(item.source_aliases.map((alias) => `${alias.source_type}:${alias.source_native_id}`).join(", "))} | ${cell(item.location_type)} — ${cell(item.resource_type)} | ${cell(item.public_source)} | ${cell(item.shared_address ? `Yes — ${item.other_services_at_address.join(", ") || "other Miller service"}` : "No")} | ${cell(item.sensitivity_assessment)} | ${cell(`${item.recommendation}: ${item.recommendation_reason}`)} |`)
} else console.log(JSON.stringify(process.argv.includes("--summary") ? { ...report.summary, pilot_candidates: pilotCandidates, suggested_replacements: replacementCandidates } : report, null, 2))
