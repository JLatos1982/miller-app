import { mkdirSync, writeFileSync } from "node:fs"

const report = {
  schema_version: "miller-north-post-improvement-discovery-test-v1",
  assessed_on: "2026-09-07",
  method: "Eight bounded, source-specific public web queries: four direct follow-ups for provisional Listening items and four searches targeting Indigenous media, coroners, human-rights/legal sources and hospital-security/ambulance gaps.",
  queries: 8,
  provisional_items_checked: 4,
  provisional_items_promoted: 0,
  net_new_incident_leads: 0,
  duplicate_existing_events_avoided: 4,
  material_existing_context_candidates: 1,
  findings: [
    { title: "Prince Albert hospital-security response", disposition: "existing_event_new_source_already_known", reason: "APTN reporting describes the SHA internal-review conclusion and intended patient-liaison response; the event is already represented and should not become a duplicate Listening item.", url: "https://www.aptnnews.ca/national-news/hospital-security-guards-actions-did-not-meet-standards-says-saskatchewan-health-authority/" },
    { title: "Cardston Indigenous Hospital Support Services", disposition: "related_operational_context_not_incident_outcome", reason: "The current AHS service page confirms an operational Indigenous support role, but it does not attribute that service to the 2021 complaint and cannot be used as complaint-outcome evidence.", url: "https://www.albertahealthservices.ca/findhealth/Service.aspx?serviceAtFacilityID=1135899" },
    { title: "B.C. birth-alert settlement report", disposition: "existing_systemic_chain_material_legal_update_owner_review", reason: "A 2026 report describes a proposed class-action settlement. It is a potentially material legal/accountability update, not a new incident, and needs the court or settlement document before public projection changes.", url: "https://www.aptnnews.ca/featured/66m-settlement-reached-in-b-c-birth-alerts-class-action/" },
    { title: "B.C. Coroners report access", disposition: "source_adapter_improvement", reason: "The official page explains public-interest and redacted report access. It strengthens the coroner listener's next-document strategy but is not incident evidence.", url: "https://www2.gov.bc.ca/gov/content/life-events/death/coroners-service/report-request" },
  ],
  unresolved: ["No new independent or institutional source was located for the four provisional Listening items.", "Hospital-security and ambulance/paramedic coverage remains sparse in the structured corpus.", "Search-engine absence cannot establish that no response or outcome exists."],
  publication_changes: 0,
  production_writes: 0,
}
const dir = new URL("../artifacts/miller-north/", import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL("miller-north-post-improvement-discovery-test-2026-09-07.json", dir), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(new URL("miller-north-post-improvement-discovery-test-2026-09-07.md", dir), `# Miller North post-improvement discovery test\n\n- Source-specific queries: ${report.queries}\n- Provisional Listening items checked / promoted: ${report.provisional_items_checked} / ${report.provisional_items_promoted}\n- Net-new incident leads: ${report.net_new_incident_leads}\n- Duplicate event records avoided: ${report.duplicate_existing_events_avoided}\n- Material existing-context candidates: ${report.material_existing_context_candidates}\n\n## Findings\n\n${report.findings.map(item => `- [${item.title}](${item.url}) — **${item.disposition.replaceAll("_", " ")}**. ${item.reason}`).join("\n")}\n\n## Limits\n\n${report.unresolved.map(item => `- ${item}`).join("\n")}\n\nNo public projection, incident status or raw evidence was changed.\n`)
console.log(JSON.stringify({ queries: report.queries, checked: report.provisional_items_checked, promoted: report.provisional_items_promoted, net_new: report.net_new_incident_leads, duplicates_avoided: report.duplicate_existing_events_avoided, context_candidates: report.material_existing_context_candidates }))
