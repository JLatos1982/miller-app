import fs from "node:fs/promises"
import { readFarmSource } from "/Users/admin/samwise-private/server/farmSourceReader.js"
import { extractNumberedAddresses } from "../server/addressEvidence.js"
import { evaluatePracticalLocationCandidates } from "../server/practicalPublicLocationPublication.js"

const COHORT = new URL("../data/miller-practical-discovery-cohort-v1.json", import.meta.url)
const INVENTORY = new URL("../data/directory-address-coverage-current.json", import.meta.url)
const OUTPUT = new URL("../data/miller-practical-linkage-diagnostic-v1.json", import.meta.url)
const cohort = JSON.parse(await fs.readFile(COHORT, "utf8"))
if (cohort.version !== "miller-practical-discovery-cohort-v1" || cohort.selected?.length !== 87) throw new Error("completed_cohort_required")
const inventory = JSON.parse(await fs.readFile(INVENTORY, "utf8"))
let prior = null
try { prior = JSON.parse(await fs.readFile(OUTPUT, "utf8")) } catch {}
const priorCandidates = new Map((prior?.records || []).flatMap((record) => record.sources.flatMap((source) => (source.candidates || []).map((candidate) => [`${record.resource_id}|${source.url}|${candidate.address}`, candidate]))))
const inventoryById = new Map(inventory.records.map((item) => [item.canonical_uuid, item]))
const selected = cohort.selected.filter((item) => item.attempts?.some((attempt) => Number(attempt.candidate_count) > 0))
const legacyCandidateCount = selected.flatMap((item) => item.attempts.filter((attempt) => Number(attempt.candidate_count) > 0)).reduce((sum, attempt) => sum + Number(attempt.candidate_count), 0)
if (selected.length !== 25 || legacyCandidateCount !== 98) throw new Error(`diagnostic_set_drift:${selected.length}:${legacyCandidateCount}`)

const phrase = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
function oldFailureReason(candidate, record, sourceCandidateCount) {
  if (candidate.current_rule_supported) return "previously_supported"
  if (candidate.linkage_reason === "global_footer_or_admin") return "global_footer_or_admin"
  if (candidate.linkage_reason === "multi_site_without_program_binding") return "multi_site_without_program_binding"
  if (candidate.structural_linkage_supported && candidate.program_site_disposition === "program_site_supported") return candidate.structural_context?.kind === "heading_section" ? "heading_boundary_lost" : "structured_location_not_recognized"
  if (["title_distance_only", "title_after_address", "reader_chunk_boundary"].includes(candidate.linkage_reason)) return candidate.linkage_reason
  const organization = phrase(record.organization)
  const context = phrase(candidate.context)
  if (organization && organization.length >= 7 && context.includes(organization)) return "organization_only_linkage"
  const heading = phrase(candidate.structural_context?.heading)
  if (heading && !phrase(record.name).includes(heading) && !heading.includes(phrase(record.name))) return "another_program_linkage"
  if (sourceCandidateCount > 1) return "multi_site_without_program_binding"
  return "insufficient_context"
}

const records = []
for (const item of selected) {
  const inventoryItem = inventoryById.get(item.id) || {}
  const record = { resource_id: item.id, name: item.name, organization: inventoryItem.organization || "", locality: item.locality || inventoryItem.city || "", sources: [] }
  for (const attempt of item.attempts.filter((entry) => Number(entry.candidate_count) > 0)) {
    const source = { url: attempt.url, legacy_candidate_count: Number(attempt.candidate_count), legacy_supported_count: Number(attempt.supported_count || 0), fetch_status: "pending", candidates: [] }
    try {
      const farm = await readFarmSource({ url: attempt.url })
      const sourceText = farm.segments.map((segment) => segment.text).join("\n")
      const candidates = [...new Set(extractNumberedAddresses(sourceText))]
      const structuralCandidates = [...new Set(extractNumberedAddresses((farm.structure || []).map((block) => `${block.heading || ""} ${block.text || ""}`).join("\n")))].filter((address) => !candidates.includes(address))
      const evaluated = evaluatePracticalLocationCandidates({ resource: { display_name: item.name, organization: record.organization }, sourceText, candidates, sourceUrl: farm.url, structure: farm.structure })
      const evaluatedStructural = evaluatePracticalLocationCandidates({ resource: { display_name: item.name, organization: record.organization }, sourceText, candidates: structuralCandidates, sourceUrl: farm.url, structure: farm.structure })
      source.fetch_status = "read"
      source.source_quality = farm.source_quality
      source.source_fingerprint = farm.fingerprint
      source.current_candidate_count = evaluated.length
      source.structure_blocks = farm.structure?.length || 0
      source.candidates = evaluated.map((candidate) => { const previous = priorCandidates.get(`${record.resource_id}|${source.url}|${candidate.address}`); return { ...candidate, old_rule_failure_reason: oldFailureReason(candidate, record, evaluated.length), ...(previous?.local_light ? { local_light: previous.local_light } : {}), ...(previous?.targeted_verification ? { targeted_verification: previous.targeted_verification } : {}) } })
      source.new_structured_candidates = evaluatedStructural
    } catch (error) {
      source.fetch_status = /not_approved/.test(String(error?.message)) ? "source_no_longer_trusted" : "source_unavailable"
      source.error = String(error?.message || error).slice(0, 300)
      source.unreconstructed_candidates = Array.from({ length: source.legacy_candidate_count }, (_, index) => ({ legacy_candidate_slot: index + 1, old_rule_failure_reason: source.fetch_status, program_site_disposition: "unrelated_site", diagnostic_detail_available: false }))
    }
    record.sources.push(source)
  }
  records.push(record)
  await fs.writeFile(OUTPUT, `${JSON.stringify({ version: "miller-practical-linkage-diagnostic-v1", generated_at: new Date().toISOString(), source_cohort: "miller-practical-discovery-cohort-v1", expected_records: 25, expected_legacy_candidates: 98, records }, null, 2)}\n`, { mode: 0o600 })
}

const candidates = records.flatMap((record) => record.sources.flatMap((source) => source.candidates.map((candidate) => ({ ...candidate, resource_id: record.resource_id, source_url: source.url }))))
const unavailableCandidates = records.flatMap((record) => record.sources.flatMap((source) => (source.unreconstructed_candidates || []).map((candidate) => ({ ...candidate, resource_id: record.resource_id, source_url: source.url }))))
const newStructuredCandidates = records.flatMap((record) => record.sources.flatMap((source) => (source.new_structured_candidates || []).map((candidate) => ({ ...candidate, resource_id: record.resource_id, source_url: source.url }))))
const summary = {
  records: records.length,
  legacy_candidates: legacyCandidateCount,
  reconstructed_candidates: candidates.length,
  analyzed_candidate_slots: candidates.length + unavailableCandidates.length,
  newly_exposed_structured_candidates: newStructuredCandidates.length,
  sources_read: records.flatMap((record) => record.sources).filter((source) => source.fetch_status === "read").length,
  sources_unavailable: records.flatMap((record) => record.sources).filter((source) => source.fetch_status === "source_unavailable").length,
  sources_no_longer_trusted: records.flatMap((record) => record.sources).filter((source) => source.fetch_status === "source_no_longer_trusted").length,
  old_supported: candidates.filter((candidate) => candidate.current_rule_supported).length,
  refined_supported: candidates.filter((candidate) => candidate.program_site_disposition === "program_site_supported").length,
  structural_recoveries: candidates.filter((candidate) => !candidate.current_rule_supported && candidate.structural_linkage_supported && candidate.program_site_disposition === "program_site_supported").length,
  reasons: Object.entries([...candidates, ...unavailableCandidates].reduce((counts, candidate) => ({ ...counts, [candidate.old_rule_failure_reason]: (counts[candidate.old_rule_failure_reason] || 0) + 1 }), {})).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
}
const artifact = { version: "miller-practical-linkage-diagnostic-v1", generated_at: new Date().toISOString(), source_cohort: "miller-practical-discovery-cohort-v1", expected_records: 25, expected_legacy_candidates: 98, summary, records, ...(prior?.local_light_summary ? { local_light_summary: prior.local_light_summary } : {}), ...(prior?.targeted_verification_summary ? { targeted_verification_summary: prior.targeted_verification_summary } : {}), ...(prior?.production_validation ? { production_validation: prior.production_validation } : {}) }
await fs.writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify(summary, null, 2))
