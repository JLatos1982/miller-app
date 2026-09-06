import fs from "node:fs/promises"
import { createHash } from "node:crypto"

const diagnosticPath = new URL("../data/miller-practical-linkage-diagnostic-v1.json", import.meta.url)
const cohortPath = new URL("../data/miller-practical-discovery-cohort-v1.json", import.meta.url)
const outputPath = new URL("../data/miller-practical-multi-site-recovery-v1.json", import.meta.url)
const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, "utf8"))
const cohort = JSON.parse(await fs.readFile(cohortPath, "utf8"))
const cohortById = new Map(cohort.selected.map((item) => [item.id, item]))
const cityPattern = /\b(Vancouver|Victoria|Nanaimo|Courtenay|Campbell River|Delta|Kelowna|Burnaby|Surrey|Port Coquitlam|Chilliwack|Mission|Prince George)\b(?=,?\s*B\.?C\.?\b)/ig
const localityFor = (candidate, fallback) => {
  const civic = candidate.address.match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? candidate.context.search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  const tail = at < 0 ? candidate.context : candidate.context.slice(at)
  return [...tail.matchAll(cityPattern)][0]?.[1] || (/\bVanc\s+ouver\b/i.test(tail) ? "Vancouver" : "") || (!/^(?:all cities|multiple)$/i.test(fallback || "") ? fallback : "")
}
const labelFor = (candidate) => {
  const civic = candidate.address.match(/\b\d{1,6}[A-Za-z]?\b/)?.[0]
  const at = civic ? candidate.context.search(new RegExp(`\\b${civic}\\b`, "i")) : -1
  return at < 0 ? "" : candidate.context.slice(Math.max(0, at - 100), at).replace(/\s+/g, " ").trim().slice(-100)
}
const relationships = []
for (const record of diagnostic.records) for (const source of record.sources) for (const candidate of source.candidates || []) {
  if (candidate.old_rule_failure_reason !== "multi_site_without_program_binding") continue
  const prior = cohortById.get(record.resource_id) || {}
  relationships.push({
    relationship_id: createHash("sha256").update(`${record.resource_id}|${candidate.address}|${source.url}`).digest("hex").slice(0, 24),
    resource_id: record.resource_id,
    resource_name: record.name,
    organization: record.organization,
    candidate_address: candidate.address,
    candidate_locality: localityFor(candidate, record.locality),
    source_url: source.url,
    source_type: source.url.includes("bc.211.ca/agency-details/") ? "bc211_agency_detail" : source.url.includes("bc.211.ca/result/") ? "bc211_service_result" : "official_provider_page",
    insufficient_reason: candidate.old_rule_failure_reason,
    site_branch_label: labelFor(candidate),
    source_fingerprint: source.source_fingerprint,
    previous_search_attempts: { discovery_candidates: prior.discovery_candidates || [], source_attempts: prior.attempts || [] },
    bounded_source_context: candidate.context,
    state: "pending",
    verification_attempts: [],
  })
}
if (relationships.length !== 24) throw new Error(`multi_site_relationship_count_drift:${relationships.length}`)
const artifact = { version: "miller-practical-multi-site-recovery-v1", created_at: new Date().toISOString(), source_diagnostic: diagnostic.version, immutable_relationship_count: 24, resource_count: new Set(relationships.map((item) => item.resource_id)).size, prohibited_sources_retrusted: 0, relationships }
await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ relationships: relationships.length, resources: artifact.resource_count, localities_recovered: relationships.filter((item) => item.candidate_locality).length }, null, 2))
