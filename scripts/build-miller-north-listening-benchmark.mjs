import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { MILLER_NORTH_LISTENER_ADAPTERS, runMillerNorthListenerCycle, suggestAccountabilityLinks, validateMillerNorthListenerMemory } from "../server/millerNorthListeningPipeline.js"

const read = name => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8"))
const listening = read("miller-north-live-listening-public-v1.json")
const evidence = read("indigenous-healthcare-evidence-groups-public-v1.json")
const watch = read("miller-north-accountability-watch-v1.json")
const evidenceByUrl = new Map(evidence.groups.flatMap(group => group.sources.map(source => [source.url, group.public_record_id])))
const adapterFor = source => /APTN|IndigiNews|First Nations|Métis|Metis|Nation/i.test(`${source.organization} ${source.title}`) ? "indigenous_media" : /tribunal|human rights/i.test(`${source.organization} ${source.title}`) ? "human_rights" : /court|CanLII|law/i.test(`${source.organization} ${source.title}`) ? "courts" : /coroner|fatality|inquest/i.test(`${source.organization} ${source.title}`) ? "coroners_inquests" : /college|regulator|disciplin/i.test(`${source.organization} ${source.title}`) ? "regulators" : /government|legislative|hansard|ministry/i.test(`${source.organization} ${source.title}`) ? "government_legislature" : "health_system"
const observations = listening.items.flatMap(item => item.sources.map(source => ({ adapter_id: adapterFor(source), url: source.url, title: source.title, publication_date: source.publication_date, summary: item.summary, province: item.province, facility: item.facility, event_date: item.event_date, event_year: item.event_year, event_type: item.title, relevance: item.linked_evidence_group_id || evidenceByUrl.has(source.url) ? "relevant_existing_incident" : "potentially_relevant", related_incident_id: item.linked_evidence_group_id || evidenceByUrl.get(source.url) || null, verification_state: item.evidence_state })))
const first = runMillerNorthListenerCycle(observations, undefined, { checkedAt: "2026-09-07T12:00:00.000Z" })
validateMillerNorthListenerMemory(first)
const replay = runMillerNorthListenerCycle(observations, first, { checkedAt: "2026-09-07T12:05:00.000Z" })
validateMillerNorthListenerMemory(replay)

const outcomeSignals = item => {
  const text = `${item.summary} ${item.sources.map(source => `${source.title} ${source.role}`).join(" ")}`.toLowerCase()
  const labels = []
  if (/investigat|internal review|independent review/.test(text)) labels.push("investigation_or_review_referenced")
  if (/human.rights|tribunal/.test(text)) labels.push("human_rights_process_referenced")
  if (/lawsuit|court|legal/.test(text)) labels.push("legal_process_referenced")
  if (/coroner|inquest/.test(text)) labels.push("coroner_or_inquest_referenced")
  if (/policy|training|barr?ed|standards|corrective/.test(text)) labels.push("institutional_or_policy_response_referenced")
  return labels
}
const nextAction = item => item.evidence_state === "verification_in_progress" ? "Locate an independent or institutional source that addresses the same event, preserving the difference between an account and a finding." : item.linked_evidence_group_id ? "Check the linked Evidence Library group for a newer institutional, regulatory or legal outcome." : "Reconcile this signal against the Evidence Library by event date, facility, location and allegation type before considering any promotion."
const records = listening.items.map(item => {
  const sourceLinked = item.sources.map(source => evidenceByUrl.get(source.url)).filter(Boolean)
  const links = suggestAccountabilityLinks(item, watch.chains)
  return {
    listening_item_id: item.listening_item_id,
    status_before: item.evidence_state,
    status_after: item.evidence_state,
    what_happened: item.summary,
    where: [item.facility, item.municipality, item.province].filter(Boolean).join(" · "),
    when: item.event_date || item.date_label,
    already_represented_elsewhere: item.linked_evidence_group_id || sourceLinked[0] || null,
    strongest_primary_source: item.sources[0],
    independent_corroboration: item.sources.slice(1),
    institutional_response: /response|review|investigat|barr?ed|apolog/i.test(item.summary) ? "A response or review is described in the public summary; inspect the cited source for its exact scope." : "No separate institutional response is established by the publication-safe item.",
    public_processes_referenced: outcomeSignals(item),
    accountability_link_suggestions: links,
    highest_value_next_action: nextAction(item),
    benchmark_disposition: item.evidence_state === "verification_in_progress" ? "provisional" : item.evidence_state === "linked_existing_incident" ? "duplicate_existing_event" : "corroborated",
  }
})
const count = status => records.filter(item => item.benchmark_disposition === status).length
const report = { schema_version: "miller-north-listening-queue-benchmark-v1", assessed_on: "2026-09-07", queue_items: records.length, status_before: listening.metrics, status_after: { public_projection_changes: 0, corroborated: count("corroborated"), provisional: count("provisional"), duplicate_existing_event: count("duplicate_existing_event") }, listener_adapters: MILLER_NORTH_LISTENER_ADAPTERS, listener_memory_test: { initial_cycle: first.metrics, identical_replay: replay.metrics, documents_remembered: Object.keys(replay.documents).length }, accountability_link_suggestions: records.flatMap(item => item.accountability_link_suggestions).length, owner_review_required: records.flatMap(item => item.accountability_link_suggestions).length, records, publication_writes: 0 }
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("miller-north-listener-memory-v1.json", dir), `${JSON.stringify(replay, null, 2)}\n`)
writeFileSync(new URL("miller-north-listening-queue-benchmark-2026-09-07.json", dir), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(new URL("miller-north-listening-queue-benchmark-2026-09-07.md", dir), `# Miller North Listening queue benchmark\n\nAll ${records.length} publication-safe Listening items were run through the same bounded questions. No status was promoted by this benchmark.\n\n- Corroborated items: ${count("corroborated")}\n- Provisional / verification in progress: ${count("provisional")}\n- Already-linked event: ${count("duplicate_existing_event")}\n- Suggested accountability links requiring owner review: ${report.accountability_link_suggestions}\n- Source documents remembered: ${report.listener_memory_test.documents_remembered}\n- Identical replay returned as new: ${replay.metrics.documents_new}\n\n## Per-item review\n\n${records.map(item => `### ${item.listening_item_id}\n\n- Status: ${item.status_before} → ${item.status_after}\n- Disposition: ${item.benchmark_disposition}\n- What happened: ${item.what_happened}\n- Where: ${item.where}\n- When: ${item.when}\n- Existing representation: ${item.already_represented_elsewhere || "not established"}\n- Primary source: [${item.strongest_primary_source.title}](${item.strongest_primary_source.url})\n- Independent corroboration: ${item.independent_corroboration.length}\n- Institutional response: ${item.institutional_response}\n- Public processes: ${item.public_processes_referenced.join(", ") || "not established"}\n- Accountability suggestions: ${item.accountability_link_suggestions.map(link => `${link.chain_id} (${link.confidence}; owner review)`).join(", ") || "none"}\n- Next: ${item.highest_value_next_action}`).join("\n\n")}\n`)
console.log(JSON.stringify({ queue: records.length, corroborated: count("corroborated"), provisional: count("provisional"), linked: count("duplicate_existing_event"), source_documents: Object.keys(replay.documents).length, duplicate_replay_new: replay.metrics.documents_new, accountability_suggestions: report.accountability_link_suggestions }))
