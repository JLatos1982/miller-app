import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { validateFarmOwnerRequest } from "../server/farmSupabaseInteraction.js"
import { persistSamwiseResearchMemory, readSamwiseResearchMemoryStore, samwiseResearchMemoryStatus } from "../server/samwiseResearchMemoryStore.js"
import { buildSamwiseResearchSourceCatalog, calculateSamwiseResearchRequestYield, createSamwiseResearchMemory, planSamwiseUniversalResearch, reviewSamwiseSecondaryRelevance } from "../server/samwiseResearchWorkflow.js"

const root = process.cwd()
const readJson = async relative => JSON.parse(await readFile(path.join(root, relative), "utf8"))
const listenerSources = await readJson("src/data/samwise-public-record-source-registry-v1.json")
const benefits = await readJson("artifacts/samwise-public-records/public-benefits-administrative-accountability-v2.json")
const workplace = await readJson("artifacts/samwise-public-records/workplace-safety-enforcement-proof-v1.json")
const catalog = buildSamwiseResearchSourceCatalog({ listenerRegistry: listenerSources })
const fingerprint = value => createHash("sha256").update(value).digest("hex")
const memoryPath = path.join(root, "artifacts/samwise-public-records/samwise-research-memory-store-v1.json")

const benefitsRequest = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "public benefits and administrative-service accountability", domains: ["government_services", "public_funding", "housing"], depth: "bounded", historical: true } })
const benefitsPlan = { ...planSamwiseUniversalResearch(benefitsRequest, catalog), research_request_id: benefits.research_request_id }
const benefitsSources = ["research:bc_ombudsperson_investigations", "research:alberta_ombudsman_case_summaries", "research:saskatchewan_ombudsman_reports", "research:saskatchewan_auditor_reports"]
const benefitsReviews = benefits.cross_domain_discoveries.map(item => reviewSamwiseSecondaryRelevance({ findingId: item.finding_id, primaryDomain: item.primary_domain, candidates: item.secondary_domains.map(domain => ({ domain, evidence_basis: "explicit_source" })), sourceReference: benefits.recommendation_rows.find(row => row.row_id.startsWith(item.finding_id.includes("bc-") ? "bc-" : item.finding_id.includes("ab-") ? "ab-" : "sk-"))?.source_url || benefits.recommendation_rows[0].source_url }))
const benefitsMemory = createSamwiseResearchMemory({ plan: benefitsPlan, sourcesChecked: benefitsSources, documentsSeen: benefits.recommendation_rows.map(row => ({ source_id: benefitsSources.find(source => source.includes(row.jurisdiction === "British Columbia" ? "bc_" : row.jurisdiction === "Alberta" ? "alberta_" : "saskatchewan_auditor")) || benefitsSources[0], document_id: row.row_id, fingerprint: fingerprint(row.source_url), reviewed: true })), findings: benefits.cross_domain_discoveries.map(item => item.finding_id), secondaryReviews: benefitsReviews, stoppingReason: "document_limit" })
persistSamwiseResearchMemory(memoryPath, benefitsMemory)

const workplaceRequest = validateFarmOwnerRequest({ request_type: "research_public_records", target_id: "samwise_public_records_intelligence", parameters: { topic: "workplace safety regulatory enforcement", domains: ["public_safety", "courts_legal", "professional_regulation"], depth: "bounded", recent_only: true } })
const workplacePlan = { ...planSamwiseUniversalResearch(workplaceRequest, catalog), research_request_id: workplace.research_request_id }
const workplaceReviews = workplace.findings.map(item => reviewSamwiseSecondaryRelevance({ findingId: item.canonical_finding_id, primaryDomain: item.primary_domain, candidates: item.secondary_domains, sourceReference: item.source_url }))
const workplaceMemory = createSamwiseResearchMemory({ plan: workplacePlan, sourcesChecked: workplace.source_systems.map(item => item.source_id), documentsSeen: workplace.findings.map(item => ({ source_id: workplace.source_systems.find(source => item.source_url.startsWith(source.source_url))?.source_id || workplace.source_systems[0].source_id, document_id: item.canonical_finding_id, fingerprint: fingerprint(item.source_url), reviewed: true })), findings: workplace.findings, secondaryReviews: workplaceReviews, stoppingReason: "no_material_novelty" })
persistSamwiseResearchMemory(memoryPath, workplaceMemory)

const store = readSamwiseResearchMemoryStore(memoryPath)
const report = {
  schema_version: "samwise-intelligence-center-baseline-v1",
  generated_at: new Date().toISOString(),
  capability_id: "samwise_public_records_intelligence",
  source_catalog: catalog.counts,
  memory: samwiseResearchMemoryStatus(store),
  request_yield: store.requests.map(calculateSamwiseResearchRequestYield),
  universal_secondary_review: { required: true, weak_keyword_edges_created: 0 },
  consumer_outputs: { miller_public_investigative_records: 0, miller_north_automatic_publications: 0, owner_review_required: true },
  mutation_authority: false,
  publication_authority: false,
}
await writeFile(path.join(root, "artifacts/samwise-public-records/samwise-intelligence-center-baseline-v1.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
