import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { generateDossierOwnerReport, generateDossierResearchBrief, validateResearchDossierSet } from "../server/farmResearchDossier.js"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const root = dirname(scriptDirectory)
const farmArtifacts = join(root, "artifacts", "farm")
const readJson = filename => JSON.parse(readFileSync(join(farmArtifacts, filename), "utf8"))
const write = (filename, content) => writeFileSync(join(farmArtifacts, filename), content.endsWith("\n") ? content : `${content}\n`)

const registry = readJson("open-government-source-registry-2026-09-06.json")
const inputs = [
  {
    slug: "new-roads",
    dossier: readJson("research-dossier-new-roads-2026-09-06.json"),
  },
  {
    slug: "creekside-road-to-recovery",
    dossier: readJson("research-dossier-creekside-road-to-recovery-2026-09-06.json"),
  },
  {
    slug: "fnho-governance-funding",
    dossier: readJson("research-dossier-fnho-governance-funding-2026-09-06.json"),
  },
  {
    slug: "in-plain-sight-reporting",
    dossier: readJson("research-dossier-in-plain-sight-reporting-2026-09-06.json"),
  },
]

const validation = validateResearchDossierSet(inputs.map(item => item.dossier), registry)

for (const { slug, dossier } of inputs) {
  write(`research-dossier-${slug}-2026-09-06.md`, generateDossierOwnerReport(dossier))
  write(`research-brief-${slug}-2026-09-06.md`, generateDossierResearchBrief(dossier))
}

const timelines = {
  schema_version: "farm-research-dossier-timelines-v1",
  research_date: "2026-09-06",
  publication_scope: "private_owner_review",
  production_mutations: 0,
  publication_mutations: 0,
  dossiers: inputs.map(({ dossier }) => ({
    dossier_id: dossier.dossier_id,
    domain: dossier.identity.domain,
    subject: dossier.identity.canonical_name,
    timeline: dossier.timeline,
  })),
  summary: {
    dossiers: validation.dossiers,
    timeline_events: validation.timeline_events,
  },
}
write("farm-research-dossier-timelines-2026-09-06.json", JSON.stringify(timelines, null, 2))

const evidenceMaps = inputs.map(({ dossier }) => {
  const lines = dossier.evidence_graph.edges.map(edge => {
    const scope = [edge.context_scope, edge.funding_scope, edge.implementation_state].filter(Boolean).join("; ")
    return `- \`${edge.from_object_id}\` → **${edge.relationship_type}** → \`${edge.to_object_id}\` — ${edge.neutral_summary} Confidence: ${edge.confidence}${scope ? `; scope: ${scope}` : ""}. Sources: ${edge.source_references.map(id => `\`${id}\``).join(", ")}.`
  })
  return `## ${dossier.identity.canonical_name}\n\n${lines.join("\n")}`
})
write("farm-research-dossier-evidence-edge-maps-2026-09-06.md", `# Private Research Dossier Evidence-Edge Maps\n\nEvery edge below is backed by one or more source IDs in its dossier. Nodes remain references to the separate Miller or Miller North domain objects; this artifact does not create a merged subject dataset.\n\n${evidenceMaps.join("\n\n")}`)

const gapSections = inputs.map(({ dossier }) => `## ${dossier.identity.canonical_name}\n\n${dossier.unresolved_questions.map(gap => `- **${gap.priority} / ${gap.gap_type}:** ${gap.question} ${gap.rationale}`).join("\n")}`)
write("farm-research-dossier-knowledge-gap-review-2026-09-06.md", `# Private Research Dossier Knowledge-Gap Review\n\nThese are bounded research questions, not adverse findings. No information requests were sent.\n\n${gapSections.join("\n\n")}`)

const foiSections = inputs.map(({ dossier }) => `## ${dossier.identity.canonical_name}\n\n${dossier.foi_candidates.length ? dossier.foi_candidates.map(candidate => `### ${candidate.candidate_id}\n\n- Status: ${candidate.status}\n- Likely record holder: ${candidate.organization}\n- Missing information: ${candidate.exact_missing_information}\n- Date range: ${candidate.bounded_date_range}\n- Why it matters: ${candidate.why_it_matters}\n- Narrow record category: ${candidate.suggested_record_category}\n- Safeguards: ${candidate.exclusions.join(", ")}\n- Public source IDs already checked: ${candidate.public_sources_checked.join(", ")}`).join("\n\n") : "No draft information-request concept."}`)
write("farm-research-dossier-foi-candidate-review-2026-09-06.md", `# Private Dossier Information-Request Candidate Review\n\nThese are draft research concepts only. No request was prepared for filing or sent. They exclude private patient information, individual complaint/case records and unnecessary personal information.\n\n${foiSections.join("\n\n")}`)

write("farm-research-dossier-validation-2026-09-06.json", JSON.stringify({
  schema_version: "farm-research-dossier-validation-v1",
  publication_scope: "private_validation_only",
  ...validation,
  source_registry_families: registry.sources.length,
  production_mutations: 0,
  publication_mutations: 0,
}, null, 2))

process.stdout.write(`${JSON.stringify(validation)}\n`)
