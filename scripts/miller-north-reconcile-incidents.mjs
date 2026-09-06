import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { loadReconstructedCorpus, MILLER_NORTH_RECONSTRUCTED_CORPUS_ID } from "../server/millerNorthCorpus.js"
import { analyzeRepeatedSourceGroups, proposalIncidentEntity } from "../server/millerNorthIncidentReconciliation.js"

const { records } = loadReconstructedCorpus(), groups = analyzeRepeatedSourceGroups(records)
const staged = JSON.parse(readFileSync("artifacts/miller-north/reconstructed-corpus-v2-new-incident-proposals.json", "utf8")).candidates || []
const incidents = staged.map(proposalIncidentEntity)
const report = { generated_at: new Date().toISOString(), corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, mode: "proposal_only_non_destructive", repeated_source_groups_analyzed: groups.length, evidence_records_analyzed: groups.reduce((sum, group) => sum + group.evidence_record_ids.length, 0), relationship_counts: Object.fromEntries(["same_incident", "probable_same_incident", "same_source_different_incident", "related_context_not_same_incident", "distinct_incident", "insufficient_identity"].map(key => [key, groups.filter(group => group.relationship === key).length])), proposed_incident_entities_created: incidents.length, evidence_records_attached_to_proposed_incidents: incidents.reduce((sum, incident) => sum + incident.source_evidence_record_ids.length, 0), estimated_distinct_incidents_in_analyzed_subset: incidents.length, groups }
mkdirSync("artifacts/miller-north", { recursive: true })
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-incident-proposals.json", `${JSON.stringify({ schema_version: "miller-north-incident-proposals-v2", corpus_id: MILLER_NORTH_RECONSTRUCTED_CORPUS_ID, incidents }, null, 2)}\n`)
writeFileSync("artifacts/miller-north/reconstructed-corpus-v2-incident-reconciliation-report.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ repeated_source_groups_analyzed: report.repeated_source_groups_analyzed, evidence_records_analyzed: report.evidence_records_analyzed, relationship_counts: report.relationship_counts, proposed_incident_entities_created: incidents.length }, null, 2))
