import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import listenerSources from "../src/data/samwise-public-record-source-registry-v1.json" with { type: "json" }
import memoryStore from "../artifacts/samwise-public-records/samwise-research-memory-store-v1.json" with { type: "json" }
import { dispatchFarmIgorJob, probeFarmIgor } from "../server/farmIgorWorker.js"
import { validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"
import { buildSamwiseResearchSourceCatalog, continueSamwiseResearch, planSamwiseUniversalResearch } from "../server/samwiseResearchWorkflow.js"
import { buildPalantirReviewPacket, createPalantirResearchPlan, executePalantirResearch, transitionPalantirResearchPlan } from "../server/palantirResearchExecutor.js"
import { persistPalantirExecution, persistPalantirPlan } from "../server/palantirExecutionStore.js"

const root = path.resolve(new URL("..", import.meta.url).pathname)
const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
const fixedNow = new Date("2026-09-08T05:45:00.000Z")
const executionStorePath = path.join(root, "artifacts", "samwise-public-records", "palantir-execution-store-v1.json")
const source = (url, role = "official_publication") => ({ source_url: url, evidence_basis: "explicit_source", source_role: role })

const definitions = [
  {
    cycle_id: "palantir-benefits-cycle-2",
    continuation_of: "research:public-benefits-administration-v2",
    parameters: { research_request_id: "research:public-benefits-administration-v2" },
    adapter: "research:alberta_auditor_general_reports",
    result: {
      documents: [
        { document_id: "ab-oag-income-support-aoi-2024", title: "Income Support for Albertans—Assessment of Implementation", source_url: "https://www.oag.ab.ca/reports/income-support-for-albertans-assessment-of-implementation/", review_level: "full_document" },
        { document_id: "ab-oag-public-accounts-assisted-living-social-services-2026", title: "Auditor General appearance on Assisted Living and Social Services", source_url: "https://www.oag.ab.ca/office-of-the-auditor-general-to-attend-public-accounts-committee-meeting-with-ministry-of-assisted-living-and-social-services/", review_level: "full_document" },
      ],
      findings: [
        { canonical_finding_id: "palantir:ab-income-support-aoi-2024", title: "Auditor found one income-support recommendation implemented and repeated performance management work", primary_domain: "government_services", destinations: ["owner_intelligence", "research_context_only"], source: source("https://www.oag.ab.ca/reports/income-support-for-albertans-assessment-of-implementation/", "official_assessment_of_implementation"), status_boundary: "Eligibility-process work was assessed as implemented; the performance-management recommendation was repeated." },
        { canonical_finding_id: "palantir:ab-income-support-public-accounts-2026", title: "Public Accounts follow-up retained attention on the repeated income-support recommendation", primary_domain: "government_services", destinations: ["owner_intelligence", "research_context_only"], source: source("https://www.oag.ab.ca/office-of-the-auditor-general-to-attend-public-accounts-committee-meeting-with-ministry-of-assisted-living-and-social-services/", "official_oversight_notice"), status_boundary: "A committee appearance and repeated recommendation are monitoring evidence, not proof of later implementation." },
      ],
      cross_domain_discoveries: [
        { canonical_finding_id: "palantir:ab-income-support-aoi-2024", primary_domain: "government_services", secondary_domains: ["public_funding"], evidence_basis: "explicit_source", material_value: "The assessment reviews eligibility administration and whether the program measures basic-needs and financial-resiliency outcomes." },
      ],
      stopping_reason: "source_complete",
      cost_usd: 0,
    },
  },
  {
    cycle_id: "palantir-workplace-safety-cycle-2",
    parameters: { topic: "workplace safety OHS enforcement convictions", jurisdiction: "Alberta", domains: ["public_safety", "courts_legal"], depth: "single", max_documents: 12, recent_only: true },
    adapter: "research:alberta_ohs_convictions",
    result: {
      documents: [
        { document_id: "ab-ohs-2026-marigold", title: "Marigold Infrastructure Partners Inc. conviction", source_url: "https://www.alberta.ca/convictions-under-ohs-legislation", review_level: "full_document" },
        { document_id: "ab-ohs-2025-georges-farm-centre", title: "George's Farm Centre Ltd. conviction", source_url: "https://www.alberta.ca/convictions-under-ohs-legislation", review_level: "full_document" },
      ],
      findings: [
        { canonical_finding_id: "palantir:ab-ohs-marigold-2026", title: "OHS conviction followed serious injury during LRT construction", primary_domain: "public_safety", destinations: ["owner_intelligence", "future_project_candidate"], source: source("https://www.alberta.ca/convictions-under-ohs-legislation", "official_enforcement_outcome"), next_public_milestone: "Monitor the OHS prosecution outcomes index for any appeal or amended outcome." },
        { canonical_finding_id: "palantir:ab-ohs-georges-farm-2025", title: "Creative sentence funded hazard-recognition training after farm-equipment injury", primary_domain: "public_safety", destinations: ["owner_intelligence", "future_project_candidate"], source: source("https://www.alberta.ca/convictions-under-ohs-legislation", "official_enforcement_outcome"), next_public_milestone: "Monitor for publication of the funded training tool or an appeal/outcome update." },
      ],
      cross_domain_discoveries: [
        { canonical_finding_id: "palantir:ab-ohs-marigold-2026", primary_domain: "public_safety", secondary_domains: ["courts_legal", "transportation"], evidence_basis: "explicit_source", material_value: "The conviction concerns a public LRT construction site and a formal court outcome." },
        { canonical_finding_id: "palantir:ab-ohs-georges-farm-2025", primary_domain: "public_safety", secondary_domains: ["courts_legal", "education"], evidence_basis: "explicit_source", material_value: "The formal sentence directs funds to a university training project, creating an implementation-monitoring opportunity." },
      ],
      stopping_reason: "source_complete",
      cost_usd: 0,
    },
  },
  {
    cycle_id: "palantir-accessible-transport-cycle-1",
    parameters: { topic: "accessible public transportation accountability enforcement", jurisdiction: "Canada", domains: ["transportation", "human_rights"], depth: "single", max_documents: 12, recent_only: true },
    adapter: "research:canadian_transportation_agency_compliance",
    result: {
      documents: [
        { document_id: "cta-compliance-enforcement-current", title: "Compliance monitoring and enforcement", source_url: "https://otc-cta.gc.ca/eng/compliance-enforcement", review_level: "full_document" },
        { document_id: "cta-annual-report-2024-2025", title: "Canadian Transportation Agency Annual Report 2024–2025", source_url: "https://otc-cta.gc.ca/eng/publication/annual-report-2024-2025", review_level: "full_document" },
      ],
      findings: [
        { canonical_finding_id: "palantir:cta-accessibility-enforcement-2024-25", title: "CTA reported formal accessibility disputes and compliance activity", primary_domain: "transportation", destinations: ["owner_intelligence", "future_project_candidate"], source: source("https://otc-cta.gc.ca/eng/publication/annual-report-2024-2025", "official_annual_report"), next_public_milestone: "Review the 2025–2026 annual report and current notices for material accessibility enforcement changes.", status_boundary: "Aggregate enforcement reporting does not establish an individual discrimination finding." },
        { canonical_finding_id: "palantir:cta-current-enforcement-index", title: "CTA publishes a current enforcement index with notices and inquiries", primary_domain: "transportation", destinations: ["owner_intelligence", "future_project_candidate"], source: source("https://otc-cta.gc.ca/eng/compliance-enforcement", "official_enforcement_index"), monitoring_source: "https://otc-cta.gc.ca/eng/compliance-enforcement" },
      ],
      cross_domain_discoveries: [
        { canonical_finding_id: "palantir:cta-accessibility-enforcement-2024-25", primary_domain: "transportation", secondary_domains: ["human_rights", "government_services"], evidence_basis: "explicit_source", material_value: "The official report separately counts accessibility disputes and regulatory enforcement activity." },
      ],
      stopping_reason: "source_complete",
      cost_usd: 0,
    },
  },
]

const workerHealth = await probeFarmIgor(root)
const cycles = []
for (const [index, definition] of definitions.entries()) {
  const request = validateFarmOwnerRequest({ request_type: definition.continuation_of ? "continue_research" : "research_public_records", target_id: "samwise_public_records_intelligence", parameters: definition.parameters })
  const memory = definition.continuation_of ? memoryStore.requests.find(item => item.research_request_id === definition.continuation_of) : null
  const continuedPlan = memory ? continueSamwiseResearch({ request, memory, sourceCatalog: catalog, maxSources: 8 }) : null
  const basePlan = continuedPlan ? { ...continuedPlan, source_plan: continuedPlan.source_plan.slice(0, 1), limits: { ...continuedPlan.limits, sources: 1 } } : planSamwiseUniversalResearch(request, catalog, { maxSources: 1 })
  if (basePlan.source_plan[0]?.source_id !== definition.adapter) throw new Error(`unexpected_proof_source:${basePlan.source_plan[0]?.source_id}`)
  let plan = createPalantirResearchPlan(basePlan, { now: new Date(fixedNow.getTime() + index * 60_000), requestedBy: "owner" })
  plan = transitionPalantirResearchPlan(plan, "approved", { actor: "owner", reason: "Bounded proof cycle explicitly authorized in owner request", now: new Date(fixedNow.getTime() + index * 60_000 + 1_000) })
  persistPalantirPlan(executionStorePath, plan, { now: new Date(fixedNow.getTime() + index * 60_000 + 1_000) })
  const checkpoints = []
  const started = performance.now()
  const execution = await executePalantirResearch({
    plan,
    adapters: { [definition.adapter]: async () => definition.result },
    persistCheckpoint: async checkpoint => {
      persistPalantirExecution(executionStorePath, checkpoint, { now: new Date(fixedNow.getTime() + index * 60_000 + 2_000 + checkpoints.length * 1_000) })
      checkpoints.push({ state: checkpoint.state, completed_sources: checkpoint.source_checkpoints.filter(item => ["completed", "no_material_change"].includes(item.status)).length, documents: checkpoint.documents.length, findings: checkpoint.findings.length })
    },
    igorManifestValidator: workerHealth.available ? async manifest => dispatchFarmIgorJob({ root, capability: "listener_manifest_validation", payload: manifest, timeoutMs: 5_000 }) : null,
    now: () => new Date(fixedNow.getTime() + index * 60_000 + 2_000 + checkpoints.length * 1_000),
  })
  cycles.push({ cycle_id: definition.cycle_id, plan, execution, review_packet: buildPalantirReviewPacket(execution, { title: `${definition.cycle_id} review` }), checkpoints_written: checkpoints.length, checkpoint_summaries: checkpoints, igor_manifest_validation: workerHealth.available ? "completed" : "deferred_worker_unavailable", duration_ms: Number((performance.now() - started).toFixed(2)) })
}

const artifact = {
  schema_version: "palantir-proof-cycles-v1",
  generated_at: "2026-09-08T06:00:00.000Z",
  capability_id: "samwise_public_records_intelligence",
  display_name: "Palantír",
  formal_description: "Samwise Public Records Intelligence",
  cycles,
  summary: {
    plans_generated: cycles.length,
    plans_approved: cycles.filter(item => item.plan.state === "approved").length,
    plans_completed: cycles.filter(item => item.execution.state === "completed").length,
    sources_executed: cycles.reduce((sum, item) => sum + item.execution.source_checkpoints.filter(sourceItem => sourceItem.status === "completed").length, 0),
    full_documents_reviewed: cycles.reduce((sum, item) => sum + item.execution.documents.filter(document => document.review_level === "full_document").length, 0),
    findings: cycles.reduce((sum, item) => sum + item.execution.findings.length, 0),
    cross_domain_discoveries: cycles.reduce((sum, item) => sum + item.execution.cross_domain_discoveries.length, 0),
    igor_jobs_completed: cycles.filter(item => item.igor_manifest_validation === "completed").length,
    miller_resource_opportunities: 0,
    miller_north_candidates: 0,
    future_project_candidates: cycles.reduce((sum, item) => sum + item.execution.findings.filter(finding => finding.destinations?.includes("future_project_candidate")).length, 0),
    owner_intelligence_items: cycles.reduce((sum, item) => sum + item.execution.findings.filter(finding => finding.destinations?.includes("owner_intelligence")).length, 0),
    external_api_cost_usd: 0,
    qwen_usage: 0,
    production_database_writes: 0,
    publication_actions: 0,
  },
  boundaries: { autonomous_browsing: false, registered_sources_only: true, owner_approval_required: true, mutation_authority: false, publication_authority: false },
}

const output = path.join(root, "artifacts", "samwise-public-records", "palantir-proof-cycles-v1.json")
mkdirSync(path.dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ output, worker: workerHealth.available ? "authenticated" : "unavailable", summary: artifact.summary }, null, 2)}\n`)
