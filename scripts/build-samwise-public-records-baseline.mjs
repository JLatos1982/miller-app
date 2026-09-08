import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { samwiseListenerInventory } from "../server/samwiseCapabilityRegistry.js"
import { buildSamwiseOwnerReviewPacket, normalizeSamwiseFinding, routeSamwiseFinding } from "../server/samwisePublicRecordsIntelligence.js"

const root = process.cwd()
const readJson = async relativePath => JSON.parse(await readFile(path.join(root, relativePath), "utf8"))
const outputDir = path.join(root, "artifacts", "samwise-public-records")

const legal = await readJson("artifacts/miller-legal/farm-legal-corpus-mining-v5-cross-lane.json")
const focusedLegal = await readJson("artifacts/miller-legal/farm-legal-corpus-mining-v4.json")
const childYouth = await readJson("artifacts/miller-north/miller-north-child-youth-recommendation-ledger-v1.json")
const spirit = await readJson("artifacts/miller-north/miller-north-spirit-matters-ledger-v1.json")
const live = await readJson("artifacts/miller-north/miller-north-live-cross-lane-monitoring-v1.json")

const domainEvidence = (domains, sourceUrl) => (domains || []).map(domain => ({ domain, evidence_basis: "reviewed_citation", source_reference: sourceUrl }))
const legalRoutes = record => {
  const routes = []
  if ((record.project_routing || []).some(value => String(value).includes("miller_north"))) routes.push("miller_north_evidence_candidate")
  if ((record.project_routing || []).includes("accountability_watch_candidate")) routes.push("miller_north_watch_candidate")
  if ((record.project_routing || []).includes("shared_support_links")) routes.push("shared_resource_candidate")
  return routes.length ? routes : ["owner_intelligence"]
}

const legalFindings = legal.records.map(record => normalizeSamwiseFinding({
  canonical_finding_id: record.canonical_legal_id,
  citation: record.citation,
  title: record.citation,
  summary: record.merits_finding,
  source_url: record.source_url || record.reviewed_sources?.[0],
  source_family: "legal_corpus",
  source_role: record.source_url ? "tribunal_or_court_decision" : "legal_summary_pending_primary_decision",
  evidence_role: record.procedural_stage,
  intelligence_state: record.merits_finding ? "formal_finding" : "formal_process",
  primary_domain: record.primary_domain,
  secondary_domains: domainEvidence(record.secondary_domains, record.source_url || record.reviewed_sources?.[0]),
  indigenous_relevance: "explicit_formal_record",
  discrimination_evidence: record.merits_finding ? "formal_finding" : "not_assessed",
  downstream_destinations: legalRoutes(record),
  related_support_categories: record.related_support_categories,
  next_research_action: record.publication_note,
  owner_review_required: true,
}))

const alreadyIncludedLegalIds = new Set(legalFindings.map(record => record.canonical_finding_id))
const focusedLegalFindings = focusedLegal.legal_matters.filter(record => !alreadyIncludedLegalIds.has(record.legal_record_id)).map(record => {
  const millerNorth = String(record.project_route || "").startsWith("miller_north")
  const watch = String(record.project_route || "").includes("accountability_watch")
  const routes = watch ? ["miller_north_watch_candidate"] : millerNorth ? ["miller_north_evidence_candidate"] : ["owner_intelligence", "research_context_only"]
  return normalizeSamwiseFinding({
    canonical_finding_id: record.legal_record_id,
    citation: record.citation || record.decision_identifier,
    title: record.case_name,
    summary: record.finding,
    source_url: record.source_url,
    source_family: "legal_corpus",
    source_role: record.review_level,
    evidence_role: record.process_role,
    intelligence_state: watch ? "implementation_monitoring" : record.process_role === "merits_decision" ? "formal_finding" : "formal_process",
    primary_domain: record.primary_domain,
    secondary_domains: domainEvidence(record.secondary_domains, record.source_url),
    indigenous_relevance: millerNorth ? "explicit_source" : "not_supported",
    discrimination_evidence: record.discrimination_evidence,
    downstream_destinations: routes,
    next_public_milestone: record.next_public_milestone,
    next_research_action: record.finding_boundary,
    owner_review_required: true,
  })
})

const recommendationFindings = childYouth.recommendations.map(record => normalizeSamwiseFinding({
  canonical_finding_id: record.recommendation_id,
  title: `${record.report} — recommendation ${record.recommendation_number}`,
  summary: record.recommendation_text,
  source_url: record.source_url,
  source_family: record.source_family,
  source_role: "statutory_advocate_recommendation",
  evidence_role: "recommendation",
  intelligence_state: record.implementation_evidence ? "implementation_monitoring" : "formal_process",
  primary_domain: record.primary_domain,
  secondary_domains: domainEvidence(record.secondary_domains, record.source_url),
  relevant_entities: record.responsible_organizations,
  indigenous_relevance: record.indigenous_relevance,
  institutional_relevance: "supported_public_body",
  downstream_destinations: ["owner_intelligence"],
  accountable_body: (record.responsible_organizations || []).join(", "),
  next_research_action: record.unresolved_question,
  owner_review_required: true,
}))

const spiritFindings = spirit.recommendations.map(record => normalizeSamwiseFinding({
  canonical_finding_id: record.recommendation_id,
  title: `${record.report} — recommendation ${record.recommendation_number}`,
  summary: record.recommendation_text,
  source_url: record.source_url,
  source_family: record.source_family,
  source_role: "independent_corrections_oversight_recommendation",
  evidence_role: "recommendation_and_implementation_assessment",
  intelligence_state: "implementation_monitoring",
  primary_domain: "corrections",
  secondary_domains: domainEvidence(record.secondary_domains, record.source_url),
  relevant_entities: record.responsible_organizations,
  indigenous_relevance: record.indigenous_relevance,
  downstream_destinations: ["owner_intelligence"],
  accountable_body: (record.responsible_organizations || []).join(", "),
  next_research_action: record.unresolved_question,
  owner_review_required: true,
}))

const spiritChain = normalizeSamwiseFinding({
  canonical_finding_id: "watch_candidate_spirit_matters",
  title: "Spirit Matters recommendation and implementation ledger",
  summary: spirit.watch_review.reason,
  source_url: spirit.sources[0].url,
  source_family: "correctional_investigator",
  source_role: "independent_corrections_oversight",
  evidence_role: "recommendation_implementation_gap",
  intelligence_state: "owner_review",
  primary_domain: "corrections",
  secondary_domains: domainEvidence(["government_services_funding", "healthcare"], spirit.sources[0].url),
  indigenous_relevance: "explicit_source",
  downstream_destinations: ["miller_north_watch_candidate"],
  next_research_action: spirit.watch_review.next_research_action,
  owner_review_required: true,
})

const findings = [...legalFindings, ...focusedLegalFindings, ...recommendationFindings, ...spiritFindings, spiritChain]
const routed = findings.map(finding => {
  const routing = routeSamwiseFinding(finding)
  return { finding, routing, owner_review: buildSamwiseOwnerReviewPacket(finding, routing) }
})
const listenerInventory = samwiseListenerInventory()
const routes = routed.flatMap(item => item.routing.routes)
const secondaryDomains = routed.flatMap(item => item.finding.secondary_domains.map(domain => domain.domain))
const report = {
  schema_version: "samwise-public-records-integration-baseline-v1",
  generated_at: legal.reviewed_at || focusedLegal.generated_at,
  capability_id: "samwise_public_records_intelligence",
  architecture: {
    scheduler_reused: listenerInventory.scheduler,
    listeners_integrated: listenerInventory.counts,
    mutation_authority: false,
    publication_authority: false,
  },
  processed: {
    findings: routed.length,
    legal_decisions: legalFindings.length + focusedLegalFindings.length,
    child_youth_recommendations: recommendationFindings.length,
    corrections_recommendations: spiritFindings.length,
    accountability_chain_candidates: 1,
    live_monitoring_records_referenced: live.counts.cross_lane_records,
  },
  routes: Object.fromEntries([...new Set(routes)].sort().map(route => [route, routes.filter(value => value === route).length])),
  domains: Object.fromEntries([...new Set(findings.map(item => item.primary_domain))].sort().map(domain => [domain, findings.filter(item => item.primary_domain === domain).length])),
  secondary_domain_relationships: Object.fromEntries([...new Set(secondaryDomains)].sort().map(domain => [domain, secondaryDomains.filter(value => value === domain).length])),
  safeguards: {
    owner_review_packets: routed.length,
    automatic_publication: false,
    production_mutations: 0,
    original_miller_research_records: 0,
    raw_page_bodies_stored: 0,
  },
  records: routed.map(item => ({
    canonical_finding_id: item.finding.canonical_finding_id,
    title: item.finding.title,
    source_family: item.finding.source.family,
    intelligence_state: item.finding.intelligence_state,
    primary_domain: item.finding.primary_domain,
    secondary_domains: item.finding.secondary_domains.map(domain => domain.domain),
    routes: item.routing.routes,
    owner_review_required: true,
  })),
}

await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, "samwise-public-records-integration-baseline-v1.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ output: "artifacts/samwise-public-records/samwise-public-records-integration-baseline-v1.json", processed: report.processed, routes: report.routes, domains: report.domains, listeners: listenerInventory.counts, production_mutations: 0 }, null, 2))
