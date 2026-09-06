import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const regions = ["british_columbia", "alberta", "saskatchewan"]
const sourceEntries = new Map()
const known = /penny kerrigan|kitimat|sarah morrison|ronald luft|connor sutton|myra crow chief|pearl gambler|marissa smoke|thomas favel|janelle orcherton|brydon lafavour/i
const namedHigh = /leo manson|anne ketlo|geraldine thomas-flurer|mona johnson|jaali sutherland-weenie/i
const policy = /\b(report|study|survey|prevalence|statistics|systemic|framework|recommendation|policy|ombudsperson report|research)\b/i
const individual = /\b(patient|family|woman|man|mother|elder|complaint|lawsuit|died|death|hospital|emergency)\b/i
const discrimination = /\b(racism|racist|anti-indigenous|discrimination|culturally unsafe)\b/i

for (const province of regions) {
  const manifest = JSON.parse(readFileSync(`artifacts/miller-north/reconstructed-corpus-v2-${province}-query-checkpoint.json`, "utf8"))
  for (const [url, entry] of Object.entries(manifest.sources || {})) {
    const assessment = entry.assessment
    if (!assessment) continue
    const current = sourceEntries.get(url) || { url, provinces: [], query_ids: [], title: assessment.title || "", excerpt: assessment.tavily_excerpt || assessment.evidence_excerpt || "" }
    current.provinces = [...new Set([...current.provinces, province])]
    current.query_ids = [...new Set([...current.query_ids, ...(entry.query_ids || [])])]
    if (!current.title) current.title = assessment.title || ""
    if (!current.excerpt) current.excerpt = assessment.tavily_excerpt || assessment.evidence_excerpt || ""
    sourceEntries.set(url, current)
  }
}

const triaged = [...sourceEntries.values()].map(source => {
  const text = `${source.title} ${source.excerpt}`.replace(/\s+/g, " ").slice(0, 1500)
  let classification = "insufficient_detail", reason = "No bounded source signal establishes a separable patient event."
  if (known.test(text)) {
    classification = "duplicate_known_case"
    reason = "Matches a current private proposal by publicly reported case, facility, or distinctive facts."
  } else if (namedHigh.test(text)) {
    classification = "high_incident_likelihood"
    reason = "Names a publicly reported patient and describes facility-specific care, a patient account, and racism/discrimination context."
  } else if (policy.test(text) && !individual.test(text)) {
    classification = "policy_review"
    reason = "Appears to address policy, review, research, or system-level evidence rather than a separable incident."
  } else if (policy.test(text)) {
    classification = "systemic_context"
    reason = "Contains individual-related terms but is primarily a systemic, research, or policy source until a specific account is verified."
  } else if (individual.test(text) && discrimination.test(text)) {
    classification = "medium_incident_likelihood"
    reason = "Contains patient/event and discrimination signals, but needs full-source verification before incident staging."
  }
  return { ...source, classification, reason }
}).sort((a, b) => {
  const rank = { high_incident_likelihood: 0, medium_incident_likelihood: 1, duplicate_known_case: 2, systemic_context: 3, policy_review: 4, insufficient_detail: 5 }
  return rank[a.classification] - rank[b.classification] || a.title.localeCompare(b.title)
})

const report = { schema_version: "miller-north-flagged-source-triage-v1", generated_at: new Date().toISOString(), source_entries_before_url_deduplication: 113, unique_sources: triaged.length, classification_counts: Object.fromEntries(["high_incident_likelihood", "medium_incident_likelihood", "systemic_context", "policy_review", "insufficient_detail", "duplicate_known_case"].map(key => [key, triaged.filter(item => item.classification === key).length])), sources: triaged }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-flagged-source-triage.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ unique_sources: report.unique_sources, classification_counts: report.classification_counts, highest_ranked: triaged.filter(item => item.classification === "high_incident_likelihood").map(item => item.title) }, null, 2))
