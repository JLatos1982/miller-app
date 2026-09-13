import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"

import {
  bindTreaty6ProjectionToMonitor, buildTreaty6PageSimulation, classifyTreaty6Geography, createTreaty6Buyer,
  createTreaty6GeographicModel, createTreaty6GeographicReference, createTreaty6Opportunity, evaluateTreaty6PublicationPolicy,
  toTreaty6PublicProjection, treaty6RefreshPlan,
} from "../server/treaty6ProcurementIntelligence.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const monitorDir = path.join(root, "artifacts/samwise/data-foundry/indigenous-procurement-opportunity-monitor-30d-v1")
const outputDir = path.join(root, "artifacts/samwise/data-foundry/treaty6-procurement-intelligence-v1")
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"))
const sha256 = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex")
const writeAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

const generatedAt = new Date().toISOString()
const campaignPath = path.join(monitorDir, "campaign-private.json")
const baselinePath = path.join(monitorDir, "latest-snapshot-private.json")
const sourceRegistryPath = path.join(monitorDir, "source-registry-private.json")
for (const file of [campaignPath, baselinePath, sourceRegistryPath]) if (!fs.existsSync(file)) throw new Error(`treaty6_monitor_dependency_missing:${path.relative(root, file)}`)
const campaign = readJson(campaignPath)
const baseline = readJson(baselinePath)
const sourceRegistry = readJson(sourceRegistryPath)
if (campaign.status !== "ACTIVE") throw new Error("treaty6_monitor_dependency_not_active")

const references = [
  createTreaty6GeographicReference({ reference_id: "RCAANC-TREATY6-TEXT", title: "Treaty Texts: Treaty No. 6", source_url: "https://www.rcaanc-cirnac.gc.ca/eng/1100100028710/1581292569426", source_role: "TREATY_TEXT", provinces: ["Alberta", "Saskatchewan"], geographic_scope: "The official treaty text describes Treaty 6 limits across areas now within Alberta and Saskatchewan.", limitations: "Treaty text is authoritative history but is not a procurement-eligibility map.", verified_at: generatedAt }),
  createTreaty6GeographicReference({ reference_id: "AB-OPEN-TREATY-BOUNDARY", title: "Treaty Boundary open dataset", source_url: "https://open.canada.ca/data/en/dataset/8755f172-71ad-4445-8bae-7f19635daaf4", source_role: "AUTHORITATIVE_BOUNDARY_DATA", provinces: ["Alberta"], geographic_scope: "Government of Alberta historical-treaty polygon data exposed through an official open-data record and feature service.", limitations: "Boundaries are approximate historical representations and must not determine supplier identity or eligibility.", verified_at: generatedAt }),
  createTreaty6GeographicReference({ reference_id: "OTC-SK-TREATY-MAP", title: "Treaty boundaries, First Nations and treaty sites in Saskatchewan", source_url: "https://www.otc.ca/ckfinder/userfiles/files/treatymap_large.pdf", source_role: "TREATY_COMMISSION_MAP", provinces: ["Saskatchewan"], geographic_scope: "Office of the Treaty Commissioner map differentiates Treaty 6 from adjacent Saskatchewan treaty areas.", limitations: "Map variations are documented; location tagging remains source-backed rather than a legal boundary determination.", verified_at: generatedAt }),
  createTreaty6GeographicReference({ reference_id: "OTC-TREATIES", title: "The Treaties in Saskatchewan", source_url: "https://otc.ca/treaties/", source_role: "TREATY_COMMISSION_MAP", provinces: ["Saskatchewan"], geographic_scope: "Treaty Commissioner reference page links Treaty 6 text and provincial boundary/community maps.", limitations: "Not a supplier-eligibility source.", verified_at: generatedAt }),
]
const geographyModel = createTreaty6GeographicModel({ references })

const buyerSeeds = [
  ["PSPC", "Public Services and Procurement Canada", "Federal", "FEDERAL_DEPARTMENT", "OBSERVED_BUYER", "https://canadabuys.canada.ca/en/tender-opportunities", false],
  ["ISC", "Indigenous Services Canada", "Federal", "FEDERAL_DEPARTMENT", "OBSERVED_BUYER", "https://canadabuys.canada.ca/en/tender-opportunities", false],
  ["CSC", "Correctional Service Canada", "Federal", "FEDERAL_DEPARTMENT", "OBSERVED_BUYER", "https://canadabuys.canada.ca/en/tender-opportunities", false],
  ["AB-GOV", "Government of Alberta ministries and agencies", "Alberta", "PROVINCIAL_PUBLIC_SECTOR", "PORTAL_ROUTED", "https://www.alberta.ca/find-and-compete-for-government-contracts", false],
  ["AB-INFRA", "Alberta Infrastructure", "Alberta", "INFRASTRUCTURE", "PORTAL_ROUTED", "https://www.alberta.ca/tendering-contracting-infrastructure-vendor-opportunities", false],
  ["AB-WCB", "Workers' Compensation Board of Alberta", "Alberta", "PUBLIC_AGENCY", "OBSERVED_BUYER", "https://purchasing.alberta.ca/", true],
  ["AB-PCA", "Primary Care Alberta", "Alberta", "HEALTH_AGENCY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://www.alberta.ca/find-and-compete-for-government-contracts", true],
  ["AB-ACA", "Acute Care Alberta", "Alberta", "HEALTH_AGENCY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://www.alberta.ca/find-and-compete-for-government-contracts", true],
  ["AB-RA", "Recovery Alberta", "Alberta", "HEALTH_AGENCY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://www.alberta.ca/find-and-compete-for-government-contracts", true],
  ["AB-ALA", "Assisted Living Alberta", "Alberta", "HEALTH_AGENCY", "PORTAL_ROUTED", "https://www.alberta.ca/become-a-continuing-care-provider-or-operator", true],
  ["SK-GOV", "Saskatchewan ministries and public agencies", "Saskatchewan", "PROVINCIAL_PUBLIC_SECTOR", "PORTAL_ROUTED", "https://www.saskatchewan.ca/business/transportation-and-road-construction/contracting-with-highways", false],
  ["SK-SHA", "Saskatchewan Health Authority", "Saskatchewan", "HEALTH_AUTHORITY", "PORTAL_ROUTED", "https://www.saskatchewan.ca/business/transportation-and-road-construction/contracting-with-highways", true],
  ["SK-POWER", "SaskPower", "Saskatchewan", "CROWN_UTILITY", "OBSERVED_BUYER", "https://www.saskpower.com/our-power-future/infrastructure-projects/construction-projects/planning-and-construction-projects/aspen-power-station/our-commitment-and-work-opportunities", false],
  ["SK-ENERGY", "SaskEnergy", "Saskatchewan", "CROWN_UTILITY", "PORTAL_ROUTED", "https://www.saskenergy.com/about-us/newsroom/delivering-customers-communities-and-saskatchewan-saskenergy-2024-25-annual", false],
  ["SK-MUNI", "Treaty 6-region Saskatchewan municipalities", "Saskatchewan", "MUNICIPAL_FAMILY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://www.saskatchewan.ca/business/transportation-and-road-construction/contracting-with-highways", false],
  ["AB-MUNI", "Treaty 6-region Alberta municipalities", "Alberta", "MUNICIPAL_FAMILY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://www.alberta.ca/find-and-compete-for-government-contracts", false],
  ["POSTSEC", "Treaty 6-region public post-secondary institutions", "Alberta / Saskatchewan", "POST_SECONDARY_FAMILY", "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED", "https://canadabuys.canada.ca/en/tender-opportunities", false],
]
const buyers = buyerSeeds.map(([buyer_id, name, province, buyer_type, registry_status, procurement_source_url, healthcare_lane]) => createTreaty6Buyer({ buyer_id, name, province, buyer_type, registry_status, procurement_source_url, healthcare_lane, treaty6_service_relation: "UNCLEAR", notes: registry_status === "MONITOR_TARGET_SOURCE_CONFIRMATION_REQUIRED" ? "Retained as a watch target only; direct procurement authority/source routing must be verified before opportunity publication." : "Public procurement source or portal routing is documented." }))

const licensingBySource = new Map(sourceRegistry.map(source => [source.source_id, source.licensing_reuse_status === "PUBLIC_SOURCE_REUSE_DOCUMENTED" ? "PUBLIC_REUSE_CLEAR" : "LICENSING_REVIEW_REQUIRED"]))
const sourceIdFor = record => {
  if (record.source_url.includes("canadabuys")) return record.opportunity_id === "PSPC-WR-001" ? "FED-CANADABUYS-NOTICES" : "FED-CANADABUYS-NOTICES"
  if (record.source_url.includes("bcbid")) return "BC-BID-PUBLIC"
  if (record.source_url.includes("alberta")) return "AB-APC"
  if (record.source_url.includes("saskpower")) return "SK-ASPEN"
  return "SK-SASKTENDERS"
}

function geographyFor(record) {
  if (record.opportunity_id === "PSPC-WR-001") return classifyTreaty6Geography({ evidence: [{ relationship: "OPEN_TO_TREATY_6_SUPPLIERS", source_ref: "RCAANC-TREATY6-TEXT", reason: "The official RFI explicitly seeks Indigenous business capacity in Alberta and Saskatchewan, provinces crossed by Treaty 6; this is regional access, not an eligibility inference." }, { relationship: "INDIGENOUS_SPECIFIC", source_ref: "RCAANC-TREATY6-TEXT", reason: "Indigenous business participation is explicit in the RFI source, while the treaty reference only establishes the Treaty 6 regional intersection." }] }, geographyModel)
  if (record.opportunity_id === "AB-2026-06257") return classifyTreaty6Geography({ evidence: [{ relationship: "GENERAL_OPEN_OPPORTUNITY", source_ref: "AB-OPEN-TREATY-BOUNDARY", reason: "The listing is Alberta-wide in the retained summary, but no Treaty 6 delivery site or eligibility geography is established." }] }, geographyModel)
  return classifyTreaty6Geography({}, geographyModel)
}

const records = baseline.records.map(record => createTreaty6Opportunity({ monitored_record: record, geography: geographyFor(record), licensing_class: licensingBySource.get(sourceIdFor(record)) || "LICENSING_REVIEW_REQUIRED", source_current: true, public_fields_complete: Boolean(record.title && record.buyer && record.source_url) }))
const decisions = records.map(record => Object.freeze({ opportunity_id: record.opportunity_id, ...evaluateTreaty6PublicationPolicy(record, { now: generatedAt }) }))
const projections = records.flatMap(record => {
  const decision = decisions.find(item => item.opportunity_id === record.opportunity_id)
  return decision.publishable ? [toTreaty6PublicProjection(record, decision)] : []
})

const supports = [
  { support_id: "FED-PSIB", support_type: "INDIGENOUS_PROGRAM", title: "Procurement Strategy for Indigenous Business", summary: "Official federal set-aside rules and buyer guidance. Suppliers must confirm current eligibility and registration requirements at the source.", source_url: "https://canadabuys.canada.ca/en/buyer-s-portal/legislation-and-policies/socioeconomics/indigenous-considerations/procurement-strategy-indigenous-business", licensing_class: "PUBLIC_REUSE_CLEAR" },
  { support_id: "FED-CANADABUYS-ALERTS", support_type: "SUPPLIER_REGISTRATION", title: "CanadaBuys opportunity search and alerts", summary: "Search public tender notices and use the official notification tools to follow relevant searches or notices.", source_url: "https://canadabuys.canada.ca/en/tender-opportunities", licensing_class: "PUBLIC_REUSE_CLEAR" },
  { support_id: "AB-APC-SUPPLIER", support_type: "SUPPLIER_REGISTRATION", title: "Alberta Purchasing Connection supplier account", summary: "Official Alberta guidance documents saved filters, posting notifications, document access and expressions of interest.", source_url: "https://www.alberta.ca/find-and-compete-for-government-contracts", licensing_class: "PUBLIC_LINK_ONLY" },
  { support_id: "SK-SASKTENDERS", support_type: "SUPPLIER_REGISTRATION", title: "SaskTenders public procurement discovery", summary: "Official provincial route to Saskatchewan public-sector tender information; individual requirements remain controlled by each notice.", source_url: "https://www.saskatchewan.ca/business/transportation-and-road-construction/contracting-with-highways", licensing_class: "PUBLIC_LINK_ONLY" },
]

const pageSimulation = buildTreaty6PageSimulation({ projections, supports, signals: [], generated_at: generatedAt })
const projectionCore = { schema_version: "treaty6-procurement-private-dataset-v1", generated_at: generatedAt, campaign_id: campaign.campaign_id, geography_model_checksum: geographyModel.model_checksum, source_systems: sourceRegistry.length, buyer_registry: buyers, records, publication_decisions: decisions, publication_safe_projection: projections, supports, historical_signals: [], refresh_plan: treaty6RefreshPlan(), private_only: true, publication_authority: false }
const dataset = Object.freeze({ ...projectionCore, dataset_checksum: sha256(projectionCore) })
const updatedCampaign = bindTreaty6ProjectionToMonitor(campaign, { projection_checksum: dataset.dataset_checksum, record_count: records.length, public_safe_count: projections.length })

const routePlan = {
  schema_version: "treaty6-procurement-navigation-plan-v1", proposed_route: "/north/procurement", route_registered: false, navigation_activated: false,
  proposed_navigation: ["Evidence", "Incidents", "Accountability", "Watching", "Supports & Funding", "Procurement"],
  semantic_boundary: "Procurement is a practical/economic-opportunity surface. It is not an incident, evidence, accountability, racism or discrimination finding.",
  activation_gate: "OWNER_REVIEW_AFTER_SUFFICIENT_CURRENT_BID_READY_DATA", private_only: true,
}
const feedbackPack = {
  schema_version: "treaty6-procurement-josh-preview-pack-v1", generated_at: generatedAt,
  opportunity_examples: projections.slice(0, 15),
  sample_limit_note: projections.length < 5 ? `Only ${projections.length} record passed all Treaty 6, actionability, current-source and reuse gates; weak records were not added to reach five.` : null,
  common_buyer_categories: [...new Set(records.flatMap(record => record.categories))].sort(), indigenous_examples: projections.filter(item => item.indigenous_relevance_class.startsWith("INDIGENOUS_")),
  supplier_registration_supports: supports, monitor_explanation: "The active 30-day public-source monitor observes bounded source families, validates changes, tags Treaty 6 relevance only with evidence, and keeps ambiguous records private.",
  feedback_questions: ["Would opportunities like these be useful to Treaty 6 businesses you know?", "Which industries/business types should we prioritize?", "Are we missing major buyers?", "Would current tenders, future/renewal signals, or supplier-registration information be most useful?", "Would a public web page like this be something people would actually check?"],
  send_attempted: false, private_only: true,
}
const licensing = sourceRegistry.map(source => ({ source_id: source.source_id, url: source.url, classification: licensingBySource.get(source.source_id) || "LICENSING_REVIEW_REQUIRED", public_behavior: licensingBySource.get(source.source_id) === "PUBLIC_REUSE_CLEAR" ? "SAFE_METADATA_AND_LINK_AFTER_POLICY" : "KEEP_PRIVATE_UNTIL_REVIEW_OR_USE_MINIMAL_LINK_ONLY_WHEN_SEPARATELY_CLASSIFIED", documents_mirrored: false }))
const assessment = {
  schema_version: "treaty6-procurement-owner-review-assessment-v1", generated_at: generatedAt,
  outcome: projections.some(item => item.actionability === "OPEN_BID_READY") ? "TREATY6_PROCUREMENT_PAGE_READY_FOR_OWNER_REVIEW" : "TREATY6_PROCUREMENT_MONITOR_NEEDS_MORE_DATA",
  counts: { geographic_references: references.length, public_buyers: buyers.length, healthcare_buyers: buyers.filter(item => item.healthcare_lane).length, source_systems: sourceRegistry.length, active_monitor_records: records.length, publication_safe_records: projections.length, open_bid_ready_records: projections.filter(item => item.actionability === "OPEN_BID_READY").length, indigenous_specific_or_participation_records: projections.filter(item => item.indigenous_relevance_class.startsWith("INDIGENOUS_")).length, small_business_positive_records: projections.filter(item => ["SOLO_FRIENDLY", "MICRO_BUSINESS_FRIENDLY", "SMALL_TEAM_FRIENDLY"].includes(item.small_business_fit)).length, supports: supports.length, recurring_buyer_signals: 0, historical_awards: 0 },
  reasons: ["The active monitor was reused and not duplicated.", "One planning/RFI record passes the Treaty 6 and publication gates, but no current OPEN_BID_READY record does.", "Five other active monitored records remain private because Treaty 6 delivery/service relevance or reuse evidence is incomplete.", "The page component and publication-safe simulation are ready for owner inspection, but navigation and routing remain inactive."],
  next_data_gates: ["At least five current publication-safe records, including at least three OPEN_BID_READY opportunities.", "At least two Alberta and two Saskatchewan buyer families with source-confirmed Treaty 6 delivery geography.", "Source-family reuse classification resolved to PUBLIC_REUSE_CLEAR or PUBLIC_LINK_ONLY for all displayed records.", "One source-backed recurring-buyer or prior-award signal."],
  private_only: true, publication_authority: false,
}

fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 })
const outputs = new Map([
  ["geographic-model-private.json", geographyModel], ["buyer-registry-private.json", buyers], ["source-licensing-private.json", licensing],
  ["treaty6-procurement-dataset-private.json", dataset], ["page-simulation-private.json", pageSimulation], ["navigation-plan-private.json", routePlan],
  ["josh-treaty6-preview-pack-private.json", feedbackPack], ["owner-review-assessment-private.json", assessment],
])
for (const [name, value] of outputs) writeAtomic(path.join(outputDir, name), value)
writeAtomic(campaignPath, updatedCampaign)

const report = `# Treaty 6 Procurement Intelligence v1 — private owner review\n\nGenerated: ${generatedAt}\n\n- Existing campaign reused: ${campaign.campaign_id}\n- Source systems: ${sourceRegistry.length}\n- Buyer registry: ${buyers.length} (${buyers.filter(item => item.healthcare_lane).length} healthcare lane)\n- Active monitor records tagged: ${records.length}\n- Publication-safe simulation records: ${projections.length}\n- Open bid-ready records: ${assessment.counts.open_bid_ready_records}\n- Supports: ${supports.length}\n- Route activated: no\n- Publication authority: no\n\n## Decision\n\n${assessment.outcome}\n\nThe page structure is implemented for private simulation, but current Treaty 6-specific opportunity density is below the owner-review activation gate. The strong retained example is a planning-only Indigenous supplier-capacity RFI, not a contract opportunity.\n\n## Safety\n\nTreaty 6 geography does not imply Indigenous identity or eligibility. No discrimination inference is made. Official sources control eligibility, status and deadlines. Accountability remains a separate private ledger.\n`
fs.writeFileSync(path.join(outputDir, "TREATY6_PROCUREMENT_INTELLIGENCE_V1-private.md"), report, { mode: 0o600 })

function createRecovery() {
  const files = [...outputs.keys(), "TREATY6_PROCUREMENT_INTELLIGENCE_V1-private.md"].sort()
  const manifestFiles = files.map(relative => {
    const file = path.join(outputDir, relative)
    return { relative_path: relative, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) }
  })
  const snapshotHash = sha256(manifestFiles)
  const snapshotId = `treaty6-procurement-intelligence-v1-${snapshotHash.slice(0, 12)}`
  const snapshotDir = path.join(outputDir, "recovery", snapshotId)
  if (!fs.existsSync(snapshotDir)) {
    const partial = `${snapshotDir}.partial`
    fs.mkdirSync(path.join(partial, "payload"), { recursive: true, mode: 0o700 })
    for (const item of manifestFiles) {
      const destination = path.join(partial, "payload", item.relative_path)
      fs.copyFileSync(path.join(outputDir, item.relative_path), destination)
      fs.chmodSync(destination, 0o400)
    }
    const manifest = { schema_version: "treaty6-procurement-private-recovery-v1", snapshot_id: snapshotId, created_at: generatedAt, files: manifestFiles, file_count: manifestFiles.length, total_bytes: manifestFiles.reduce((sum, item) => sum + item.bytes, 0), credentials_included: false, verified: true, private_only: true }
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
    fs.writeFileSync(path.join(partial, "manifest.json"), manifestBytes, { mode: 0o400 })
    fs.writeFileSync(path.join(partial, "manifest.sha256"), `${sha256(manifestBytes)}  manifest.json\n`, { mode: 0o400 })
    for (const item of manifestFiles) if (sha256(fs.readFileSync(path.join(partial, "payload", item.relative_path))) !== item.sha256) throw new Error(`treaty6_recovery_verification_failed:${item.relative_path}`)
    fs.renameSync(partial, snapshotDir)
    fs.chmodSync(path.join(snapshotDir, "payload"), 0o500)
    fs.chmodSync(snapshotDir, 0o500)
  }
  const manifest = readJson(path.join(snapshotDir, "manifest.json"))
  return { snapshot_id: snapshotId, path: path.relative(root, snapshotDir), manifest_sha256: sha256(fs.readFileSync(path.join(snapshotDir, "manifest.json"))), file_count: manifest.file_count, total_bytes: manifest.total_bytes, verified: true }
}

const recovery = createRecovery()
writeAtomic(path.join(outputDir, "recovery-reference-private.json"), recovery)
process.stdout.write(`${JSON.stringify({ outcome: assessment.outcome, campaign_id: campaign.campaign_id, campaign_start: campaign.start_at, campaign_end: campaign.end_at, source_systems: sourceRegistry.length, buyers: buyers.length, healthcare_buyers: buyers.filter(item => item.healthcare_lane).length, monitored_records: records.length, publication_safe_records: projections.length, open_bid_ready_records: assessment.counts.open_bid_ready_records, supports: supports.length, route_activated: false, recovery }, null, 2)}\n`)
